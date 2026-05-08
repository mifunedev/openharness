import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSlackContext } from "../context.js";
import type { SlackEvent } from "../client.js";

// ---------------------------------------------------------------------------
// Minimal SlackBot mock — only the methods context.ts calls are needed.
// ---------------------------------------------------------------------------

function makeBot() {
	const postMessage = vi.fn().mockResolvedValue("msg-ts-1");
	const postInThread = vi.fn().mockResolvedValue("thread-ts-1");
	const updateMessage = vi.fn().mockResolvedValue(undefined);
	const deleteMessage = vi.fn().mockResolvedValue(undefined);
	const uploadFile = vi.fn().mockResolvedValue(undefined);
	const logBotResponse = vi.fn();

	return {
		postMessage,
		postInThread,
		updateMessage,
		deleteMessage,
		uploadFile,
		logBotResponse,
	} as unknown as import("../client.js").SlackBot;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeEvent(overrides: Partial<SlackEvent> = {}): SlackEvent {
	return {
		type: "mention",
		channel: "C123",
		user: "U456",
		text: "hello",
		ts: "1700000000.000001",
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// Thread routing rules (context.ts line 45):
//   const threadParent = event.threadTs ?? (isEvent ? undefined : event.ts);
// ---------------------------------------------------------------------------

describe("createSlackContext — threadParent routing", () => {
	describe("Case A: event.threadTs set, isEvent=false (real Slack thread message)", () => {
		it("responds via postInThread using event.threadTs as threadParent", async () => {
			const bot = makeBot();
			const event = makeEvent({ threadTs: "1700000000.000000" });
			const ctx = createSlackContext(bot, event, false);

			await ctx.respond("hello from thread");

			expect(bot.postInThread).toHaveBeenCalledOnce();
			const [channel, threadParent] = (bot.postInThread as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(channel).toBe("C123");
			expect(threadParent).toBe("1700000000.000000"); // event.threadTs
			expect(bot.postMessage).not.toHaveBeenCalled();
		});
	});

	describe("Case B: event.threadTs set, isEvent=true (synthetic event with explicit threadTs)", () => {
		it("responds via postInThread using event.threadTs as threadParent", async () => {
			const bot = makeBot();
			const event = makeEvent({ threadTs: "1700000000.000000" });
			const ctx = createSlackContext(bot, event, true);

			await ctx.respond("synthetic in thread");

			expect(bot.postInThread).toHaveBeenCalledOnce();
			const [channel, threadParent] = (bot.postInThread as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(channel).toBe("C123");
			expect(threadParent).toBe("1700000000.000000"); // event.threadTs wins
			expect(bot.postMessage).not.toHaveBeenCalled();
		});
	});

	describe("Case C: event.threadTs undefined, isEvent=false (real Slack message at channel root)", () => {
		it("responds via postInThread using event.ts as threadParent", async () => {
			const bot = makeBot();
			const event = makeEvent({ ts: "1700000000.000001" }); // no threadTs
			const ctx = createSlackContext(bot, event, false);

			await ctx.respond("root message reply");

			expect(bot.postInThread).toHaveBeenCalledOnce();
			const [channel, threadParent] = (bot.postInThread as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(channel).toBe("C123");
			expect(threadParent).toBe("1700000000.000001"); // falls back to event.ts
			expect(bot.postMessage).not.toHaveBeenCalled();
		});
	});

	describe("Case D: event.threadTs undefined, isEvent=true (synthetic event, no thread)", () => {
		it("responds via postMessage (channel root) — no thread anchor for synthetic events", async () => {
			const bot = makeBot();
			const event = makeEvent({ ts: "1700000000.000001" }); // no threadTs
			const ctx = createSlackContext(bot, event, true);

			await ctx.respond("synthetic channel-root reply");

			// threadParent === undefined, so postMessage is used
			expect(bot.postMessage).toHaveBeenCalledOnce();
			const [channel] = (bot.postMessage as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(channel).toBe("C123");
			expect(bot.postInThread).not.toHaveBeenCalled();
		});
	});

	describe("setTyping respects the same threadParent routing", () => {
		it("posts typing indicator in-thread when threadTs is set", async () => {
			const bot = makeBot();
			const event = makeEvent({ threadTs: "1700000000.000000" });
			const ctx = createSlackContext(bot, event, false);

			await ctx.setTyping(true);

			expect(bot.postInThread).toHaveBeenCalledOnce();
			expect(bot.postMessage).not.toHaveBeenCalled();
		});

		it("posts typing indicator to channel root when isEvent=true and no threadTs", async () => {
			const bot = makeBot();
			const event = makeEvent(); // no threadTs
			const ctx = createSlackContext(bot, event, true);

			await ctx.setTyping(true);

			expect(bot.postMessage).toHaveBeenCalledOnce();
			expect(bot.postInThread).not.toHaveBeenCalled();
		});
	});
});
