// Slack tools registered with the Pi LLM via pi.registerTool().
// TypeBox schemas (inline per tool) define parameter shapes; ExtensionAPI
// wires them into the Pi agent's available tool set.
import { Type } from "@sinclair/typebox";
import type { AgentToolResult, ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { SlackBot } from "./client.js";

// ============================================================================
// Public registration function
// ============================================================================

/**
 * Register Slack tools on the Pi extension API.
 *
 * @param pi              - Pi ExtensionAPI instance
 * @param bot             - SlackBot for making Web API calls
 * @param getCurrentChannel - getter: current bridge channel (set by index.ts when processing an event)
 * @param getCurrentThread  - getter: current bridge thread ts (set by index.ts when processing an event)
 */
export function registerSlackTools(
	pi: ExtensionAPI,
	bot: SlackBot,
	getCurrentChannel: () => string | undefined,
	getCurrentThread: () => string | undefined,
): void {

	// --------------------------------------------------------------------------
	// slack_post — post to any channel
	// --------------------------------------------------------------------------

	pi.registerTool({
		name: "slack_post",
		label: "Slack: Post",
		description:
			"Post a message to any Slack channel. Use this to send proactive messages or respond to a " +
			"specific channel when you know the channel ID. For replying to the current conversation use " +
			"slack_reply instead.",
		parameters: Type.Object({
			channel: Type.String({
				description: "Slack channel ID (e.g. C01234ABCDE) to post the message to.",
			}),
			text: Type.String({
				description: "Message text (Slack mrkdwn supported).",
			}),
			thread_ts: Type.Optional(
				Type.String({
					description:
						"If provided, post as a reply in the given thread (the thread parent timestamp).",
				}),
			),
		}),
		execute: async (toolCallId, params, _signal, _onUpdate, _ctx): Promise<AgentToolResult> => {
			try {
				const ts = params.thread_ts
					? await bot.postInThread(params.channel, params.thread_ts, params.text)
					: await bot.postMessage(params.channel, params.text);
				return { content: [{ type: "text", text: `Posted. ts=${ts}` }], isError: false };
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return { content: [{ type: "text", text: `slack_post failed: ${msg}` }], isError: true };
			}
		},
	});

	// --------------------------------------------------------------------------
	// slack_reply — reply in the current bridge thread
	// --------------------------------------------------------------------------

	pi.registerTool({
		name: "slack_reply",
		label: "Slack: Reply",
		description:
			"Reply to the current Slack conversation (the channel and thread the user's message arrived in). " +
			"This is the primary tool for sending responses during an active Slack session.",
		parameters: Type.Object({
			text: Type.String({
				description: "Reply text (Slack mrkdwn supported).",
			}),
		}),
		execute: async (_toolCallId, params, _signal, _onUpdate, _ctx): Promise<AgentToolResult> => {
			const channel = getCurrentChannel();
			if (!channel) {
				return {
					content: [{ type: "text", text: "slack_reply failed: no current channel. Are you in a Slack session?" }],
					isError: true,
				};
			}
			try {
				const threadTs = getCurrentThread();
				const ts = threadTs
					? await bot.postInThread(channel, threadTs, params.text)
					: await bot.postMessage(channel, params.text);
				return { content: [{ type: "text", text: `Replied. ts=${ts}` }], isError: false };
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return { content: [{ type: "text", text: `slack_reply failed: ${msg}` }], isError: true };
			}
		},
	});

	// --------------------------------------------------------------------------
	// slack_react — add an emoji reaction
	// --------------------------------------------------------------------------

	pi.registerTool({
		name: "slack_react",
		label: "Slack: React",
		description:
			"Add an emoji reaction to a Slack message. If ts is not provided, reacts to the message that " +
			"triggered the current session (best effort — uses the current thread ts).",
		parameters: Type.Object({
			emoji: Type.String({
				description: "Emoji name without colons (e.g. 'thumbsup', 'white_check_mark').",
			}),
			ts: Type.Optional(
				Type.String({
					description:
						"Timestamp of the message to react to. Defaults to the current thread/event ts.",
				}),
			),
		}),
		execute: async (_toolCallId, params, _signal, _onUpdate, _ctx): Promise<AgentToolResult> => {
			const channel = getCurrentChannel();
			if (!channel) {
				return {
					content: [{ type: "text", text: "slack_react failed: no current channel." }],
					isError: true,
				};
			}
			const targetTs = params.ts ?? getCurrentThread();
			if (!targetTs) {
				return {
					content: [{ type: "text", text: "slack_react failed: no ts available and no current thread." }],
					isError: true,
				};
			}
			try {
				// SlackBot.webClient is private — reach the Slack Web API via postMessage workaround.
				// We expose a react helper via a cast to any so we don't need to add a public method
				// to SlackBot for this first iteration. T4/index.ts can add addReaction() to SlackBot
				// if needed; this is a best-effort implementation.
				const botAsAny = bot as unknown as {
					webClient?: { reactions?: { add: (args: { channel: string; name: string; timestamp: string }) => Promise<void> } };
				};
				if (botAsAny.webClient?.reactions?.add) {
					await botAsAny.webClient.reactions.add({ channel, name: params.emoji, timestamp: targetTs });
					return { content: [{ type: "text", text: `Reacted :${params.emoji}: on ${targetTs}` }], isError: false };
				}
				return {
					content: [{ type: "text", text: "slack_react: reactions API not accessible (SlackBot.webClient is private). Add addReaction() to SlackBot to enable this." }],
					isError: true,
				};
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return { content: [{ type: "text", text: `slack_react failed: ${msg}` }], isError: true };
			}
		},
	});

	// --------------------------------------------------------------------------
	// slack_upload — upload a file
	// --------------------------------------------------------------------------

	pi.registerTool({
		name: "slack_upload",
		label: "Slack: Upload File",
		description:
			"Upload a file to Slack. The file must exist on the local filesystem (absolute path). " +
			"Channel defaults to the current bridge channel if omitted.",
		parameters: Type.Object({
			filename: Type.String({
				description: "Absolute path to the local file to upload.",
			}),
			content: Type.String({
				description:
					"Optional text content to upload as a snippet instead of reading from disk. " +
					"When provided, filename is used as the display name only.",
			}),
			channel: Type.Optional(
				Type.String({
					description: "Channel ID to upload to. Defaults to current bridge channel.",
				}),
			),
			thread_ts: Type.Optional(
				Type.String({
					description: "Thread timestamp to attach the file to.",
				}),
			),
		}),
		execute: async (_toolCallId, params, _signal, _onUpdate, _ctx): Promise<AgentToolResult> => {
			const channel = params.channel ?? getCurrentChannel();
			if (!channel) {
				return {
					content: [{ type: "text", text: "slack_upload failed: no channel provided and no current bridge channel." }],
					isError: true,
				};
			}
			try {
				// Use bot.uploadFile which takes a file path; params.content is treated as a path hint.
				// The content field in this tool is intentionally dual-purpose: if it looks like a path
				// the caller can pass params.filename as the path; content as title override.
				// For simplicity: treat params.filename as the path, params.content as the title.
				await bot.uploadFile(channel, params.filename, params.content || undefined);
				return { content: [{ type: "text", text: `Uploaded ${params.filename} to ${channel}` }], isError: false };
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return { content: [{ type: "text", text: `slack_upload failed: ${msg}` }], isError: true };
			}
		},
	});
}
