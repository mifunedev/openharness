import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import factory, {
  ACKNOWLEDGEMENT,
  BUSY_ACKNOWLEDGEMENT,
  INVALID_ACKNOWLEDGEMENT,
  MAX_CUSTOM_INSTRUCTIONS,
  completionMarker,
  parseSlackCompactRequest,
} from "../index";

type Handler = (event: any, ctx?: any) => Promise<unknown> | unknown;

const NONCE = "0123456789abcdef0123456789abcdef0123456789abcdef";
const stamped = (body: string, transport = "slack") => `[📱 @Ryan via ${transport}]: ${body}`;
const assistant = (...content: any[]) => ({ role: "assistant", content });
const text = (value: string) => ({ type: "text", text: value });
const tool = () => ({ type: "toolCall", id: "tool-1", name: "read", arguments: {} });

function makeHarness() {
  const handlers = new Map<string, Handler[]>();
  const compact = vi.fn();
  const pi = {
    on(event: string, handler: Handler) {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    },
  };
  const fire = async (event: string, payload: any = {}, ctx: any = { compact }) => {
    let result: unknown;
    for (const handler of handlers.get(event) ?? []) result = await handler(payload, ctx);
    return result;
  };
  factory(pi as any);
  return { compact, fire };
}

describe("Slack compact parser", () => {
  it.each([
    "compact session",
    "compact current session",
    "compact the current session",
    "COMPACT SESSION",
    "Compact The Current Session",
    "  compact session  ",
  ])("accepts exact natural Slack request: %s", (command) => {
    expect(parseSlackCompactRequest(stamped(command))).toEqual({ kind: "request" });
  });

  it("accepts the optional stamped text form with bounded custom instructions", () => {
    expect(parseSlackCompactRequest(stamped("/compact"))).toEqual({ kind: "request" });
    expect(parseSlackCompactRequest(stamped("/COMPACT focus on the active issue"))).toEqual({
      kind: "request",
      customInstructions: "focus on the active issue",
    });
    expect(parseSlackCompactRequest(stamped(`/compact ${"a".repeat(MAX_CUSTOM_INSTRUCTIONS)}`))).toEqual({
      kind: "request",
      customInstructions: "a".repeat(MAX_CUSTOM_INSTRUCTIONS),
    });
  });

  it("rejects oversize and all custom-instruction control-character classes", () => {
    expect(parseSlackCompactRequest(stamped(`/compact ${"a".repeat(MAX_CUSTOM_INSTRUCTIONS + 1)}`))).toEqual({
      kind: "reject",
      reason: "instructions-too-long",
    });
    for (const control of ["\u0007", "\t", "\n", "\u007f", "\u0085"]) {
      expect(parseSlackCompactRequest(stamped(`/compact focus${control}now`))).toEqual({
        kind: "reject",
        reason: "control-characters",
      });
    }
  });

  it.each([
    "please compact session",
    "can you compact the current session?",
    "we should compact session later",
    "compact",
    "compact the session",
    "compact  session",
    "/compact-now",
    "discussion containing compact",
  ])("does not trigger on ordinary conversation or broad grammar: %s", (body) => {
    expect(parseSlackCompactRequest(stamped(body))).toEqual({ kind: "none" });
  });

  it("accepts only the modern Slack bridge stamp", () => {
    expect(parseSlackCompactRequest(stamped("compact session", "telegram"))).toEqual({ kind: "none" });
    expect(parseSlackCompactRequest("[Slack #C123] Ryan: compact session")).toEqual({ kind: "none" });
    expect(parseSlackCompactRequest("compact session")).toEqual({ kind: "none" });
    expect(parseSlackCompactRequest("[📱 @Ryan via slack]: compact session\nextra")).toEqual({ kind: "none" });
  });
});

describe("gateway-only acknowledgement and one-shot compaction", () => {
  beforeEach(() => {
    process.env.SLACK_COMPACT_NONCE = NONCE;
  });

  afterEach(() => {
    delete process.env.SLACK_COMPACT_NONCE;
    vi.restoreAllMocks();
  });

  it("transforms a bridge-injected request into one short no-tool acknowledgement", async () => {
    const { compact, fire } = makeHarness();
    const result = await fire("input", { text: stamped("compact session"), source: "extension" });

    expect(result).toEqual({
      action: "transform",
      text: `Reply with exactly this sentence and nothing else: ${ACKNOWLEDGEMENT} Do not call tools.`,
    });
    expect(compact).not.toHaveBeenCalled();
  });

  it("never intercepts the same stamped text from local TUI or RPC input", async () => {
    const { compact, fire } = makeHarness();
    expect(await fire("input", { text: stamped("compact session"), source: "interactive" })).toEqual({
      action: "continue",
    });
    expect(await fire("input", { text: stamped("compact session"), source: "rpc" })).toEqual({ action: "continue" });
    await fire("turn_end", { message: assistant(text("ordinary reply")) });
    expect(compact).not.toHaveBeenCalled();
  });

  it("calls ctx.compact only after a non-empty tool-free acknowledgement turn", async () => {
    const { compact, fire } = makeHarness();
    await fire("input", { text: stamped("/compact retain issue decisions"), source: "extension" });
    await fire("turn_end", { message: assistant(text("ack")) });

    expect(compact).toHaveBeenCalledOnce();
    expect(compact).toHaveBeenCalledWith({
      customInstructions: "retain issue decisions",
      onComplete: expect.any(Function),
      onError: expect.any(Function),
    });
  });

  it("waits across empty, tool-only, and text-plus-tool turns", async () => {
    const { compact, fire } = makeHarness();
    await fire("input", { text: stamped("compact current session"), source: "extension" });

    await fire("turn_end", { message: assistant() });
    await fire("turn_end", { message: assistant(tool()) });
    await fire("turn_end", { message: assistant(text("starting"), tool()) });
    expect(compact).not.toHaveBeenCalled();

    await fire("turn_end", { message: assistant(text("acknowledged")) });
    expect(compact).toHaveBeenCalledOnce();
  });

  it("rejects duplicate and in-flight requests and compacts only once", async () => {
    const { compact, fire } = makeHarness();
    await fire("input", { text: stamped("compact session"), source: "extension" });
    const duplicate = await fire("input", { text: stamped("compact session"), source: "extension" });
    expect(duplicate).toEqual({
      action: "transform",
      text: `Reply with exactly this sentence and nothing else: ${BUSY_ACKNOWLEDGEMENT} Do not call tools.`,
    });

    await fire("turn_end", { message: assistant(text("ack")) });
    expect(compact).toHaveBeenCalledOnce();
    expect(await fire("input", { text: stamped("compact session"), source: "extension" })).toEqual(duplicate);
    await fire("turn_end", { message: assistant(text("another reply")) });
    expect(compact).toHaveBeenCalledOnce();
  });

  it("emits the exact nonce marker only from onComplete", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { compact, fire } = makeHarness();
    await fire("input", { text: stamped("compact session"), source: "extension" });
    await fire("turn_end", { message: assistant(text("ack")) });

    expect(error).not.toHaveBeenCalled();
    const options = compact.mock.calls[0][0];
    options.onComplete();
    expect(error).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith(completionMarker(NONCE));
  });

  it("passes undefined custom instructions for the exact natural grammar", async () => {
    const { compact, fire } = makeHarness();
    await fire("input", { text: stamped("compact the current session"), source: "extension" });
    await fire("turn_end", { message: assistant(text("ack")) });
    expect(compact.mock.calls[0][0]).toMatchObject({ customInstructions: undefined });
  });

  it("logs no marker on compaction error and re-arms for a later request", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { compact, fire } = makeHarness();
    await fire("input", { text: stamped("compact session"), source: "extension" });
    await fire("turn_end", { message: assistant(text("ack")) });
    compact.mock.calls[0][0].onError(new Error("provider failed"));

    expect(error).toHaveBeenCalledWith("[slack-compact] compaction failed; gateway remains connected");
    expect(error.mock.calls.flat().join(" ")).not.toContain(completionMarker(NONCE));

    const next = await fire("input", { text: stamped("compact session"), source: "extension" });
    expect(next).toEqual({
      action: "transform",
      text: `Reply with exactly this sentence and nothing else: ${ACKNOWLEDGEMENT} Do not call tools.`,
    });
  });

  it("does not emit a marker when ctx.compact throws synchronously", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { compact, fire } = makeHarness();
    compact.mockImplementation(() => {
      throw new Error("could not start");
    });
    await fire("input", { text: stamped("compact session"), source: "extension" });
    await fire("turn_end", { message: assistant(text("ack")) });
    expect(error).toHaveBeenCalledWith("[slack-compact] compaction could not start; gateway remains connected");
    expect(error.mock.calls.flat().join(" ")).not.toContain(completionMarker(NONCE));
    expect(await fire("input", { text: stamped("compact session"), source: "extension" })).toMatchObject({
      action: "transform",
    });
  });

  it("rejects invalid instructions through the normal acknowledgement path without compacting", async () => {
    const { compact, fire } = makeHarness();
    const result = await fire("input", {
      text: stamped(`/compact ${"x".repeat(MAX_CUSTOM_INSTRUCTIONS + 1)}`),
      source: "extension",
    });
    expect(result).toEqual({
      action: "transform",
      text: `Reply with exactly this sentence and nothing else: ${INVALID_ACKNOWLEDGEMENT} Do not call tools.`,
    });
    await fire("turn_end", { message: assistant(text("invalid")) });
    expect(compact).not.toHaveBeenCalled();
  });

  it("clears pending and in-flight state across session lifecycle events", async () => {
    const { compact, fire } = makeHarness();
    await fire("input", { text: stamped("compact session"), source: "extension" });
    await fire("session_shutdown");
    await fire("session_start");
    await fire("turn_end", { message: assistant(text("late old-session ack")) });
    expect(compact).not.toHaveBeenCalled();

    await fire("input", { text: stamped("compact session"), source: "extension" });
    await fire("turn_end", { message: assistant(text("new ack")) });
    expect(compact).toHaveBeenCalledOnce();
    await fire("session_start");
    expect(await fire("input", { text: stamped("compact session"), source: "extension" })).toMatchObject({
      action: "transform",
    });
  });

  it("fails closed without a valid supervisor nonce", async () => {
    delete process.env.SLACK_COMPACT_NONCE;
    const { compact, fire } = makeHarness();
    const result = await fire("input", { text: stamped("compact session"), source: "extension" });
    expect(result).toMatchObject({ action: "transform" });
    expect(String((result as any).text)).toContain("unavailable");
    await fire("turn_end", { message: assistant(text("unavailable")) });
    expect(compact).not.toHaveBeenCalled();
  });
});
