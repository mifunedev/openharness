import { beforeEach, describe, expect, it, vi } from "vitest";
import factory from "../plan-mode";

type Handler = (event: any, ctx: any) => Promise<unknown> | unknown;
type CommandDef = { description: string; handler: Handler };

interface MockPi {
  appendEntry: ReturnType<typeof vi.fn>;
  getActiveTools: ReturnType<typeof vi.fn>;
  getAllTools: ReturnType<typeof vi.fn>;
  getFlag: ReturnType<typeof vi.fn>;
  on: (event: string, handler: Handler) => void;
  registerCommand: (name: string, def: CommandDef) => void;
  registerFlag: ReturnType<typeof vi.fn>;
  registerShortcut: ReturnType<typeof vi.fn>;
  sendMessage: ReturnType<typeof vi.fn>;
  sendUserMessage: ReturnType<typeof vi.fn>;
  setActiveTools: ReturnType<typeof vi.fn>;
}

interface Captured {
  commands: Map<string, CommandDef>;
  handlers: Map<string, Handler[]>;
}

const allTools = [
  { name: "read" },
  { name: "bash" },
  { name: "grep" },
  { name: "find" },
  { name: "ls" },
  { name: "edit" },
  { name: "write" },
];

function makePi(): { pi: MockPi; captured: Captured } {
  const captured: Captured = {
    commands: new Map(),
    handlers: new Map(),
  };
  const pi: MockPi = {
    appendEntry: vi.fn(),
    getActiveTools: vi.fn(() => ["read", "bash", "edit", "write"]),
    getAllTools: vi.fn(() => allTools),
    getFlag: vi.fn(() => false),
    on: (event, handler) => {
      captured.handlers.set(event, [...(captured.handlers.get(event) ?? []), handler]);
    },
    registerCommand: (name, def) => {
      captured.commands.set(name, def);
    },
    registerFlag: vi.fn(),
    registerShortcut: vi.fn(),
    sendMessage: vi.fn(),
    sendUserMessage: vi.fn(),
    setActiveTools: vi.fn(),
  };
  return { pi, captured };
}

function makeCtx(options: { select?: () => Promise<string | undefined>; hasUI?: boolean } = {}) {
  const theme = {
    fg: (_role: string, text: string) => text,
    strikethrough: (text: string) => `~~${text}~~`,
  };

  return {
    hasUI: options.hasUI ?? true,
    sessionManager: { getEntries: vi.fn(() => []) },
    ui: {
      editor: vi.fn(async () => undefined),
      notify: vi.fn(),
      select: vi.fn(options.select ?? (async () => undefined)),
      setStatus: vi.fn(),
      setWidget: vi.fn(),
      theme,
    },
  };
}

async function fire(handlers: Handler[] | undefined, event: unknown, ctx: unknown) {
  for (const h of handlers ?? []) {
    const result = await h(event, ctx);
    if (result !== undefined) return result;
  }
  return undefined;
}

describe("plan-mode extension", () => {
  let pi: MockPi;
  let captured: Captured;

  beforeEach(() => {
    const m = makePi();
    pi = m.pi;
    captured = m.captured;
    factory(pi as never);
  });

  it("registers commands, flag, shortcut, and lifecycle handlers", () => {
    expect(pi.registerFlag).toHaveBeenCalledWith("plan", expect.objectContaining({ type: "boolean" }));
    expect(pi.registerShortcut).toHaveBeenCalledWith("ctrl+alt+p", expect.any(Object));
    expect(captured.commands.has("plan")).toBe(true);
    expect(captured.commands.has("todos")).toBe(true);
    expect(captured.handlers.get("tool_call")).toHaveLength(1);
    expect(captured.handlers.get("before_agent_start")).toHaveLength(1);
    expect(captured.handlers.get("agent_end")).toHaveLength(1);
  });

  it("/plan enables read-only tools and persists state", async () => {
    const ctx = makeCtx();
    await captured.commands.get("plan")!.handler("", ctx);

    expect(pi.setActiveTools).toHaveBeenCalledWith(["read", "bash", "grep", "find", "ls"]);
    expect(pi.appendEntry).toHaveBeenCalledWith(
      "plan-mode-state",
      expect.objectContaining({ planning: true, executing: false }),
    );
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("enabled"), "info");
  });

  it("blocks mutating tools and non-read-only bash while planning", async () => {
    const ctx = makeCtx();
    await captured.commands.get("plan")!.handler("on", ctx);

    await expect(
      fire(captured.handlers.get("tool_call"), { toolName: "edit", input: { path: "README.md" } }, ctx),
    ).resolves.toMatchObject({ block: true });

    await expect(
      fire(captured.handlers.get("tool_call"), { toolName: "bash", input: { command: "git push" } }, ctx),
    ).resolves.toMatchObject({ block: true });

    await expect(
      fire(captured.handlers.get("tool_call"), { toolName: "bash", input: { command: "git diff" } }, ctx),
    ).resolves.toBeUndefined();
  });

  it("injects plan-only instructions before the agent starts", async () => {
    const ctx = makeCtx();
    await captured.commands.get("plan")!.handler("on", ctx);

    const result = await fire(
      captured.handlers.get("before_agent_start"),
      { systemPrompt: "base prompt" },
      ctx,
    );

    expect(result).toMatchObject({
      message: expect.objectContaining({ customType: "plan-mode-context", display: false }),
    });
    expect((result as { systemPrompt: string }).systemPrompt).toContain("produce a plan only");
  });

  it("captures an assistant Plan and asks for approval", async () => {
    const ctx = makeCtx({ select: async () => "Stay in plan mode" });
    await captured.commands.get("plan")!.handler("on", ctx);

    await fire(
      captured.handlers.get("agent_end"),
      {
        messages: [
          {
            role: "assistant",
            content: [{ type: "text", text: "Plan:\n1. Read files\n2. Add extension" }],
          },
        ],
      },
      ctx,
    );

    expect(pi.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ customType: "plan-mode-plan", content: expect.stringContaining("Add extension") }),
      { triggerTurn: false },
    );
    expect(ctx.ui.select).toHaveBeenCalledWith("Plan mode", expect.arrayContaining(["Approve plan and implement"]));
  });

  it("approval restores previous tools and sends an implementation prompt", async () => {
    const ctx = makeCtx({ select: async () => "Approve plan and implement" });
    await captured.commands.get("plan")!.handler("on", ctx);

    await fire(
      captured.handlers.get("agent_end"),
      {
        messages: [
          {
            role: "assistant",
            content: [{ type: "text", text: "Plan:\n1. Read files\n2. Add extension" }],
          },
        ],
      },
      ctx,
    );

    expect(pi.setActiveTools).toHaveBeenLastCalledWith(["read", "bash", "edit", "write"]);
    expect(pi.sendUserMessage).toHaveBeenCalledWith(expect.stringContaining("Plan approved"));
    expect(pi.sendUserMessage).toHaveBeenCalledWith(expect.stringContaining("[DONE:n]"));
  });

  it("/plan off restores previous tools", async () => {
    const ctx = makeCtx();
    await captured.commands.get("plan")!.handler("on", ctx);
    await captured.commands.get("plan")!.handler("off", ctx);

    expect(pi.setActiveTools).toHaveBeenLastCalledWith(["read", "bash", "edit", "write"]);
    expect(pi.appendEntry).toHaveBeenLastCalledWith(
      "plan-mode-state",
      expect.objectContaining({ planning: false, executing: false, items: [] }),
    );
  });
});
