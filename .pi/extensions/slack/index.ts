// Pi extension factory for Slack: wires SlackBot, ChannelStore, EventsWatcher,
// allowlist, SlackContext, and the four slack_* tools into a single Pi
// extension lifecycle. Bridges inbound Slack events into pi.sendUserMessage()
// and posts assistant turn output back to Slack via SlackContext.
import os from "node:os";
import path from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import type {
	ExtensionAPI,
	ExtensionContext,
	SessionStartEvent,
	SessionShutdownEvent,
	TurnEndEvent,
} from "@mariozechner/pi-coding-agent";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { SlackBot, type SlackEvent } from "./client.js";
import { ChannelStore } from "./store.js";
import { EventsWatcher, createEventsWatcher } from "./events.js";
import { createSlackContext } from "./context.js";
import { registerSlackTools } from "./tools.js";
import { createAllowlist, type Allowlist } from "./allowlist.js";
import { downloadChannel } from "./download.js";
import * as log from "./log.js";

// Lifted to module scope so the bridge closure can read the latest values
// across reloads without re-binding the SlackBot.
type Ctx = ExtensionContext;

export default function (pi: ExtensionAPI): void {
	// --------------------------------------------------------------------------
	// Closure state
	// --------------------------------------------------------------------------
	let bot: SlackBot | undefined;
	let store: ChannelStore | undefined;
	let eventsWatcher: EventsWatcher | undefined;
	let allowlist: Allowlist | undefined;

	// Bridge state — set on each inbound Slack event; read by tools.ts getters
	// and by turn_end to know where to post the assistant's reply.
	let currentChannel: string | undefined;
	let currentThread: string | undefined;

	// Refreshed on every session_start so the bridge always uses the live ctx.
	let currentCtx: Ctx | undefined;

	// Per-turn flag: set if the agent invoked any slack_* tool during the turn.
	// turn_end uses this to avoid double-posting (the tool already replied).
	let slackToolUsedThisTurn = false;

	// --------------------------------------------------------------------------
	// Helpers
	// --------------------------------------------------------------------------

	/**
	 * Pull plain text from an AgentMessage. AssistantMessage.content is an array
	 * of TextContent | ThinkingContent | ToolCall — only TextContent has user-
	 * facing text we want to post to Slack. UserMessage.content can be a string
	 * or an array of TextContent | ImageContent.
	 */
	function extractAssistantText(message: AgentMessage): string {
		// Only post for assistant messages
		if (!message || (message as { role?: string }).role !== "assistant") return "";
		const content = (message as { content?: unknown }).content;
		if (typeof content === "string") return content;
		if (!Array.isArray(content)) return "";
		const parts: string[] = [];
		for (const block of content) {
			if (block && typeof block === "object" && (block as { type?: string }).type === "text") {
				const t = (block as { text?: unknown }).text;
				if (typeof t === "string" && t.length > 0) parts.push(t);
			}
		}
		return parts.join("\n").trim();
	}

	/**
	 * Inbound Slack -> Pi bridge. Allowlist gates, then injects as a user message.
	 * The slack_* tools and the turn_end handler later read currentChannel/Thread
	 * to send the response back to Slack.
	 */
	async function bridge(event: SlackEvent): Promise<void> {
		if (!allowlist || !allowlist.isAllowed(event.channel, event.user)) {
			return; // allowlist denies by default; silently drop
		}

		currentChannel = event.channel;
		currentThread = event.threadTs ?? event.ts;

		const text = `[Slack #${event.channel}] ${event.user}: ${event.text}`;
		const ctx = currentCtx;
		try {
			if (ctx && ctx.isIdle()) {
				pi.sendUserMessage(text);
			} else {
				// sendUserMessage throws if streaming and deliverAs is omitted.
				pi.sendUserMessage(text, { deliverAs: "followUp" });
			}
		} catch (err) {
			console.error("[slack] bridge inject failed", err);
		}
	}

	// --------------------------------------------------------------------------
	// session_start
	// --------------------------------------------------------------------------
	pi.on("session_start", async (_event: SessionStartEvent, ctx: ExtensionContext) => {
		currentCtx = ctx;

		const appToken = process.env.SLACK_APP_TOKEN;
		const botToken = process.env.SLACK_BOT_TOKEN;
		if (!appToken || !botToken) {
			const msg = "Slack extension: missing SLACK_APP_TOKEN/SLACK_BOT_TOKEN; not connecting";
			if (ctx.hasUI) {
				ctx.ui.notify(msg, "warning");
			} else {
				log.logWarning(msg);
			}
			return;
		}

		// Already initialized in this process? (e.g. session_start fires for a
		// reload) — bail out before constructing duplicate sockets.
		if (bot) {
			log.logInfo("Slack extension: already connected, skipping re-init");
			return;
		}

		const baseDir = process.env.SLACK_BASE_DIR
			? process.env.SLACK_BASE_DIR
			: path.join(os.homedir(), ".pi", "cache", "slack");
		if (!existsSync(baseDir)) {
			mkdirSync(baseDir, { recursive: true });
		}

		allowlist = createAllowlist();
		store = new ChannelStore({ baseDir, botToken });

		// Construct bot — eventHandler is first positional, config is second.
		bot = new SlackBot(bridge, {
			appToken,
			botToken,
			workingDir: baseDir,
			store,
		});

		// Start Slack Socket Mode + Web API. This also runs SlackBot's internal
		// channel backfill for any channel that already has a log.jsonl.
		try {
			await bot.start();
		} catch (err) {
			log.logWarning("Slack extension: failed to start bot", err instanceof Error ? err.message : String(err));
			bot = undefined;
			return;
		}

		// Optional full-history download via download.ts (slow; off by default).
		// SLACK_BACKFILL=<channelId>[,<channelId>...] enables this. Allowlist still applies.
		if (process.env.SLACK_BACKFILL) {
			const channels = process.env.SLACK_BACKFILL.split(",").map((s) => s.trim()).filter(Boolean);
			for (const ch of channels) {
				if (!allowlist.isAllowed(ch, "EVENT")) {
					log.logWarning(`SLACK_BACKFILL: channel ${ch} not allowed, skipping`);
					continue;
				}
				try {
					await downloadChannel(ch, botToken);
				} catch (err) {
					log.logWarning(
						`SLACK_BACKFILL: failed for ${ch}`,
						err instanceof Error ? err.message : String(err),
					);
				}
			}
		}

		// Cron/event watcher: drives synthetic SlackEvents into the same bridge.
		eventsWatcher = createEventsWatcher(baseDir, bridge);
		eventsWatcher.start();

		// Register the four slack_* tools (slack_post, slack_reply, slack_react, slack_upload)
		registerSlackTools(
			pi,
			bot,
			() => currentChannel,
			() => currentThread,
		);

		// Persist a marker so reloads can detect prior connection state if needed.
		pi.appendEntry("slack-extension-state", { connectedAt: Date.now(), baseDir });
	});

	// --------------------------------------------------------------------------
	// tool_execution_end — note any slack_* tool use to avoid double-posting
	// --------------------------------------------------------------------------
	pi.on("tool_execution_end", async (event) => {
		if (event.toolName && event.toolName.startsWith("slack_")) {
			slackToolUsedThisTurn = true;
		}
	});

	// --------------------------------------------------------------------------
	// turn_end — post assistant text back to Slack if the turn didn't already
	// --------------------------------------------------------------------------
	pi.on("turn_end", async (event: TurnEndEvent, _ctx: ExtensionContext) => {
		try {
			// If the agent already used slack_post / slack_reply / etc, don't double-post.
			if (slackToolUsedThisTurn) {
				slackToolUsedThisTurn = false;
				return;
			}

			if (!bot || !currentChannel) return;

			const assistantText = extractAssistantText(event.message);
			if (!assistantText) return;

			const syntheticEvent: SlackEvent = {
				type: "mention",
				channel: currentChannel,
				user: "pi-agent",
				text: "",
				ts: "0",
				threadTs: currentThread,
			};
			// isEvent=true keeps respond() from promoting ts="0" into a thread parent.
			const slackCtx = createSlackContext(bot, syntheticEvent, true);
			await slackCtx.respond(assistantText);
			await slackCtx.setWorking(false);
		} catch (err) {
			log.logWarning(
				"Slack extension: turn_end post-back failed",
				err instanceof Error ? err.message : String(err),
			);
		}
	});

	// --------------------------------------------------------------------------
	// session_shutdown — close sockets, stop watchers, clear state
	// --------------------------------------------------------------------------
	pi.on("session_shutdown", async (_event: SessionShutdownEvent, _ctx: ExtensionContext) => {
		try {
			if (eventsWatcher) {
				eventsWatcher.stop();
			}
		} catch (err) {
			log.logWarning(
				"Slack extension: events watcher stop failed",
				err instanceof Error ? err.message : String(err),
			);
		}
		try {
			if (bot) {
				await bot.stop();
			}
		} catch (err) {
			log.logWarning(
				"Slack extension: bot stop failed",
				err instanceof Error ? err.message : String(err),
			);
		}
		// ChannelStore has no flush() — appendFile is awaited per call already.
		bot = undefined;
		store = undefined;
		eventsWatcher = undefined;
		allowlist = undefined;
		currentChannel = undefined;
		currentThread = undefined;
		currentCtx = undefined;
		slackToolUsedThisTurn = false;
	});
}
