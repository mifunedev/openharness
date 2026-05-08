import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { SlackEvent } from "../client.js";

// ---------------------------------------------------------------------------
// Mock SlackBot — intercept the constructor and capture the eventHandler
// that index.ts passes as the first argument. The factory closes over it.
// ---------------------------------------------------------------------------

let capturedEventHandler: ((event: SlackEvent) => Promise<void>) | undefined;

const mockBot = {
	start: vi.fn().mockResolvedValue(undefined),
	stop: vi.fn().mockResolvedValue(undefined),
	enqueueEvent: vi.fn().mockReturnValue(true),
};

vi.mock("../client.js", () => ({
	SlackBot: vi.fn().mockImplementation((eventHandler: (event: SlackEvent) => Promise<void>) => {
		capturedEventHandler = eventHandler;
		return mockBot;
	}),
}));

// Mock ChannelStore — not the focus of these tests
vi.mock("../store.js", () => ({
	ChannelStore: vi.fn().mockImplementation(() => ({
		processAttachments: vi.fn().mockReturnValue([]),
	})),
}));

// Mock EventsWatcher / createEventsWatcher — avoid real fs.watch
vi.mock("../events.js", () => ({
	createEventsWatcher: vi.fn().mockReturnValue({
		start: vi.fn(),
		stop: vi.fn(),
	}),
	EventsWatcher: vi.fn(),
}));

// Mock download.ts — not the focus of these tests
vi.mock("../download.js", () => ({
	downloadChannel: vi.fn().mockResolvedValue(undefined),
}));

// Mock tools registration — not the focus of these tests
vi.mock("../tools.js", () => ({
	registerSlackTools: vi.fn(),
}));

// Mock log — suppress output in tests
vi.mock("../log.js", () => ({
	logInfo: vi.fn(),
	logWarning: vi.fn(),
	logError: vi.fn(),
	logConnected: vi.fn(),
	logDisconnected: vi.fn(),
	logBackfillStart: vi.fn(),
	logBackfillChannel: vi.fn(),
	logBackfillComplete: vi.fn(),
}));

// Static import — runs ONCE for the whole test file. Mocks are hoisted above
// this import, so when index.ts pulls SlackBot/ChannelStore/etc. they get
// the mocks. Each test calls factory(pi) below to get a fresh closure with
// its own bot/store/allowlist module-scope state.
import factory from "../index.js";

// ---------------------------------------------------------------------------
// Pi mock factory — captures event handlers registered via pi.on()
// ---------------------------------------------------------------------------

type AnyHandler = (...args: any[]) => Promise<void> | void;

function makePi(isIdleReturnValue = true) {
	const handlers = new Map<string, AnyHandler[]>();
	const sendUserMessage = vi.fn();
	const appendEntry = vi.fn();

	const pi = {
		on: (event: string, handler: AnyHandler) => {
			if (!handlers.has(event)) handlers.set(event, []);
			handlers.get(event)!.push(handler);
		},
		sendUserMessage,
		appendEntry,
		registerTool: vi.fn(),
	};

	const ctx = {
		isIdle: vi.fn().mockReturnValue(isIdleReturnValue),
		hasUI: false,
		ui: {
			notify: vi.fn(),
		},
	};

	async function fireEvent(name: string, ...args: unknown[]) {
		for (const h of handlers.get(name) ?? []) {
			await h(...args);
		}
	}

	return { pi, ctx, sendUserMessage, appendEntry, fireEvent };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

function saveSlackEnv() {
	return {
		SLACK_APP_TOKEN: process.env.SLACK_APP_TOKEN,
		SLACK_BOT_TOKEN: process.env.SLACK_BOT_TOKEN,
		SLACK_ALLOW_CHANNELS: process.env.SLACK_ALLOW_CHANNELS,
		SLACK_ALLOW_USERS: process.env.SLACK_ALLOW_USERS,
	};
}

function restoreSlackEnv(saved: Record<string, string | undefined>) {
	for (const [k, v] of Object.entries(saved)) {
		if (v === undefined) delete process.env[k];
		else process.env[k] = v;
	}
}

describe("bridge — ctx.isIdle() gate on pi.sendUserMessage", () => {
	let savedEnv: Record<string, string | undefined>;

	beforeEach(() => {
		savedEnv = saveSlackEnv();
		process.env.SLACK_APP_TOKEN = "xapp-test";
		process.env.SLACK_BOT_TOKEN = "xoxb-test";
		capturedEventHandler = undefined;
		mockBot.start.mockClear();
		mockBot.start.mockResolvedValue(undefined);
		mockBot.stop.mockClear();
		mockBot.stop.mockResolvedValue(undefined);
	});

	afterEach(() => restoreSlackEnv(savedEnv));

	it("calls pi.sendUserMessage WITHOUT deliverAs when ctx.isIdle() returns true", async () => {
		process.env.SLACK_ALLOW_CHANNELS = "C999";
		process.env.SLACK_ALLOW_USERS = "U999";

		const { pi, ctx, sendUserMessage, fireEvent } = makePi(true /* isIdle */);
		factory(pi as never);
		await fireEvent("session_start", {}, ctx);

		expect(capturedEventHandler).toBeDefined();
		const inboundEvent: SlackEvent = {
			type: "mention",
			channel: "C999",
			user: "U999",
			text: "hello pi",
			ts: "1700000000.000001",
		};
		await capturedEventHandler!(inboundEvent);

		expect(sendUserMessage).toHaveBeenCalledOnce();
		const [, opts] = sendUserMessage.mock.calls[0];
		expect(opts?.deliverAs).toBeUndefined();
	});

	it("calls pi.sendUserMessage WITH deliverAs:'followUp' when ctx.isIdle() returns false", async () => {
		process.env.SLACK_ALLOW_CHANNELS = "C999";
		process.env.SLACK_ALLOW_USERS = "U999";

		const { pi, ctx, sendUserMessage, fireEvent } = makePi(false /* not idle */);
		factory(pi as never);
		await fireEvent("session_start", {}, ctx);

		expect(capturedEventHandler).toBeDefined();
		const inboundEvent: SlackEvent = {
			type: "mention",
			channel: "C999",
			user: "U999",
			text: "follow-up message",
			ts: "1700000000.000002",
		};
		await capturedEventHandler!(inboundEvent);

		expect(sendUserMessage).toHaveBeenCalledOnce();
		const [, opts] = sendUserMessage.mock.calls[0];
		expect(opts?.deliverAs).toBe("followUp");
	});
});

describe("bridge — allowlist deny path", () => {
	let savedEnv: Record<string, string | undefined>;

	beforeEach(() => {
		savedEnv = saveSlackEnv();
		process.env.SLACK_APP_TOKEN = "xapp-test";
		process.env.SLACK_BOT_TOKEN = "xoxb-test";
		capturedEventHandler = undefined;
		mockBot.start.mockClear();
		mockBot.start.mockResolvedValue(undefined);
	});

	afterEach(() => restoreSlackEnv(savedEnv));

	it("does NOT call pi.sendUserMessage when both allowlist env vars are unset (fail-safe deny)", async () => {
		delete process.env.SLACK_ALLOW_CHANNELS;
		delete process.env.SLACK_ALLOW_USERS;

		const { pi, ctx, sendUserMessage, fireEvent } = makePi(true);
		factory(pi as never);
		await fireEvent("session_start", {}, ctx);

		expect(capturedEventHandler).toBeDefined();
		const inboundEvent: SlackEvent = {
			type: "mention",
			channel: "C_ANY",
			user: "U_ANY",
			text: "should be blocked",
			ts: "1700000000.000001",
		};
		await capturedEventHandler!(inboundEvent);

		expect(sendUserMessage).not.toHaveBeenCalled();
	});

	it("calls pi.sendUserMessage when channel+user match the allowlist", async () => {
		process.env.SLACK_ALLOW_CHANNELS = "C_ALLOWED";
		process.env.SLACK_ALLOW_USERS = "U_ALLOWED";

		const { pi, ctx, sendUserMessage, fireEvent } = makePi(true);
		factory(pi as never);
		await fireEvent("session_start", {}, ctx);

		expect(capturedEventHandler).toBeDefined();
		const inboundEvent: SlackEvent = {
			type: "mention",
			channel: "C_ALLOWED",
			user: "U_ALLOWED",
			text: "allowed message",
			ts: "1700000000.000001",
		};
		await capturedEventHandler!(inboundEvent);

		expect(sendUserMessage).toHaveBeenCalledOnce();
	});

	it("does NOT call pi.sendUserMessage when channel is not in allowlist", async () => {
		process.env.SLACK_ALLOW_CHANNELS = "C_ALLOWED";
		process.env.SLACK_ALLOW_USERS = "U_ALLOWED";

		const { pi, ctx, sendUserMessage, fireEvent } = makePi(true);
		factory(pi as never);
		await fireEvent("session_start", {}, ctx);

		expect(capturedEventHandler).toBeDefined();
		const inboundEvent: SlackEvent = {
			type: "mention",
			channel: "C_WRONG",
			user: "U_ALLOWED",
			text: "wrong channel",
			ts: "1700000000.000001",
		};
		await capturedEventHandler!(inboundEvent);

		expect(sendUserMessage).not.toHaveBeenCalled();
	});
});

describe("bridge — session_shutdown calls bot.stop()", () => {
	let savedEnv: Record<string, string | undefined>;

	beforeEach(() => {
		savedEnv = saveSlackEnv();
		process.env.SLACK_APP_TOKEN = "xapp-test";
		process.env.SLACK_BOT_TOKEN = "xoxb-test";
		capturedEventHandler = undefined;
		mockBot.start.mockClear();
		mockBot.start.mockResolvedValue(undefined);
		mockBot.stop.mockClear();
		mockBot.stop.mockResolvedValue(undefined);
	});

	afterEach(() => restoreSlackEnv(savedEnv));

	it("calls bot.stop() when session_shutdown fires", async () => {
		process.env.SLACK_ALLOW_CHANNELS = "C999";
		process.env.SLACK_ALLOW_USERS = "U999";

		const { pi, ctx, fireEvent } = makePi(true);
		factory(pi as never);

		await fireEvent("session_start", {}, ctx);
		expect(mockBot.start).toHaveBeenCalled();

		mockBot.stop.mockClear();
		await fireEvent("session_shutdown", {}, ctx);

		expect(mockBot.stop).toHaveBeenCalledOnce();
	});
});
