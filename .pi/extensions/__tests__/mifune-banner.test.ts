import { beforeEach, describe, expect, it, vi } from "vitest";
import factory, { buildHeader } from "../mifune-banner";

type Handler = (event: any, ctx: any) => Promise<unknown> | unknown;
type CommandDef = { description: string; handler: Handler };

interface MockPi {
  on: (event: string, handler: Handler) => void;
  registerCommand: (name: string, def: CommandDef) => void;
}

interface Captured {
  sessionStartHandlers: Handler[];
  commands: Map<string, CommandDef>;
}

function makePi(): { pi: MockPi; captured: Captured } {
  const captured: Captured = {
    sessionStartHandlers: [],
    commands: new Map(),
  };
  const pi: MockPi = {
    on: (event, handler) => {
      if (event === "session_start") captured.sessionStartHandlers.push(handler);
    },
    registerCommand: (name, def) => {
      captured.commands.set(name, def);
    },
  };
  return { pi, captured };
}

const fakeTheme = {
  fg: (_role: string, text: string) => text,
} as unknown as Parameters<typeof buildHeader>[0];

describe("mifune-banner extension", () => {
  let captured: Captured;

  beforeEach(() => {
    const m = makePi();
    captured = m.captured;
    factory(m.pi as never);
  });

  it("registers a session_start handler and the /builtin-header command", () => {
    expect(captured.sessionStartHandlers).toHaveLength(1);
    expect(captured.commands.has("builtin-header")).toBe(true);
  });

  describe("buildHeader", () => {
    it("includes the wordmark and the repo URL in the subtitle", () => {
      const lines = buildHeader(fakeTheme);
      const joined = lines.join("\n");
      expect(joined).toContain("MIFUNE");
      expect(joined).toContain("pi harness");
      expect(joined).toContain("github.com/ryaneggz/mifune");
    });

    it("includes the brand emojis (⚔ on wordmark, 🎬 on subtitle)", () => {
      const lines = buildHeader(fakeTheme);
      const wordmarkLine = lines.find((l) => l.includes("MIFUNE"));
      const subtitleLine = lines.find((l) => l.includes("ryaneggz/mifune"));
      expect(wordmarkLine).toContain("⚔");
      expect(subtitleLine).toContain("🎬");
    });

    it("uses theme roles for color (accent for wordmark, muted for subtitle)", () => {
      const calls: Array<[string, string]> = [];
      const trackingTheme = {
        fg: (role: string, text: string) => {
          calls.push([role, text]);
          return text;
        },
      } as unknown as Parameters<typeof buildHeader>[0];
      buildHeader(trackingTheme);
      const wordmarkCall = calls.find(([, t]) => t === "MIFUNE");
      expect(wordmarkCall?.[0]).toBe("accent");
      const subtitleCall = calls.find(([, t]) => t.includes("ryaneggz/mifune"));
      expect(subtitleCall?.[0]).toBe("muted");
    });
  });

  describe("session_start handler", () => {
    it("installs a header factory when the UI is available", async () => {
      const setHeader = vi.fn();
      const handler = captured.sessionStartHandlers[0];
      await handler({}, { hasUI: true, ui: { setHeader } });

      expect(setHeader).toHaveBeenCalledOnce();
      const installedFactory = setHeader.mock.calls[0][0];
      const headerObj = installedFactory({}, fakeTheme);
      expect(typeof headerObj.render).toBe("function");
      expect(typeof headerObj.invalidate).toBe("function");

      const lines = headerObj.render(80);
      expect(Array.isArray(lines)).toBe(true);
      expect(lines.join("\n")).toContain("MIFUNE");
    });

    it("is a no-op when the UI is not available (e.g. RPC mode)", async () => {
      const setHeader = vi.fn();
      const handler = captured.sessionStartHandlers[0];
      await handler({}, { hasUI: false, ui: { setHeader } });
      expect(setHeader).not.toHaveBeenCalled();
    });
  });

  describe("/builtin-header command", () => {
    it("clears the custom header and notifies", async () => {
      const setHeader = vi.fn();
      const notify = vi.fn();
      const cmd = captured.commands.get("builtin-header")!;
      await cmd.handler("", { ui: { setHeader, notify } } as never);

      expect(setHeader).toHaveBeenCalledWith(undefined);
      expect(notify).toHaveBeenCalledWith(expect.stringContaining("Built-in"), "info");
    });
  });
});
