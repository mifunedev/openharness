import { beforeEach, describe, expect, it, vi } from "vitest";
import factory from "../path-guard";

type Handler = (event: any, ctx: any) => Promise<unknown>;
type CommandDef = { description: string; handler: Handler };

interface MockPi {
  on: (event: string, handler: Handler) => void;
  registerCommand: (name: string, def: CommandDef) => void;
}

interface Captured {
  toolCallHandlers: Handler[];
  commands: Map<string, CommandDef>;
}

function makePi(): { pi: MockPi; captured: Captured } {
  const captured: Captured = {
    toolCallHandlers: [],
    commands: new Map(),
  };
  const pi: MockPi = {
    on: (event, handler) => {
      if (event === "tool_call") captured.toolCallHandlers.push(handler);
    },
    registerCommand: (name, def) => {
      captured.commands.set(name, def);
    },
  };
  return { pi, captured };
}

function makeCtx(
  confirm: (title: string, body: string) => Promise<boolean>,
  hasUI = true,
  mode?: string,
) {
  const notify = vi.fn();
  return {
    notify,
    ctx: {
      hasUI,
      mode,
      ui: {
        confirm: vi.fn(confirm),
        notify,
      },
    },
  };
}

async function fire(handlers: Handler[], event: unknown, ctx: unknown) {
  for (const h of handlers) {
    const result = await h(event, ctx);
    if (result !== undefined) return result;
  }
  return undefined;
}

describe("path-guard extension", () => {
  let captured: Captured;

  beforeEach(() => {
    const m = makePi();
    captured = m.captured;
    factory(m.pi as never);
  });

  it("registers a tool_call handler and the /guard command", () => {
    expect(captured.toolCallHandlers).toHaveLength(1);
    expect(captured.commands.has("guard")).toBe(true);
  });

  // Fix #1: hasUI guard tests
  describe("headless mode (hasUI === false)", () => {
    it("does not call confirm for write on sensitive path in headless mode", async () => {
      const { ctx } = makeCtx(async () => false, false);
      const result = await fire(
        captured.toolCallHandlers,
        { toolName: "write", input: { path: ".env" } },
        ctx,
      );
      expect(ctx.ui.confirm).not.toHaveBeenCalled();
      expect(result).toBeUndefined();
    });

    it("does not call confirm for bash risky command in headless mode", async () => {
      const { ctx } = makeCtx(async () => false, false);
      const result = await fire(
        captured.toolCallHandlers,
        { toolName: "bash", input: { command: "rm -rf /tmp/x" } },
        ctx,
      );
      expect(ctx.ui.confirm).not.toHaveBeenCalled();
      expect(result).toBeUndefined();
    });
  });

  describe("sensitive write/edit", () => {
    it.each([
      [".env"],
      ["app/.env.production"],
      ["secrets/api.json"],
      ["config/credentials.yaml"],
      ["keys/server.pem"],
      ["keys/server.key"],
      ["~/.ssh/id_rsa"],
      ["~/.ssh/id_ed25519"],
    ])("blocks write to %s when user declines", async (path) => {
      const { ctx } = makeCtx(async () => false);
      const result = await fire(
        captured.toolCallHandlers,
        // Fix #5: canonical key is `path` (verified from pi write.ts writeSchema)
        { toolName: "write", input: { path } },
        ctx,
      );
      expect(ctx.ui.confirm).toHaveBeenCalledOnce();
      expect(result).toMatchObject({ block: true });
    });

    it("allows write when user accepts", async () => {
      const { ctx } = makeCtx(async () => true);
      const result = await fire(
        captured.toolCallHandlers,
        { toolName: "write", input: { path: ".env" } },
        ctx,
      );
      expect(ctx.ui.confirm).toHaveBeenCalledOnce();
      expect(result).toBeUndefined();
    });

    it("ignores edits to ordinary paths", async () => {
      const { ctx } = makeCtx(async () => false);
      const result = await fire(
        captured.toolCallHandlers,
        { toolName: "edit", input: { path: "src/index.ts" } },
        ctx,
      );
      expect(ctx.ui.confirm).not.toHaveBeenCalled();
      expect(result).toBeUndefined();
    });

    it("ignores reads of sensitive paths (only write/edit guarded)", async () => {
      const { ctx } = makeCtx(async () => false);
      const result = await fire(
        captured.toolCallHandlers,
        { toolName: "read", input: { path: ".env" } },
        ctx,
      );
      expect(ctx.ui.confirm).not.toHaveBeenCalled();
      expect(result).toBeUndefined();
    });

    it("accepts alternative path field names (file_path, target, filename)", async () => {
      for (const key of ["file_path", "target", "filename"]) {
        const { ctx } = makeCtx(async () => false);
        const result = await fire(
          captured.toolCallHandlers,
          { toolName: "write", input: { [key]: ".env" } },
          ctx,
        );
        expect(ctx.ui.confirm).toHaveBeenCalledOnce();
        expect(result).toMatchObject({ block: true });
      }
    });

    it("does nothing when no path field is present", async () => {
      const { ctx } = makeCtx(async () => false);
      const result = await fire(
        captured.toolCallHandlers,
        { toolName: "write", input: {} },
        ctx,
      );
      expect(ctx.ui.confirm).not.toHaveBeenCalled();
      expect(result).toBeUndefined();
    });

    // Fix #4: capitalized tool names still fire the guard (toLowerCase normalization)
    it("fires guard for capitalized tool names (Write, Edit)", async () => {
      for (const toolName of ["Write", "Edit"]) {
        const { ctx } = makeCtx(async () => false);
        const result = await fire(
          captured.toolCallHandlers,
          { toolName, input: { path: ".env" } },
          ctx,
        );
        expect(ctx.ui.confirm).toHaveBeenCalledOnce();
        expect(result).toMatchObject({ block: true });
      }
    });
  });

  describe("risky bash", () => {
    it("does not prompt for risky bash in interactive TUI mode", async () => {
      const { ctx } = makeCtx(async () => false, true, "tui");
      const result = await fire(
        captured.toolCallHandlers,
        { toolName: "bash", input: { command: "git push --force-with-lease origin feat/x" } },
        ctx,
      );
      expect(ctx.ui.confirm).not.toHaveBeenCalled();
      expect(result).toBeUndefined();
    });

    it.each([
      ["rm -rf /tmp/x"],
      ["sudo apt update"],
      ["git push origin main --force"],
      ["git reset --hard HEAD~3"],
    ])("prompts and blocks %s when user declines", async (command) => {
      const { ctx } = makeCtx(async () => false);
      const result = await fire(
        captured.toolCallHandlers,
        { toolName: "bash", input: { command } },
        ctx,
      );
      expect(ctx.ui.confirm).toHaveBeenCalledOnce();
      expect(result).toMatchObject({ block: true });
    });

    // Fix #2: case-insensitive RISKY_BASH — uppercase variants must still trigger
    it.each([
      ["RM -RF /tmp/x"],
      ["Sudo apt update"],
      ["GIT RESET --HARD HEAD~3"],
    ])("prompts for uppercase risky command: %s", async (command) => {
      const { ctx } = makeCtx(async () => false);
      const result = await fire(
        captured.toolCallHandlers,
        { toolName: "bash", input: { command } },
        ctx,
      );
      expect(ctx.ui.confirm).toHaveBeenCalledOnce();
      expect(result).toMatchObject({ block: true });
    });

    // Fix #3: bare > /dev/... redirection without leading colon
    it.each([
      ["> /dev/sda"],
      ["dd if=/dev/zero > /dev/sdb"],
      ["cat /dev/zero > /dev/nvme0"],
    ])("prompts for bare block-device redirection: %s", async (command) => {
      const { ctx } = makeCtx(async () => false);
      const result = await fire(
        captured.toolCallHandlers,
        { toolName: "bash", input: { command } },
        ctx,
      );
      expect(ctx.ui.confirm).toHaveBeenCalledOnce();
      expect(result).toMatchObject({ block: true });
    });

    it("allows risky bash when user accepts", async () => {
      const { ctx } = makeCtx(async () => true);
      const result = await fire(
        captured.toolCallHandlers,
        { toolName: "bash", input: { command: "rm -rf /tmp/x" } },
        ctx,
      );
      expect(result).toBeUndefined();
    });

    it("does not prompt for ordinary bash commands", async () => {
      const { ctx } = makeCtx(async () => false);
      const result = await fire(
        captured.toolCallHandlers,
        { toolName: "bash", input: { command: "ls -la" } },
        ctx,
      );
      expect(ctx.ui.confirm).not.toHaveBeenCalled();
      expect(result).toBeUndefined();
    });

    it("truncates very long commands in the confirm body", async () => {
      const long = "rm -rf " + "/x".repeat(200);
      const { ctx } = makeCtx(async () => true);
      await fire(
        captured.toolCallHandlers,
        { toolName: "bash", input: { command: long } },
        ctx,
      );
      const body = (ctx.ui.confirm as ReturnType<typeof vi.fn>).mock.calls[0][1];
      expect(body.length).toBeLessThanOrEqual(220);
      expect(body).toContain("...");
    });

    // Fix #4: capitalized Bash tool name still fires the guard
    it("fires guard for capitalized tool name Bash", async () => {
      const { ctx } = makeCtx(async () => false);
      const result = await fire(
        captured.toolCallHandlers,
        { toolName: "Bash", input: { command: "rm -rf /tmp/x" } },
        ctx,
      );
      expect(ctx.ui.confirm).toHaveBeenCalledOnce();
      expect(result).toMatchObject({ block: true });
    });
  });

  describe("/guard command", () => {
    it("notifies with both protection lists", async () => {
      const { ctx } = makeCtx(async () => true);
      const cmd = captured.commands.get("guard")!;
      await cmd.handler("" as never, ctx as never);
      expect(ctx.ui.notify).toHaveBeenCalledOnce();
      const [message, level] = (ctx.ui.notify as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(level).toBe("info");
      expect(message).toContain("Sensitive paths");
      expect(message).toContain("Risky bash patterns");
    });
  });
});
