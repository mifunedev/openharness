import { afterEach, describe, expect, it, vi } from "vitest";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  runHarnessInstall,
  runHarnessList,
  runHarnessStatus,
  type HarnessIO,
} from "../commands/harness.js";
import type { LifecycleRunner, RunResult } from "../lib/execution/runner.js";
import { HARNESS_CATALOG } from "../lib/harnesses/catalog.js";

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
const REAL_EXAMPLE = join(REPO_ROOT, ".devcontainer", ".example.env");

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
  copyFileSync(REAL_EXAMPLE, join(d, ".devcontainer", ".example.env"));
  copyFileSync(REAL_EXAMPLE, join(d, ".devcontainer", ".env"));
  return d;
}

interface RecordedCall {
  cmd: string;
  args: string[];
}

function makeRunner(
  reply: (cmd: string, args: string[]) => RunResult | undefined = () => undefined,
): { calls: RecordedCall[]; run: LifecycleRunner } {
  const calls: RecordedCall[] = [];
  const run: LifecycleRunner = (cmd, args) => {
    calls.push({ cmd, args: [...args] });
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
const readEnv = (root: string): string =>
  readFileSync(join(root, ".devcontainer", ".env"), "utf8");
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
    for (const id of ["claude-code", "codex", "pi", "opencode", "grok-build", "deepagents", "hermes", "t3code"]) {
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
    expect(readEnv(root)).toMatch(/^INSTALL_OPENCODE=true$/m);
    expect(text(out)).toContain("INSTALL_OPENCODE");
  });

  it("maps the slug to the underscored key — grok-build -> INSTALL_GROK_BUILD", async () => {
    const root = makeRepo();
    const { run } = makeRunner((c, a) => (isInspect(c, a) ? exited : undefined));
    expect(await runHarnessInstall("grok-build", { cwd: root, run }, makeIo().io)).toBe(0);
    expect(readEnv(root)).toMatch(/^INSTALL_GROK_BUILD=true$/m);
  });

  it("does NOT write .devcontainer/.env for a harness with no install key", async () => {
    const root = makeRepo();
    const before = readEnv(root);
    const { run } = makeRunner((c, a) => (isInspect(c, a) ? exited : undefined));
    const { out, io } = makeIo();

    expect(await runHarnessInstall("claude-code", { cwd: root, run }, io)).toBe(0);
    expect(readEnv(root)).toBe(before);
    expect(text(out)).toMatch(/no \.devcontainer\/\.env install key/);
  });

  it("--no-persist leaves .devcontainer/.env untouched", async () => {
    const root = makeRepo();
    const before = readEnv(root);
    const { run } = makeRunner((c, a) => (isInspect(c, a) ? exited : undefined));

    await runHarnessInstall("hermes", { cwd: root, run, noPersist: true }, makeIo().io);
    expect(readEnv(root)).toBe(before);
  });

  it("--persist-only writes the flag and never touches the container", async () => {
    const root = makeRepo();
    const { calls, run } = makeRunner();
    expect(
      await runHarnessInstall("hermes", { cwd: root, run, persistOnly: true }, makeIo().io),
    ).toBe(0);
    expect(readEnv(root)).toMatch(/^INSTALL_HERMES=true$/m);
    expect(calls.filter((c) => c.cmd === "docker")).toEqual([]);
  });

  it("seeds .devcontainer/.env from the example when it is missing", async () => {
    const root = makeRepo();
    rmSync(join(root, ".devcontainer", ".env"));
    const { run } = makeRunner((c, a) => (isInspect(c, a) ? exited : undefined));
    const { out, io } = makeIo();

    expect(await runHarnessInstall("hermes", { cwd: root, run }, io)).toBe(0);
    expect(text(out)).toContain("create .devcontainer/.env");
    expect(readEnv(root)).toMatch(/^INSTALL_HERMES=true$/m);
  });
});


describe("runHarnessInstall against the container", () => {
  it("on a stopped sandbox: exits 0, sets the flag, hints, and runs zero docker exec", async () => {
    const root = makeRepo();
    const { calls, run } = makeRunner((c, a) => (isInspect(c, a) ? exited : undefined));
    const { out, io } = makeIo();

    expect(await runHarnessInstall("opencode", { cwd: root, run }, io)).toBe(0);
    expect(readEnv(root)).toMatch(/^INSTALL_OPENCODE=true$/m);
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
    expect(install!.args).toContain("root");
    expect(install!.args.slice(-4)).toEqual(["npm", "install", "-g", "opencode-ai"]);
    expect(text(out)).toContain("installed");
    expect(text(out)).toContain(
      "https://github.com/mifunedev/openharness/blob/main/docs/harnesses/opencode.md",
    );
  });

  it("installs deepagents as the sandbox user, not root", async () => {
    const root = makeRepo();
    const { calls, run } = makeRunner((c, a) => {
      if (isInspect(c, a)) return running;
      if (isExecOf(c, a, "--version")) return { status: 1, stdout: "", stderr: "" };
      return undefined;
    });

    await runHarnessInstall("deepagents", { cwd: root, run }, makeIo().io);
    const install = execCalls(calls).find((c) => c.args.includes("deepagents-cli"));
    expect(install!.args[install!.args.indexOf("-u") + 1]).toBe("sandbox");
  });

  it("is a no-op when the binary is already present", async () => {
    const root = makeRepo();
    const { calls, run } = makeRunner((c, a) => (isInspect(c, a) ? running : undefined));
    const { out, io } = makeIo();

    expect(await runHarnessInstall("opencode", { cwd: root, run }, io)).toBe(0);
    expect(execCalls(calls).some((c) => c.args.includes("opencode-ai"))).toBe(false);
    expect(text(out)).toContain("already installed");
    expect(readEnv(root)).toMatch(/^INSTALL_OPENCODE=true$/m);
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
    expect(readEnv(root)).toMatch(/^INSTALL_OPENCODE=true$/m);
    expect(text(err)).toContain("INSTALL_OPENCODE=true");
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
    expect(readEnv(root)).toMatch(/^INSTALL_HERMES=true$/m);
  });

  it("rejects an unknown harness with the valid ids and writes nothing", async () => {
    const root = makeRepo();
    const before = readEnv(root);
    const { calls, run } = makeRunner();
    const { err, io } = makeIo();

    expect(await runHarnessInstall("emacs", { cwd: root, run }, io)).toBe(1);
    expect(text(err)).toContain('unknown harness "emacs"');
    expect(text(err)).toContain("opencode");
    expect(readEnv(root)).toBe(before);
    expect(calls).toEqual([]);
  });

  it("is idempotent — a second identical run changes nothing", async () => {
    const root = makeRepo();
    const { run } = makeRunner((c, a) => (isInspect(c, a) ? running : undefined));
    await runHarnessInstall("hermes", { cwd: root, run }, makeIo().io);
    const once = readEnv(root);

    const { out, io } = makeIo();
    expect(await runHarnessInstall("hermes", { cwd: root, run }, io)).toBe(0);
    expect(readEnv(root)).toBe(once);
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
    writeFileSync(join(root, ".devcontainer", ".env"), "INSTALL_HERMES=true\n");
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
    expect(calls.some((c) => c.cmd === "sudo" && c.args.includes("opencode-ai"))).toBe(true);
    expect(readEnv(root)).toMatch(/^INSTALL_OPENCODE=true$/m);
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
