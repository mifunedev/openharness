import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
import { defaultOhConfig, ohConfigPath, type OhConfig } from "../lib/oh-config.js";

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
const readConfig = (root: string): OhConfig =>
  JSON.parse(readFileSync(ohConfigPath(root), "utf8")) as OhConfig;
const installFlag = (root: string, key: keyof NonNullable<OhConfig["install"]>): unknown =>
  readConfig(root).install?.[key];
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

  it("parses the flags", () => {
    const p = parseHarnessArgs(["install", "hermes", "--persist-only", "--json"]);
    expect(p.ok && p.args.persistOnly).toBe(true);
    expect(p.ok && p.args.json).toBe(true);
  });

  it("rejects --persist-only together with --no-persist", () => {
    const p = parseHarnessArgs(["install", "hermes", "--persist-only", "--no-persist"]);
    expect(p.ok).toBe(false);
    expect(!p.ok && p.error).toMatch(/conflicts with/);
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

  it("documents all three subcommands and all three flags", () => {
    const help = captureStdout(printHarnessHelp);
    for (const s of ["oh harness list", "oh harness install", "oh harness status"]) {
      expect(help).toContain(s);
    }
    for (const f of ["--persist-only", "--no-persist", "--json"]) {
      expect(help).toContain(f);
    }
  });

  it("names every installable harness so `<name>` is discoverable", () => {
    const help = captureStdout(printHarnessHelp);
    for (const id of ["claude-code", "codex", "pi", "opencode", "grok-build", "hermes", "t3code"]) {
      expect(help).toContain(id);
    }
  });
});


describe("runHarnessInstall persists the flag", () => {
  it("sets INSTALL_OPENCODE and says so", async () => {
    const root = makeRepo();
    const { run } = makeRunner((c, a) => (isInspect(c, a) ? exited : undefined));
    const { out, io } = makeIo();

    expect(await runHarnessInstall("opencode", { cwd: root, run }, io)).toBe(0);
    expect(installFlag(root, "opencode")).toBe(true);
    expect(text(out)).toContain("install.opencode");
  });

  it("maps the slug to the underscored key — grok-build -> INSTALL_GROK_BUILD", async () => {
    const root = makeRepo();
    const { run } = makeRunner((c, a) => (isInspect(c, a) ? exited : undefined));
    expect(await runHarnessInstall("grok-build", { cwd: root, run }, makeIo().io)).toBe(0);
    expect(installFlag(root, "grokBuild")).toBe(true);
  });

  it("does NOT write oh.json for a harness with no install field", async () => {
    const root = makeRepo();
    const before = readFileSync(ohConfigPath(root), "utf8");
    const { run } = makeRunner((c, a) => (isInspect(c, a) ? exited : undefined));
    const { out, io } = makeIo();

    expect(await runHarnessInstall("claude-code", { cwd: root, run }, io)).toBe(0);
    expect(readFileSync(ohConfigPath(root), "utf8")).toBe(before);
    expect(text(out)).toMatch(/no oh\.json install field/);
  });

  it("--no-persist leaves oh.json untouched", async () => {
    const root = makeRepo();
    const before = readFileSync(ohConfigPath(root), "utf8");
    const { run } = makeRunner((c, a) => (isInspect(c, a) ? exited : undefined));

    await runHarnessInstall("hermes", { cwd: root, run, noPersist: true }, makeIo().io);
    expect(readFileSync(ohConfigPath(root), "utf8")).toBe(before);
  });

  it("--persist-only writes the flag and never touches the container", async () => {
    const root = makeRepo();
    const { calls, run } = makeRunner();
    expect(
      await runHarnessInstall("hermes", { cwd: root, run, persistOnly: true }, makeIo().io),
    ).toBe(0);
    expect(installFlag(root, "hermes")).toBe(true);
    expect(calls.filter((c) => c.cmd === "docker")).toEqual([]);
  });

  it("creates oh.json when it is missing", async () => {
    const root = makeRepo();
    rmSync(ohConfigPath(root));
    const { run } = makeRunner((c, a) => (isInspect(c, a) ? exited : undefined));
    const { out, io } = makeIo();

    expect(await runHarnessInstall("hermes", { cwd: root, run }, io)).toBe(0);
    expect(text(out)).toContain("install.hermes");
    expect(installFlag(root, "hermes")).toBe(true);
  });
});


describe("runHarnessInstall against the container", () => {
  it("on a stopped sandbox: exits 0, sets the flag, hints, and runs zero docker exec", async () => {
    const root = makeRepo();
    const { calls, run } = makeRunner((c, a) => (isInspect(c, a) ? exited : undefined));
    const { out, io } = makeIo();

    expect(await runHarnessInstall("opencode", { cwd: root, run }, io)).toBe(0);
    expect(installFlag(root, "opencode")).toBe(true);
    expect(text(out)).toContain("oh sandbox");
    expect(execCalls(calls)).toEqual([]);
  });

  it("on a never-provisioned sandbox: same, treating absent as not-yet-started", async () => {
    const root = makeRepo();
    const { calls, run } = makeRunner((c, a) =>
      isInspect(c, a) ? { status: 1, stdout: "", stderr: "No such object" } : undefined,
    );
    const { out, io } = makeIo();

    expect(await runHarnessInstall("hermes", { cwd: root, run }, io)).toBe(0);
    expect(text(out)).toContain("oh sandbox");
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

    expect(await runHarnessInstall("opencode", { cwd: root, run }, io)).toBe(0);

    const install = execCalls(calls).find((c) => c.args.includes("opencode-ai"));
    expect(install).toBeDefined();
    expect(install!.args).toContain("-u");
    // #908: every harness installs as the sandbox user into the home mount.
    expect(install!.args).toContain("sandbox");
    expect(install!.args).not.toContain("root");
    expect(install!.args.slice(-6)).toEqual([
      "npm",
      "--prefix",
      "/home/sandbox/.local",
      "install",
      "-g",
      "opencode-ai",
    ]);
    expect(text(out)).toContain("installed");
    expect(text(out)).toContain(
      "https://github.com/mifunedev/openharness/blob/main/docs/harnesses/opencode.md",
    );
  });

  it("is a no-op when the binary is already present", async () => {
    const root = makeRepo();
    const { calls, run } = makeRunner((c, a) => (isInspect(c, a) ? running : undefined));
    const { out, io } = makeIo();

    expect(await runHarnessInstall("opencode", { cwd: root, run }, io)).toBe(0);
    expect(execCalls(calls).some((c) => c.args.includes("opencode-ai"))).toBe(false);
    expect(text(out)).toContain("already installed");
    expect(installFlag(root, "opencode")).toBe(true);
  });

  it("keeps the persisted flag when the installer fails, and says the rebuild will pick it up", async () => {
    const root = makeRepo();
    const { run } = makeRunner((c, a) => {
      if (isInspect(c, a)) return running;
      if (isExecOf(c, a, "--version")) return { status: 1, stdout: "", stderr: "" };
      return { status: 7, stdout: "", stderr: "network unreachable" };
    });
    const { err, io } = makeIo();

    expect(await runHarnessInstall("opencode", { cwd: root, run }, io)).toBe(7);
    expect(installFlag(root, "opencode")).toBe(true);
    expect(text(err)).toContain("install.opencode=true");
  });

  it("reports a missing docker binary without losing the persisted flag", async () => {
    const root = makeRepo();
    const run: LifecycleRunner = () => ({
      status: null,
      error: Object.assign(new Error("spawn docker ENOENT"), { code: "ENOENT" }),
    });
    const { err, io } = makeIo();

    expect(await runHarnessInstall("hermes", { cwd: root, run }, io)).toBe(1);
    expect(text(err)).toMatch(/docker is required/);
    expect(installFlag(root, "hermes")).toBe(true);
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
    expect(rendered).toMatch(/HARNESS\s+KIND\s+ENABLED\s+INSTALLED/);
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

  it("--json emits the same data machine-readably", async () => {
    const root = makeRepo();
    writeFileSync(
      ohConfigPath(root),
      `${JSON.stringify({ ...defaultOhConfig("probe"), install: { hermes: true } }, null, 2)}\n`,
    );
    const { run } = makeRunner((c, a) => {
      if (isInspect(c, a)) return exited;
      if (c === "sh" && a.includes("INSTALL_HERMES")) {
        return { status: 0, stdout: "true\n", stderr: "" };
      }
      return undefined;
    });
    const { out, io } = makeIo();

    await runHarnessList({ cwd: root, run, json: true }, io);
    const parsed = JSON.parse(text(out));
    expect(parsed).toHaveLength(HARNESS_CATALOG.length);
    expect(parsed.find((h: { id: string }) => h.id === "hermes").enabled).toBe(true);
    expect(parsed.find((h: { id: string }) => h.id === "codex").enabled).toBeNull();
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

  it("--defaults probes only the default harnesses, never the registry-touching ones", async () => {
    const root = makeRepo();
    const { calls, run } = makeRunner();
    const { out, io } = makeIo();
    expect(
      await runHarnessList(
        { cwd: root, run, env: INSIDE_SANDBOX, json: true, defaultsOnly: true },
        io,
      ),
    ).toBe(0);
    expect(JSON.parse(text(out)).map((h: { id: string }) => h.id)).toEqual([
      "claude-code",
      "codex",
      "pi",
    ]);
    expect(calls.map((c) => c.cmd).sort()).toEqual(["claude", "codex", "pi"]);
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
    expect(text(out)).not.toContain("skipping the live install");
    // #908: this previously asserted `cmd === "sudo"`, codifying the very defect
    // that made `oh harness install opencode` hang inside the sandbox —
    // stdio:"inherit" selects plain `sudo --`, and sandbox has no NOPASSWD.
    expect(calls.some((c) => c.cmd === "sudo")).toBe(false);
    expect(calls.some((c) => c.args.includes("opencode-ai"))).toBe(true);
    expect(installFlag(root, "opencode")).toBe(true);
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
