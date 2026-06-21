import { describe, expect, it, vi } from "vitest";
import factory from "../index";

// Fire-the-handler test harness (mirrors .pi/extensions/__tests__/path-guard.test.ts):
// .pi/** is NOT CI-typechecked, so we exercise the extension by invoking its
// registered handlers, never by importing pi itself.
type Handler = (event: unknown, ctx?: unknown) => Promise<unknown> | unknown;

function makePi() {
  const handlers = new Map<string, Handler[]>();
  const sendUserMessage = vi.fn();
  const pi = {
    on(event: string, handler: Handler) {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    },
    sendUserMessage,
    registerCommand: vi.fn(),
  };
  const fire = async (event: string, payload?: unknown, ctx?: unknown) => {
    for (const h of handlers.get(event) ?? []) await h(payload, ctx);
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { pi: pi as any, sendUserMessage, fire };
}

const assistantError = (msg: string) => ({ role: "assistant", stopReason: "error", errorMessage: msg });
const slackUser = (text: string) => ({ role: "user", content: [{ type: "text", text }] });
const STALE = "Codex error: 400 invalid_request_error previous_response_not_found";

describe("slack bridge codex retry-recovery", () => {
  it("re-injects a [📱-prefixed Slack turn once on previous_response_not_found", async () => {
    const { pi, sendUserMessage, fire } = makePi();
    factory(pi);
    await fire("session_start");
    await fire("agent_end", {
      messages: [slackUser("[📱 @Ryan via slack]: Links?"), assistantError(STALE)],
    });
    expect(sendUserMessage).toHaveBeenCalledOnce();
    expect(sendUserMessage.mock.calls[0][0]).toBe("[📱 @Ryan via slack]: Links?");
    expect(sendUserMessage.mock.calls[0][1]).toEqual({ deliverAs: "followUp" });
  });

  it("does not re-inject twice for the same failed text (one-retry guard)", async () => {
    const { pi, sendUserMessage, fire } = makePi();
    factory(pi);
    const messages = [slackUser("[📱 @Ryan via slack]: Links?"), assistantError(STALE)];
    await fire("agent_end", { messages });
    await fire("agent_end", { messages }); // our retry hit the same error -> give up
    expect(sendUserMessage).toHaveBeenCalledOnce();
  });

  it("re-arms after a clean turn between failures", async () => {
    const { pi, sendUserMessage, fire } = makePi();
    factory(pi);
    await fire("agent_end", { messages: [slackUser("[📱 @Ryan via slack]: a"), assistantError(STALE)] });
    await fire("agent_end", { messages: [slackUser("[📱 @Ryan via slack]: b"), { role: "assistant", content: [] }] });
    await fire("agent_end", { messages: [slackUser("[📱 @Ryan via slack]: c"), assistantError(STALE)] });
    expect(sendUserMessage).toHaveBeenCalledTimes(2);
  });

  it("ignores non-Slack turns (no prefix)", async () => {
    const { pi, sendUserMessage, fire } = makePi();
    factory(pi);
    await fire("agent_end", { messages: [{ role: "user", content: "hello" }, assistantError(STALE)] });
    expect(sendUserMessage).not.toHaveBeenCalled();
  });

  it("ignores unrelated (non-recoverable) errors", async () => {
    const { pi, sendUserMessage, fire } = makePi();
    factory(pi);
    await fire("agent_end", {
      messages: [slackUser("[📱 @Ryan via slack]: Links?"), assistantError("rate_limit_exceeded")],
    });
    expect(sendUserMessage).not.toHaveBeenCalled();
  });

  it("also recovers the legacy [Slack # prefix and a top-level errorMessage", async () => {
    const { pi, sendUserMessage, fire } = makePi();
    factory(pi);
    await fire("agent_end", {
      errorMessage: STALE,
      messages: [slackUser("[Slack #C123] Ryan: ping")],
    });
    expect(sendUserMessage).toHaveBeenCalledOnce();
    expect(sendUserMessage.mock.calls[0][0]).toBe("[Slack #C123] Ryan: ping");
  });
});
