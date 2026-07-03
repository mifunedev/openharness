import { beforeEach, describe, expect, it, vi } from "vitest";
import singleLineFooter, { buildFooterLine, collectUsage, formatTokens, sanitizeSegment, type FooterData } from "../single-line-footer";

type Handler = (event: any, ctx: any) => Promise<unknown> | unknown;

type CommandlessPi = {
  on: (event: string, handler: Handler) => void;
  getThinkingLevel: () => string;
};

const theme = {
  fg: (_role: string, text: string) => text,
} as any;

function makeFooterData(overrides: Partial<FooterData> = {}): FooterData {
  return {
    getGitBranch: () => "development",
    getExtensionStatuses: () => new Map([["plan-mode", "plan 1/2"]]),
    getAvailableProviderCount: () => 2,
    onBranchChange: () => () => {},
    ...overrides,
  };
}

function makeCtx(overrides: Record<string, unknown> = {}) {
  return {
    hasUI: true,
    cwd: `${process.env.HOME ?? ""}/harness`,
    model: { provider: "openai", id: "gpt-5.5", reasoning: true, contextWindow: 200000 },
    sessionManager: {
      getSessionName: () => "footer session",
      getEntries: () => [
        {
          type: "message",
          message: {
            role: "assistant",
            usage: {
              input: 1200,
              output: 3400,
              cacheRead: 0,
              cacheWrite: 1000,
              cost: { total: 0.0123 },
            },
          },
        },
      ],
    },
    getContextUsage: () => ({ percent: 72.3, contextWindow: 200000 }),
    ui: { setFooter: vi.fn() },
    ...overrides,
  } as any;
}

function makePi(thinkingLevel = "high") {
  const handlers = new Map<string, Handler[]>();
  const pi: CommandlessPi = {
    on: (event, handler) => {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    },
    getThinkingLevel: () => thinkingLevel,
  };
  return { pi, handlers };
}

describe("single-line-footer utilities", () => {
  it("formats token counts like the built-in footer", () => {
    expect(formatTokens(999)).toBe("999");
    expect(formatTokens(1200)).toBe("1.2k");
    expect(formatTokens(12000)).toBe("12k");
    expect(formatTokens(1_200_000)).toBe("1.2M");
  });

  it("sanitizes control characters and ANSI escape codes", () => {
    expect(sanitizeSegment("hello\n\u001b[31mred\u001b[0m\tworld")).toBe("hello red world");
  });

  it("collects assistant usage without untyped session manager casts", () => {
    const usage = collectUsage(makeCtx());
    expect(usage).toEqual({ input: 1200, output: 3400, cacheRead: 0, cacheWrite: 1000, cost: 0.0123 });
  });

  it("builds a single footer line with requested divider", () => {
    const line = buildFooterLine(makeCtx(), { model: makeCtx().model, thinkingLevel: "high" }, theme, makeFooterData(), 160);
    expect(line.split("\n")).toHaveLength(1);
    expect(line).toContain(" > ");
    expect(line).toContain("~/harness (development)");
    expect(line).toContain("ctx 72.3%/200k");
    expect(line).toContain("openai/gpt-5.5 high");
    expect(line).toContain("plan 1/2");
  });

  it("drops low-priority segments before truncating high-priority context/model", () => {
    const line = buildFooterLine(makeCtx(), { model: makeCtx().model, thinkingLevel: "high" }, theme, makeFooterData(), 65);
    expect(line).toContain("ctx 72.3%/200k");
    expect(line).toContain("openai/gpt-5.5 high");
    expect(line).not.toContain("footer session");
    expect(line).not.toContain("↑1.2k");
  });

  it("shows provider only when multiple providers are available", () => {
    const ctx = makeCtx();
    const state = { model: ctx.model, thinkingLevel: "high" };
    expect(buildFooterLine(ctx, state, theme, makeFooterData({ getAvailableProviderCount: () => 1 }), 160)).toContain(
      "gpt-5.5 high",
    );
    expect(buildFooterLine(ctx, state, theme, makeFooterData({ getAvailableProviderCount: () => 1 }), 160)).not.toContain(
      "openai/gpt-5.5",
    );
  });
});

describe("single-line-footer extension", () => {
  let handlers: Map<string, Handler[]>;
  let pi: CommandlessPi;

  beforeEach(() => {
    const made = makePi("high");
    pi = made.pi;
    handlers = made.handlers;
    singleLineFooter(pi as never);
  });

  it("installs no footer when UI is unavailable", async () => {
    const ctx = makeCtx({ hasUI: false, ui: { setFooter: vi.fn() } });
    await handlers.get("session_start")![0]!({}, ctx);
    expect(ctx.ui.setFooter).not.toHaveBeenCalled();
  });

  it("installs a one-line footer and disposes branch subscriptions", async () => {
    const ctx = makeCtx();
    await handlers.get("session_start")![0]!({}, ctx);
    const factory = ctx.ui.setFooter.mock.calls[0][0];
    const unsubscribe = vi.fn();
    const footerData = makeFooterData({ onBranchChange: vi.fn(() => unsubscribe) });
    const footer = factory({ requestRender: vi.fn() }, theme, footerData);

    expect(footer.render(160)).toHaveLength(1);
    footer.dispose();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("requests redraw and updates model/thinking state on selection events", async () => {
    const ctx = makeCtx();
    await handlers.get("session_start")![0]!({}, ctx);
    const requestRender = vi.fn();
    const footer = ctx.ui.setFooter.mock.calls[0][0]({ requestRender }, theme, makeFooterData());

    handlers.get("model_select")![0]!({ model: { provider: "anthropic", id: "sonnet", reasoning: true } }, ctx);
    handlers.get("thinking_level_select")![0]!({ level: "medium" }, ctx);

    expect(requestRender).toHaveBeenCalledTimes(2);
    expect(footer.render(160)[0]).toContain("anthropic/sonnet medium");
  });
});
