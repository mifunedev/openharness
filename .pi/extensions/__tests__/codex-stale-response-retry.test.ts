import { describe, expect, it, vi } from "vitest";
import factory from "../codex-stale-response-retry";

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
const user = (text: string) => ({ role: "user", content: [{ type: "text", text }] });
const STALE =
  "Codex error: {\"type\":\"error\",\"error\":{\"code\":\"previous_response_not_found\",\"message\":\"Previous response with id 'resp_x' not found.\"}}";

describe("codex stale response retry extension", () => {
  it("re-injects a non-Slack failed turn once on previous_response_not_found", async () => {
    const { pi, sendUserMessage, fire } = makePi();
    factory(pi);

    await fire("agent_end", { messages: [user("continue"), assistantError(STALE)] });

    expect(sendUserMessage).toHaveBeenCalledOnce();
    expect(sendUserMessage.mock.calls[0][0]).toBe("continue");
    expect(sendUserMessage.mock.calls[0][1]).toEqual({ deliverAs: "followUp" });
  });

  it("detects the recoverable error from a top-level event errorMessage", async () => {
    const { pi, sendUserMessage, fire } = makePi();
    factory(pi);

    await fire("agent_end", { errorMessage: STALE, messages: [{ role: "user", content: "loop wake" }] });

    expect(sendUserMessage).toHaveBeenCalledOnce();
    expect(sendUserMessage.mock.calls[0][0]).toBe("loop wake");
  });

  it("does not re-inject twice for the same failed text", async () => {
    const { pi, sendUserMessage, fire } = makePi();
    factory(pi);
    const payload = { messages: [user("same turn"), assistantError(STALE)] };

    await fire("agent_end", payload);
    await fire("agent_end", payload);

    expect(sendUserMessage).toHaveBeenCalledOnce();
  });

  it("re-arms after a clean turn between stale-response failures", async () => {
    const { pi, sendUserMessage, fire } = makePi();
    factory(pi);

    await fire("agent_end", { messages: [user("a"), assistantError(STALE)] });
    await fire("agent_end", { messages: [user("b"), { role: "assistant", content: [] }] });
    await fire("agent_end", { messages: [user("c"), assistantError(STALE)] });

    expect(sendUserMessage).toHaveBeenCalledTimes(2);
    expect(sendUserMessage.mock.calls[1][0]).toBe("c");
  });

  it("skips Slack-prefixed turns so bridge-recovery remains the Slack owner", async () => {
    const { pi, sendUserMessage, fire } = makePi();
    factory(pi);

    await fire("agent_end", { messages: [user("[📱 @Ryan via slack]: ping"), assistantError(STALE)] });
    await fire("agent_end", { messages: [user("[Slack #C123] Ryan: ping"), assistantError(STALE)] });

    expect(sendUserMessage).not.toHaveBeenCalled();
  });

  it("ignores unrelated provider errors", async () => {
    const { pi, sendUserMessage, fire } = makePi();
    factory(pi);

    await fire("agent_end", { messages: [user("continue"), assistantError("rate_limit_exceeded")] });

    expect(sendUserMessage).not.toHaveBeenCalled();
  });
});
