import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  destroyConfirmationPhrase,
  namedVolumes,
  runComposeConfig,
  runDestroy,
  type LifecycleIO,
} from "../commands/lifecycle.js";
import type { LifecycleRunner, RunResult } from "../lib/execution/runner.js";

vi.mock("../cli.js", async (importOriginal) => {
  const original = process.exit;
  process.exit = (() => {}) as never;
  const mod = await importOriginal<typeof import("../cli.js")>();
  await new Promise((r) => setTimeout(r, 0));
  process.exit = original;
  return mod;
});

const { parseComposeArgs, parseDestroyArgs, printComposeHelp, printDestroyHelp } =
  await import("../cli.js");

const HERE = dirname(fileURLToPath(import.meta.url));

const cleanups: string[] = [];

afterEach(() => {
  while (cleanups.length > 0) rmSync(cleanups.pop()!, { recursive: true, force: true });
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const COMPOSE_YML = `name: \${SANDBOX_NAME:-openharness}

services:
  sandbox:
    volumes:
      - claude-auth:/home/sandbox/.claude
      - not-a-top-level-volume:/tmp

volumes:
  claude-auth:
  codex-auth:
  ssh-config:
`;

function makeRepo(sandboxName?: string): string {
  const d = mkdtempSync(join(tmpdir(), "oh-destroy-"));
  cleanups.push(d);
  mkdirSync(join(d, ".oh", "scripts"), { recursive: true });
  writeFileSync(join(d, ".oh", "scripts", "docker-compose.sh"), "#!/usr/bin/env bash\n");
  mkdirSync(join(d, ".devcontainer"), { recursive: true });
  writeFileSync(join(d, ".devcontainer", "docker-compose.yml"), COMPOSE_YML);
  if (sandboxName !== undefined) {
    writeFileSync(join(d, "oh.json"), `${JSON.stringify({ version: 1, name: sandboxName })}\n`);
  }
  return d;
}

interface RecordedCall {
  cmd: string;
  args: string[];
}

function makeRunner(result: RunResult = { status: 0 }): {
  calls: RecordedCall[];
  run: LifecycleRunner;
} {
  const calls: RecordedCall[] = [];
  const run: LifecycleRunner = (cmd, args) => {
    calls.push({ cmd, args: [...args] });
    return result;
  };
  return { calls, run };
}

function makeIo(answers?: string[]): {
  out: string[];
  err: string[];
  asked: string[];
  io: LifecycleIO;
} {
  const out: string[] = [];
  const err: string[] = [];
  const asked: string[] = [];
  const io: LifecycleIO = {
    stdout: (s) => out.push(s),
    stderr: (s) => err.push(s),
  };
  if (answers !== undefined) {
    const queue = [...answers];
    io.ask = async (q: string): Promise<string> => {
      asked.push(q);
      return queue.shift() ?? "";
    };
  }
  return { out, err, asked, io };
}

describe("named volumes — what destroy is about to delete", () => {
  it("enumerates the top-level volumes from the compose file, not the service mounts", () => {
    const root = makeRepo();
    expect(namedVolumes(root)).toEqual(["claude-auth", "codex-auth", "ssh-config"]);
  });

  it("returns nothing rather than throwing when the compose file is absent", () => {
    const d = mkdtempSync(join(tmpdir(), "oh-destroy-bare-"));
    cleanups.push(d);
    expect(namedVolumes(d)).toEqual([]);
  });

  it("reads the real repository's volumes so the prompt cannot drift from compose", () => {
    const root = join(HERE, "..", "..", "..", "..");
    expect(namedVolumes(root)).toContain("claude-auth");
  });
});

describe("destroy confirmation phrase", () => {
  it("prefers the ambient SANDBOX_NAME, matching what compose interpolates", () => {
    vi.stubEnv("SANDBOX_NAME", "from-env");
    expect(destroyConfirmationPhrase(makeRepo("from-file"))).toBe("from-env");
  });

  it("falls back to oh.json, then to the default", () => {
    vi.stubEnv("SANDBOX_NAME", "");
    expect(destroyConfirmationPhrase(makeRepo("from-file"))).toBe("from-file");
    expect(destroyConfirmationPhrase(makeRepo())).toBe("openharness");
  });
});

describe("oh destroy — the confirmation policy", () => {
  it("refuses outright when stdin is not a TTY and --yes is absent", async () => {
    vi.stubEnv("SANDBOX_NAME", "");
    const root = makeRepo("acme");
    const { calls, run } = makeRunner();
    const { err, io } = makeIo();

    expect(await runDestroy({ cwd: root, run }, io)).toBe(1);
    expect(calls).toHaveLength(0);
    expect(err.join("")).toContain("refusing to destroy `acme` without a terminal");
    expect(err.join("")).toContain("--yes");
  });

  it("names the volumes and the auth they hold before it asks", async () => {
    vi.stubEnv("SANDBOX_NAME", "");
    const root = makeRepo("acme");
    const { run } = makeRunner();
    const { out, asked, io } = makeIo(["acme"]);

    expect(await runDestroy({ cwd: root, run }, io)).toBe(0);
    const text = out.join("");
    for (const volume of ["claude-auth", "codex-auth", "ssh-config"]) {
      expect(text, volume).toContain(volume);
    }
    expect(text).toContain("provider authentication");
    expect(asked.join("")).toContain("acme");
  });

  it("aborts and touches nothing on a bare Enter", async () => {
    vi.stubEnv("SANDBOX_NAME", "");
    const root = makeRepo("acme");
    const { calls, run } = makeRunner();
    const { err, io } = makeIo([""]);

    expect(await runDestroy({ cwd: root, run }, io)).toBe(1);
    expect(calls).toHaveLength(0);
    expect(err.join("")).toContain("aborted — nothing was removed");
  });

  it.each(["ACME", "yes", "y", "openharness", "acme acme"])(
    "aborts and touches nothing on the wrong answer %j",
    async (answer) => {
      vi.stubEnv("SANDBOX_NAME", "");
      const root = makeRepo("acme");
      const { calls, run } = makeRunner();
      const { err, io } = makeIo([answer]);

      expect(await runDestroy({ cwd: root, run }, io)).toBe(1);
      expect(calls).toHaveLength(0);
      expect(err.join("")).toContain("aborted");
    },
  );

  it("runs `down -v` through the vendored script once the name matches", async () => {
    vi.stubEnv("SANDBOX_NAME", "");
    const root = makeRepo("acme");
    const { calls, run } = makeRunner();
    const { io } = makeIo(["acme"]);

    expect(await runDestroy({ cwd: root, run }, io)).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0].cmd).toBe("bash");
    expect(calls[0].args[0]).toBe(join(root, ".oh", "scripts", "docker-compose.sh"));
    expect(calls[0].args[1]).toBe("--extra-env-file");
    expect(calls[0].args.slice(3)).toEqual(["down", "-v"]);
  });

  it("skips the prompt entirely under --yes", async () => {
    vi.stubEnv("SANDBOX_NAME", "");
    const root = makeRepo("acme");
    const { calls, run } = makeRunner();
    const { out, asked, io } = makeIo();

    expect(await runDestroy({ cwd: root, run, yes: true }, io)).toBe(0);
    expect(asked).toHaveLength(0);
    expect(out.join("")).toBe("");
    expect(calls[0].args.slice(3)).toEqual(["down", "-v"]);
  });

  it("propagates the child's exit code", async () => {
    vi.stubEnv("SANDBOX_NAME", "");
    const root = makeRepo("acme");
    const { run } = makeRunner({ status: 7 });
    const { io } = makeIo();
    expect(await runDestroy({ cwd: root, run, yes: true }, io)).toBe(7);
  });
});

describe("parseDestroyArgs", () => {
  it("defaults to prompting", () => {
    const parsed = parseDestroyArgs([]);
    expect(parsed).toEqual({ ok: true, args: { help: false, yes: false } });
  });

  it("accepts --yes", () => {
    expect(parseDestroyArgs(["--yes"])).toEqual({
      ok: true,
      args: { help: false, yes: true },
    });
  });

  it.each([["-y"], ["--force"], ["acme"]])("rejects %j — only --yes confirms", (token) => {
    const parsed = parseDestroyArgs([token]);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toContain("--yes");
  });

  it.each([["--help"], ["-h"], ["help"]])("treats %j as help", (token) => {
    expect(parseDestroyArgs([token])).toEqual({ ok: true, args: { help: true, yes: false } });
  });
});

describe("oh compose config", () => {
  it("parses the config subcommand", () => {
    expect(parseComposeArgs(["config"])).toEqual({
      ok: true,
      args: { help: false, subcommand: "config", passthrough: [] },
    });
  });

  it("forwards extra docker compose args after --", () => {
    const parsed = parseComposeArgs(["config", "--", "--services"]);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.args.passthrough).toEqual(["--services"]);
  });

  it("rejects a bare argument rather than guessing", () => {
    const parsed = parseComposeArgs(["config", "--services"]);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toContain("after `--`");
  });

  it("rejects an unknown subcommand and offers help", () => {
    const parsed = parseComposeArgs(["down"]);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error).toContain('unknown subcommand "down"');
      expect(parsed.showHelp).toBe(true);
    }
  });

  it("shows help with no subcommand", () => {
    const parsed = parseComposeArgs([]);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.args.help).toBe(true);
  });

  it("runs `config` through the vendored script", () => {
    const root = makeRepo();
    const { calls, run } = makeRunner();
    expect(runComposeConfig({ cwd: root, run })).toBe(0);
    expect(calls[0].cmd).toBe("bash");
    expect(calls[0].args).toEqual([
      join(root, ".oh", "scripts", "docker-compose.sh"),
      "config",
    ]);
  });

  it("forwards extra args to the script", () => {
    const root = makeRepo();
    const { calls, run } = makeRunner();
    runComposeConfig({ cwd: root, run }, ["--services"]);
    expect(calls[0].args.slice(1)).toEqual(["config", "--services"]);
  });
});

describe("`oh config <integration>` is not overloaded", () => {
  it("keeps compose config out of the integration namespace", () => {
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    printComposeHelp();
    const text = spy.mock.calls.map((c) => String(c[0])).join("");
    expect(text).toContain("oh compose config");
    expect(text).toContain("oh config <integration>");
  });

  it("dispatches compose and config down separate branches in cli.ts", async () => {
    const { readFileSync } = await import("node:fs");
    const cli = readFileSync(join(HERE, "..", "cli.ts"), "utf8");
    expect(cli).toContain('if (first === "compose") {');
    expect(cli).toContain('if (first === "config") {');
    expect(cli).toContain("const INTEGRATIONS: Record<string, Integration> = {};");
  });
});

describe("destroy help", () => {
  it("states the confirmation policy and the --yes gate", () => {
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    printDestroyHelp();
    const text = spy.mock.calls.map((c) => String(c[0])).join("");
    expect(text).toContain("type the sandbox name");
    expect(text).toContain("--yes");
    expect(text).not.toMatch(/\bmake\b/);
  });
});
