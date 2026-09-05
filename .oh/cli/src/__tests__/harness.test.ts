import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return { ...actual, userInfo: () => ({ ...actual.userInfo(), username: "sandbox", uid: 1000 }) };
});
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PROBE_TIMEOUT_MS,
  runHarnessInstall,
  runHarnessList,
  runHarnessStatus,
  type HarnessIO,
} from "../commands/harness.js";
import type { LifecycleRunner, RunResult } from "../lib/execution/runner.js";
import { HARNESS_CATALOG } from "../lib/harnesses/catalog.js";
import { defaultOhConfig, ohConfigPath } from "../lib/oh-config.js";

vi.mock("../cli.js", async (importOriginal) => {
  const original = process.exit;
  process.exit = (() => {}) as never;
  const mod = await importOriginal<typeof import("../cli.js")>();
  await new Promise((r) => setTimeout(r, 0));
  process.exit = original;
  return mod;
});

const { parseHarnessArgs, printHarnessHelp, printOhHelp } = await import("../cli.js");

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

const cleanups: string[] = [];
afterEach(() => {
  while (cleanups.length > 0) rmSync(cleanups.pop()!, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function makeRepo(): string {
  const d = mkdtempSync(join(tmpdir(), "oh-harness-cmd-"));
  cleanups.push(d);
  mkdirSync(join(d, ".oh", "scripts"), { recursive: true });
  mkdirSync(join(d, ".devcontainer"), { recursive: true });
  writeFileSync(ohConfigPath(d), `${JSON.stringify(defaultOhConfig("probe"), null, 2)}\n`);
  return d;
}

interface RecordedCall {
  cmd: string;
  args: string[];
  timeoutMs?: number;
}

function makeRunner(
  reply: (cmd: string, args: string[]) => RunResult | undefined = () => undefined,
): { calls: RecordedCall[]; run: LifecycleRunner } {
  const calls: RecordedCall[] = [];
  const run: LifecycleRunner = (cmd, args, opts) => {
    calls.push({
      cmd,
      args: [...args],
      ...(opts.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {}),
    });
    return reply(cmd, args) ?? { status: 0, stdout: "", stderr: "" };
  };
  return { calls, run };
}

function isInspect(cmd: string, args: string[]): boolean {
  return cmd === "docker" && args[0] === "inspect";
}

function isExecOf(cmd: string, args: string[], token: string): boolean {
  return cmd === "docker" && args[0] === "exec" && args.includes(token);
}

const running: RunResult = { status: 0, stdout: "running\n", stderr: "" };
const exited: RunResult = { status: 0, stdout: "exited\n", stderr: "" };

function makeIo(): { out: string[]; err: string[]; io: HarnessIO } {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, io: { stdout: (s) => out.push(s), stderr: (s) => err.push(s) } };
}

const text = (lines: string[]): string => lines.join("");
const execCalls = (calls: RecordedCall[]): RecordedCall[] =>
  calls.filter((c) => c.cmd === "docker" && c.args[0] === "exec");


describe("parseHarnessArgs", () => {
  it("treats a bare `oh harness` and a help flag as help", () => {
    for (const argv of [[], ["--help"], ["-h"], ["help"]]) {
      const p = parseHarnessArgs(argv);
      expect(p.ok && p.args.help).toBe(true);
    }
  });

  it("parses each subcommand", () => {
    const list = parseHarnessArgs(["list"]);
    expect(list.ok && list.args.subcommand).toBe("list");
    const status = parseHarnessArgs(["status", "hermes"]);
    expect(status.ok && status.args.name).toBe("hermes");
    const install = parseHarnessArgs(["install", "opencode"]);
    expect(install.ok && install.args.subcommand).toBe("install");
  });

  it("parses --json, the only flag left", () => {
    const p = parseHarnessArgs(["status", "hermes", "--json"]);
    expect(p.ok && p.args.json).toBe(true);
    expect(Object.keys(p.ok ? p.args : {}).sort()).toEqual(["help", "json", "name", "subcommand"]);
  });

  it("rejects the retired persistence flags as unknown", () => {
    for (const flag of ["--persist" + "-only", "--no-" + "persist", "--" + "defaults"]) {
      const p = parseHarnessArgs(["install", "hermes", flag]);
      expect(p.ok, flag).toBe(false);
      expect(!p.ok && p.error, flag).toMatch(/unknown flag/);
    }
  });

  it("requires a name for install", () => {
    const p = parseHarnessArgs(["install"]);
    expect(p.ok).toBe(false);
    expect(!p.ok && p.error).toMatch(/name is required/);
  });

  it("rejects an unknown subcommand and an unknown flag", () => {
    expect(parseHarnessArgs(["frobnicate"]).ok).toBe(false);
    expect(parseHarnessArgs(["list", "--wat"]).ok).toBe(false);
  });

  it("rejects extra positionals", () => {
    expect(parseHarnessArgs(["install", "hermes", "extra"]).ok).toBe(false);
    expect(parseHarnessArgs(["list", "hermes"]).ok).toBe(false);
  });
});


function captureStdout(fn: () => void): string {
  const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  fn();
  const out = spy.mock.calls.map((c) => String(c[0])).join("");
  spy.mockRestore();
  return out;
}

describe("help", () => {
  it("lists `oh harness` in the top-level Usage block", () => {
    expect(captureStdout(printOhHelp)).toMatch(/^ {2}oh harness /m);
  });

  it("documents all three subcommands and the one flag", () => {
    const help = captureStdout(printHarnessHelp);
    for (const s of ["oh harness list", "oh harness install", "oh harness status"]) {
      expect(help).toContain(s);
    }
    expect(help).toContain("--json");
  });

  it("promises no boot-time or rebuild-time install", () => {
    const help = captureStdout(printHarnessHelp);
    expect(help).not.toMatch(/next (image build|container start|build)/);
    expect(help).not.toMatch(/persist-only|no-persist|install\.\*/);
  });

  it("names every installable harness so `<name>` is discoverable", () => {
    const help = captureStdout(printHarnessHelp);
    for (const id of ["claude-code", "codex", "pi", "opencode", "grok-build", "hermes", "t3code"]) {
      expect(help).toContain(id);
    }
  });
});


describe("runHarnessInstall never touches oh.json", () => {
  const live = (): { calls: RecordedCall[]; run: LifecycleRunner } => {
    let probes = 0;
    return makeRunner((c, a) => {
      if (isInspect(c, a)) return running;
      if (isExecOf(c, a, "--version")) return { status: probes++ === 0 ? 1 : 0, stdout: "", stderr: "" };
      return undefined;
    });
  };

  it.each(["opencode", "grok-build", "hermes", "claude-code"])(
    "%s: leaves the config byte-identical",
    async (id) => {
      const root = makeRepo();
      const before = readFileSync(ohConfigPath(root), "utf8");
      const { out, io } = makeIo();

      expect(await runHarnessInstall(id, { cwd: root, run: live().run }, io)).toBe(0);
      expect(readFileSync(ohConfigPath(root), "utf8")).toBe(before);
      expect(text(out)).not.toMatch(/oh\.json/);
    },
  );

  it("does not create oh.json when it is missing", async () => {
    const root = makeRepo();
    rmSync(ohConfigPath(root));
    const { out, io } = makeIo();

    expect(await runHarnessInstall("hermes", { cwd: root, run: live().run }, io)).toBe(0);
    expect(existsSync(ohConfigPath(root))).toBe(false);
    expect(text(out)).toContain("installed");
  });
});


describe.each(["opencode", "muse-code"])("runHarnessInstall %s against the container", (harness) => {
  it("on a stopped sandbox: fails, points at `oh sandbox`, and runs zero docker exec", async () => {
    const root = makeRepo();
    const before = readFileSync(ohConfigPath(root), "utf8");
    const { calls, run } = makeRunner((c, a) => (isInspect(c, a) ? exited : undefined));
    const { err, io } = makeIo();

    expect(await runHarnessInstall(harness, { cwd: root, run }, io)).toBe(1);
    expect(readFileSync(ohConfigPath(root), "utf8")).toBe(before);
    expect(text(err)).toContain("oh sandbox");
    expect(text(err)).not.toMatch(/next|later|picks it up/);
    expect(execCalls(calls)).toEqual([]);
  });

  it("on a never-provisioned sandbox: same, treating absent as not-yet-started", async () => {
    const root = makeRepo();
    const { calls, run } = makeRunner((c, a) =>
      isInspect(c, a) ? { status: 1, stdout: "", stderr: "No such object" } : undefined,
    );
    const { err, io } = makeIo();

    expect(await runHarnessInstall("hermes", { cwd: root, run }, io)).toBe(1);
    expect(text(err)).toContain("oh sandbox");
    expect(execCalls(calls)).toEqual([]);
  });

  it("runs the installer argv as the right user when the sandbox is running", async () => {
    const root = makeRepo();
    const { calls, run } = makeRunner((c, a) => {
      if (isInspect(c, a)) return running;
      if (isExecOf(c, a, "--version")) return { status: 1, stdout: "", stderr: "not found" };
      return undefined;
    });
    const { out, io } = makeIo();

    const before = readFileSync(ohConfigPath(root), "utf8");
    expect(await runHarnessInstall(harness, { cwd: root, run }, io)).toBe(0);
    expect(readFileSync(ohConfigPath(root), "utf8")).toBe(before);

    const entry = HARNESS_CATALOG.find((h) => h.id === harness)!;
    const install = execCalls(calls).find((c) => c.args.includes(entry.installArgv.at(-1)!));
    expect(install).toBeDefined();
    expect(install!.args).toContain("-u");
    // #908: every harness installs as the sandbox user into the home mount.
    expect(install!.args).toContain("sandbox");
    expect(install!.args).not.toContain("root");
    expect(install!.args.slice(-entry.installArgv.length)).toEqual(entry.installArgv);
    expect(text(out)).toContain("installed");
    expect(text(out)).toContain(
      `https://github.com/mifunedev/openharness/blob/main/docs/harnesses/${harness}.md`,
    );
  });

  it("is a no-op when the binary is already present", async () => {
    const root = makeRepo();
    const { calls, run } = makeRunner((c, a) => (isInspect(c, a) ? running : undefined));
    const { out, io } = makeIo();

    expect(await runHarnessInstall(harness, { cwd: root, run }, io)).toBe(0);
    expect(execCalls(calls)).toHaveLength(1);
    expect(execCalls(calls)[0].args.slice(-2)).toEqual(HARNESS_CATALOG.find((h) => h.id === harness)!.verifyArgv);
    expect(text(out)).toContain("already installed");
  });

  it("surfaces the installer's exit code and promises no retry", async () => {
    const root = makeRepo();
    const before = readFileSync(ohConfigPath(root), "utf8");
    const { run } = makeRunner((c, a) => {
      if (isInspect(c, a)) return running;
      if (isExecOf(c, a, "--version")) return { status: 1, stdout: "", stderr: "" };
      return { status: 7, stdout: "", stderr: "network unreachable" };
    });
    const { err, io } = makeIo();

    expect(await runHarnessInstall(harness, { cwd: root, run }, io)).toBe(7);
    expect(readFileSync(ohConfigPath(root), "utf8")).toBe(before);
    expect(text(err)).toContain("failed (exit 7)");
    expect(text(err)).not.toMatch(/oh\.json|will install it|will retry it/);
  });

  it("reports a missing docker binary", async () => {
    const root = makeRepo();
    const run: LifecycleRunner = () => ({
      status: null,
      error: Object.assign(new Error("spawn docker ENOENT"), { code: "ENOENT" }),
    });
    const { err, io } = makeIo();

    expect(await runHarnessInstall("hermes", { cwd: root, run }, io)).toBe(1);
    expect(text(err)).toMatch(/docker is required/);
  });

  it("rejects an unknown harness with the valid ids and writes nothing", async () => {
    const root = makeRepo();
    const before = readFileSync(ohConfigPath(root), "utf8");
    const { calls, run } = makeRunner();
    const { err, io } = makeIo();

    expect(await runHarnessInstall("emacs", { cwd: root, run }, io)).toBe(1);
    expect(text(err)).toContain('unknown harness "emacs"');
    expect(text(err)).toContain("opencode");
    expect(readFileSync(ohConfigPath(root), "utf8")).toBe(before);
    expect(calls).toEqual([]);
  });

  it("is idempotent — a second identical run changes nothing", async () => {
    const root = makeRepo();
    const { run } = makeRunner((c, a) => (isInspect(c, a) ? running : undefined));
    await runHarnessInstall("hermes", { cwd: root, run }, makeIo().io);
    const once = readFileSync(ohConfigPath(root), "utf8");

    const { out, io } = makeIo();
    expect(await runHarnessInstall("hermes", { cwd: root, run }, io)).toBe(0);
    expect(readFileSync(ohConfigPath(root), "utf8")).toBe(once);
    expect(text(out)).toContain("already");
  });
});


describe("runHarnessList", () => {
  it("renders one row per catalog entry with the state columns", async () => {
    const root = makeRepo();
    const { run } = makeRunner((c, a) => (isInspect(c, a) ? exited : undefined));
    const { out, io } = makeIo();

    expect(await runHarnessList({ cwd: root, run }, io)).toBe(0);
    const rendered = text(out);
    expect(rendered).toMatch(/^HARNESS\s+KIND\s+INSTALLED$/m);
    expect(rendered).not.toMatch(/ENABLED/);
    for (const id of ["claude-code", "opencode", "grok-build", "hermes", "t3code"]) {
      expect(rendered).toMatch(new RegExp(`^${id}\\s`, "m"));
    }
  });

  it("marks INSTALLED unknown and explains why when the sandbox is down", async () => {
    const root = makeRepo();
    const { calls, run } = makeRunner((c, a) => (isInspect(c, a) ? exited : undefined));
    const { out, io } = makeIo();

    await runHarnessList({ cwd: root, run }, io);
    expect(text(out)).toContain("not running");
    expect(execCalls(calls)).toEqual([]);
  });

  it("--json emits the same data machine-readably, with no enabled field", async () => {
    const root = makeRepo();
    writeFileSync(
      ohConfigPath(root),
      `${JSON.stringify({ ...defaultOhConfig("probe"), install: { hermes: true } }, null, 2)}\n`,
    );
    const { run } = makeRunner((c, a) => (isInspect(c, a) ? exited : undefined));
    const { out, io } = makeIo();

    await runHarnessList({ cwd: root, run, json: true }, io);
    const parsed = JSON.parse(text(out)) as Record<string, unknown>[];
    expect(parsed).toHaveLength(HARNESS_CATALOG.length);
    for (const row of parsed) {
      expect(Object.keys(row).sort(), String(row.id)).toEqual([
        "binary",
        "docs",
        "id",
        "installed",
        "kind",
        "title",
      ]);
      expect(["installable", "on-demand"], String(row.id)).toContain(row.kind);
    }
  });

  it("reports a harness as installed when its verify probe exits 0", async () => {
    const root = makeRepo();
    const { run } = makeRunner((c, a) => {
      if (isInspect(c, a)) return running;
      if (isExecOf(c, a, "hermes")) return { status: 1, stdout: "", stderr: "" };
      return { status: 0, stdout: "1.0.0\n", stderr: "" };
    });
    const { out, io } = makeIo();

    await runHarnessList({ cwd: root, run, json: true }, io);
    const parsed = JSON.parse(text(out));
    expect(parsed.find((h: { id: string }) => h.id === "claude-code").installed).toBe(true);
    expect(parsed.find((h: { id: string }) => h.id === "hermes").installed).toBe(false);
  });
});

describe("runHarnessList — a hung verify probe cannot stall the boot path", () => {
  const INSIDE_SANDBOX: NodeJS.ProcessEnv = { OH_EXECUTION_TARGET: "local" };

  it("bounds every probe spawn with a timeout", async () => {
    const root = makeRepo();
    const { calls, run } = makeRunner();
    await runHarnessList({ cwd: root, run, env: INSIDE_SANDBOX, json: true }, makeIo().io);
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) expect(call.timeoutMs).toBe(PROBE_TIMEOUT_MS);
  });

  it("reports a timed-out probe as unknown rather than throwing", async () => {
    const root = makeRepo();
    const { run } = makeRunner((cmd) =>
      cmd === "npx"
        ? { status: null, error: { code: "ETIMEDOUT", message: "spawnSync npx ETIMEDOUT" } }
        : undefined,
    );
    const { out, io } = makeIo();
    expect(await runHarnessList({ cwd: root, run, env: INSIDE_SANDBOX, json: true }, io)).toBe(0);
    const parsed = JSON.parse(text(out));
    expect(parsed.find((h: { id: string }) => h.id === "t3code").installed).toBeNull();
    expect(parsed.find((h: { id: string }) => h.id === "claude-code").installed).toBe(true);
  });
});

describe("runHarnessStatus", () => {
  it("with no name behaves like list", async () => {
    const root = makeRepo();
    const { run } = makeRunner((c, a) => (isInspect(c, a) ? exited : undefined));
    const { out, io } = makeIo();

    expect(await runHarnessStatus(undefined, { cwd: root, run, json: true }, io)).toBe(0);
    expect(JSON.parse(text(out))).toHaveLength(HARNESS_CATALOG.length);
  });

  it("with a name reports that one harness as an object", async () => {
    const root = makeRepo();
    const { run } = makeRunner((c, a) => (isInspect(c, a) ? exited : undefined));
    const { out, io } = makeIo();

    expect(await runHarnessStatus("hermes", { cwd: root, run, json: true }, io)).toBe(0);
    const parsed = JSON.parse(text(out));
    expect(parsed.id).toBe("hermes");
    expect(parsed.docs).toBe(
      "https://github.com/mifunedev/openharness/blob/main/docs/harnesses/hermes.md",
    );
  });

  it("rejects an unknown name with the valid ids", async () => {
    const root = makeRepo();
    const { run } = makeRunner();
    const { err, io } = makeIo();

    expect(await runHarnessStatus("emacs", { cwd: root, run }, io)).toBe(1);
    expect(text(err)).toContain('unknown harness "emacs"');
  });
});

describe("oh harness — inside the sandbox", () => {
  const INSIDE: NodeJS.ProcessEnv = { OH_EXECUTION_TARGET: "local" };

  it("installs live instead of skipping the install", async () => {
    const root = makeRepo();
    const { calls, run } = makeRunner((cmd) =>
      cmd === "opencode" ? { status: 1, stdout: "", stderr: "" } : undefined,
    );
    const { io, out } = makeIo();
    expect(await runHarnessInstall("opencode", { cwd: root, run, env: INSIDE }, io)).toBe(0);
    expect(text(out)).toContain("installed");
    // #908: this previously asserted `cmd === "sudo"`, codifying the very defect
    // that made `oh harness install opencode` hang inside the sandbox —
    // stdio:"inherit" selects plain `sudo --`, and sandbox has no NOPASSWD.
    expect(calls.some((c) => c.cmd === "sudo")).toBe(false);
    expect(calls.some((c) => c.args.includes("opencode-ai"))).toBe(true);
  });

  it("verifies as the sandbox user, never through sudo", async () => {
    const root = makeRepo();
    const { calls, run } = makeRunner();
    const { io } = makeIo();
    expect(await runHarnessList({ cwd: root, run, env: INSIDE }, io)).toBe(0);
    expect(calls.some((c) => c.cmd === "sudo")).toBe(false);
    expect(calls.some((c) => c.cmd === "claude" && c.args.includes("--version"))).toBe(true);
  });

  it("reports real INSTALLED values without a docker inspect", async () => {
    const root = makeRepo();
    const { calls, run } = makeRunner();
    const { io, out } = makeIo();
    expect(await runHarnessStatus("claude-code", { cwd: root, run, env: INSIDE }, io)).toBe(0);
    expect(calls.some((c) => isInspect(c.cmd, c.args))).toBe(false);
    expect(text(out)).not.toContain("INSTALLED is `?`");
  });
});
