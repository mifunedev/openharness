import { afterEach, describe, expect, it, vi } from "vitest";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  runToolInstall,
  runToolList,
  runToolStatus,
  type ToolIO,
} from "../commands/tool.js";
import type { LifecycleRunner, RunResult } from "../lib/execution/runner.js";

vi.mock("../cli.js", async (importOriginal) => {
  const original = process.exit;
  process.exit = (() => {}) as never;
  const mod = await importOriginal<typeof import("../cli.js")>();
  await new Promise((r) => setTimeout(r, 0));
  process.exit = original;
  return mod;
});

const { parseToolArgs, printToolHelp, printOhHelp } = await import("../cli.js");

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const REAL_EXAMPLE = join(REPO_ROOT, ".devcontainer", ".example.env");

const cleanups: string[] = [];
afterEach(() => {
  while (cleanups.length > 0) rmSync(cleanups.pop()!, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function makeRepo(): string {
  const d = mkdtempSync(join(tmpdir(), "oh-tool-"));
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

function makeIo(confirmWith?: boolean): {
  io: ToolIO;
  out: string[];
  err: string[];
  asked: string[];
} {
  const out: string[] = [];
  const err: string[] = [];
  const asked: string[] = [];
  const io: ToolIO = { stdout: (s) => out.push(s), stderr: (s) => err.push(s) };
  if (confirmWith !== undefined) {
    io.confirm = async (q) => {
      asked.push(q);
      return confirmWith;
    };
  }
  return { io, out, err, asked };
}

const isInspect = (cmd: string, args: string[]): boolean =>
  cmd === "docker" && args[0] === "inspect";
const isExecOf = (cmd: string, args: string[], token: string): boolean =>
  cmd === "docker" && args[0] === "exec" && args.some((a) => a.includes(token));

const running: RunResult = { status: 0, stdout: "running\n", stderr: "" };
const exited: RunResult = { status: 0, stdout: "exited\n", stderr: "" };

function liveHost(extra: (cmd: string, args: string[]) => RunResult | undefined = () => undefined) {
  return makeRunner((cmd, args) => {
    const custom = extra(cmd, args);
    if (custom) return custom;
    if (isInspect(cmd, args)) return running;
    if (isExecOf(cmd, args, "command -v agent-browser")) {
      return { status: 1, stdout: "", stderr: "" };
    }
    return undefined;
  });
}

const isInstallCall = (c: RecordedCall): boolean =>
  c.cmd === "docker" && c.args[0] === "exec" && c.args.some((a) => a.includes("--with-deps"));

const flagLine = (root: string): string | undefined =>
  readFileSync(join(root, ".devcontainer", ".env"), "utf8")
    .split("\n")
    .find((l) => /^\s*#?\s*INSTALL_AGENT_BROWSER=/.test(l));

describe("oh tool — argument parsing", () => {
  it("shows help with no args", () => {
    const r = parseToolArgs([]);
    expect(r.ok).toBe(true);
    expect(r.ok && r.args.help).toBe(true);
  });

  it("requires a name for install — there is no obvious default", () => {
    const r = parseToolArgs(["install"]);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.showHelp).toBe(true);
  });

  it("parses the flags", () => {
    const r = parseToolArgs(["install", "agent-browser", "--yes", "--json"]);
    expect(r.ok && r.args.yes).toBe(true);
    expect(r.ok && r.args.json).toBe(true);
    expect(parseToolArgs(["install", "x", "-y"]).ok).toBe(true);
  });

  it("rejects the conflicting persist flags", () => {
    expect(parseToolArgs(["install", "x", "--persist-only", "--no-persist"]).ok).toBe(false);
  });

  it("rejects unknown flags, subcommands, and stray arguments", () => {
    expect(parseToolArgs(["list", "--wat"]).ok).toBe(false);
    expect(parseToolArgs(["frobnicate"]).ok).toBe(false);
    expect(parseToolArgs(["list", "gh"]).ok).toBe(false);
    expect(parseToolArgs(["install", "gh", "extra"]).ok).toBe(false);
  });
});

describe("oh tool — help", () => {
  it("is listed in the top-level usage block", () => {
    const w = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    printOhHelp();
    expect(w.mock.calls.map((c) => String(c[0])).join("")).toContain("oh tool");
  });

  it("names the sibling commands so the category is unambiguous", () => {
    const w = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    printToolHelp();
    const text = w.mock.calls.map((c) => String(c[0])).join("");
    expect(text).toContain("oh harness");
    expect(text).toContain("oh runtime");
    expect(text).toContain("agent-browser");
    expect(text).toContain("gh");
  });
});

describe("oh tool list / status", () => {
  it("lists every tool with its kind", async () => {
    const root = makeRepo();
    const { io, out } = makeIo();
    expect(await runToolList({ cwd: root, run: liveHost().run }, io)).toBe(0);
    const text = out.join("");
    for (const id of ["agent-browser", "herdr", "cloudflared", "docker-cli", "gh"]) {
      expect(text, id).toContain(id);
    }
    expect(text).toContain("baked-in");
    expect(text).toContain("opt-in");
  });

  it("reports a version for tools that declare a probe", async () => {
    const root = makeRepo();
    const { run } = liveHost((cmd, args) =>
      isExecOf(cmd, args, "--version")
        ? { status: 0, stdout: "gh version 2.63.2 (2026-01-01)\n", stderr: "" }
        : undefined,
    );
    const { io, out } = makeIo();
    await runToolStatus("gh", { cwd: root, run, json: true }, io);
    const status = JSON.parse(out.join(""));
    expect(status.version).toContain("2.63.2");
    expect(status.docs).toBe(
      "https://github.com/mifunedev/openharness/blob/main/docs/installation.md",
    );
  });

  it("reports null, not a guess, for a tool with no version probe", async () => {
    const root = makeRepo();
    const { io, out } = makeIo();
    await runToolStatus("herdr", { cwd: root, run: liveHost().run, json: true }, io);
    expect(JSON.parse(out.join("")).version).toBeNull();
  });

  it("never asks an absent binary for its version", async () => {
    const root = makeRepo();
    const { calls, run } = liveHost((cmd, args) =>
      isExecOf(cmd, args, "command -v gh") ? { status: 1, stdout: "", stderr: "" } : undefined,
    );
    const { io } = makeIo();
    await runToolStatus("gh", { cwd: root, run }, io);
    expect(calls.some((c) => isExecOf(c.cmd, c.args, "gh --version"))).toBe(false);
  });

  it("execs nothing when the container is stopped", async () => {
    const root = makeRepo();
    const { calls, run } = makeRunner((cmd, args) => (isInspect(cmd, args) ? exited : undefined));
    const { io, out } = makeIo();
    expect(await runToolList({ cwd: root, run }, io)).toBe(0);
    expect(calls.some((c) => c.args[0] === "exec")).toBe(false);
    expect(out.join("")).toContain("oh sandbox");
  });

  it("rejects an unknown tool with the known list", async () => {
    const root = makeRepo();
    const { io, err } = makeIo();
    expect(await runToolStatus("chromium", { cwd: root, run: liveHost().run }, io)).toBe(1);
    expect(err.join("")).toContain("agent-browser");
  });
});

describe("oh tool install — the ~1 GB download gate", () => {
  it("fails closed when non-interactive without --yes", async () => {
    const root = makeRepo();
    const { calls, run } = liveHost();
    const { io, err } = makeIo();
    expect(await runToolInstall("agent-browser", { cwd: root, run }, io)).toBe(1);
    expect(calls.some(isInstallCall)).toBe(false);
    const text = err.join("");
    expect(text).toContain("~1 GB");
    expect(text).toContain("--yes");
  });

  it("still persists the flag when the download is declined", async () => {
    const root = makeRepo();
    const { io, out } = makeIo(false);
    await runToolInstall("agent-browser", { cwd: root, run: liveHost().run }, io);
    expect(flagLine(root)).toMatch(/^INSTALL_AGENT_BROWSER=true$/);
    expect(out.join("")).toContain("next container start");
  });

  it("asks before downloading, naming the size", async () => {
    const root = makeRepo();
    const { io, asked } = makeIo(true);
    await runToolInstall("agent-browser", { cwd: root, run: liveHost().run }, io);
    expect(asked.join("")).toContain("~1 GB");
  });

  it("installs when the prompt is accepted", async () => {
    const root = makeRepo();
    const { calls, run } = liveHost();
    const { io, out } = makeIo(true);
    expect(await runToolInstall("agent-browser", { cwd: root, run }, io)).toBe(0);
    expect(calls.some(isInstallCall)).toBe(true);
    expect(out.join("")).toContain(
      "https://github.com/mifunedev/openharness/blob/main/docs/installation.md",
    );
  });

  it("--yes bypasses the prompt entirely", async () => {
    const root = makeRepo();
    const { calls, run } = liveHost();
    const { io, asked } = makeIo(false);
    expect(await runToolInstall("agent-browser", { cwd: root, run, yes: true }, io)).toBe(0);
    expect(asked).toEqual([]);
    expect(calls.some(isInstallCall)).toBe(true);
  });

  it("--persist-only never prompts and never downloads", async () => {
    const root = makeRepo();
    const { calls, run } = liveHost();
    const { io, asked } = makeIo(false);
    expect(await runToolInstall("agent-browser", { cwd: root, run, persistOnly: true }, io)).toBe(0);
    expect(asked).toEqual([]);
    expect(calls.some((c) => c.args[0] === "exec")).toBe(false);
    expect(flagLine(root)).toMatch(/^INSTALL_AGENT_BROWSER=true$/);
  });

  it("does not ask when the tool is already installed", async () => {
    const root = makeRepo();
    const { calls, run } = liveHost((cmd, args) =>
      isExecOf(cmd, args, "command -v agent-browser")
        ? { status: 0, stdout: "", stderr: "" }
        : undefined,
    );
    const { io, asked, out } = makeIo(true);
    expect(await runToolInstall("agent-browser", { cwd: root, run }, io)).toBe(0);
    expect(asked).toEqual([]);
    expect(calls.some(isInstallCall)).toBe(false);
    expect(out.join("")).toContain("already installed");
  });
});

describe("oh tool install — the other exits", () => {
  it("refuses a baked-in tool and points at the installable ones", async () => {
    const root = makeRepo();
    const { calls, run } = liveHost();
    const { io, err } = makeIo(true);
    expect(await runToolInstall("gh", { cwd: root, run }, io)).toBe(1);
    const text = err.join("");
    expect(text).toContain("base image");
    expect(text).toContain("agent-browser");
    expect(calls.length).toBe(0);
  });

  it("persists and exits 0 when the sandbox is stopped", async () => {
    const root = makeRepo();
    const { calls, run } = makeRunner((cmd, args) => (isInspect(cmd, args) ? exited : undefined));
    const { io, out } = makeIo(true);
    expect(await runToolInstall("agent-browser", { cwd: root, run }, io)).toBe(0);
    expect(calls.some((c) => c.args[0] === "exec")).toBe(false);
    expect(flagLine(root)).toMatch(/^INSTALL_AGENT_BROWSER=true$/);
    expect(out.join("")).toContain("oh sandbox");
  });

  it("--no-persist leaves .devcontainer/.env untouched", async () => {
    const root = makeRepo();
    const before = readFileSync(join(root, ".devcontainer", ".env"), "utf8");
    const { io } = makeIo(true);
    await runToolInstall("agent-browser", { cwd: root, run: liveHost().run, noPersist: true }, io);
    expect(readFileSync(join(root, ".devcontainer", ".env"), "utf8")).toBe(before);
  });

  it("keeps the flag set when the installer fails", async () => {
    const root = makeRepo();
    const { run } = liveHost((cmd, args) =>
      isExecOf(cmd, args, "--with-deps") ? { status: 7, stdout: "", stderr: "" } : undefined,
    );
    const { io, err } = makeIo(true);
    expect(await runToolInstall("agent-browser", { cwd: root, run }, io)).toBe(7);
    expect(flagLine(root)).toMatch(/^INSTALL_AGENT_BROWSER=true$/);
    expect(err.join("")).toContain("next container start");
  });

  it("rejects an unknown tool", async () => {
    const root = makeRepo();
    const { calls, run } = liveHost();
    const { io } = makeIo(true);
    expect(await runToolInstall("chromium", { cwd: root, run }, io)).toBe(1);
    expect(calls.length).toBe(0);
  });
});

describe("oh tool — inside the sandbox", () => {
  const INSIDE: NodeJS.ProcessEnv = { OH_EXECUTION_TARGET: "local" };

  const inBox = (extra: (cmd: string, args: string[]) => RunResult | undefined = () => undefined) =>
    makeRunner((cmd, args) => {
      const custom = extra(cmd, args);
      if (custom) return custom;
      if (cmd === "bash" && args.join(" ").includes("command -v agent-browser")) {
        return { status: 1, stdout: "", stderr: "" };
      }
      return undefined;
    });

  it("lists real INSTALLED values without a docker inspect", async () => {
    const root = makeRepo();
    const { calls, run } = inBox();
    const { io, out } = makeIo();
    expect(await runToolList({ cwd: root, run, env: INSIDE }, io)).toBe(0);
    expect(calls.some((c) => isInspect(c.cmd, c.args))).toBe(false);
    const text = out.join("");
    expect(text).not.toContain("INSTALLED is `?`");
    expect(text).not.toContain("oh sandbox");
  });

  it("installs live instead of skipping the install", async () => {
    const root = makeRepo();
    const { calls, run } = inBox();
    const { io, out } = makeIo(true);
    expect(await runToolInstall("agent-browser", { cwd: root, run, env: INSIDE }, io)).toBe(0);
    expect(out.join("")).not.toContain("skipping the live install");
    expect(
      calls.some((c) => c.cmd === "bash" && c.args.some((a) => a.includes("--with-deps"))),
    ).toBe(true);
    expect(flagLine(root)).toMatch(/^INSTALL_AGENT_BROWSER=true$/);
  });

  it("reports an already-installed tool without running the installer", async () => {
    const root = makeRepo();
    const { calls, run } = inBox((cmd, args) =>
      cmd === "bash" && args.join(" ").includes("command -v agent-browser")
        ? { status: 0, stdout: "", stderr: "" }
        : undefined,
    );
    const { io, out } = makeIo(true);
    expect(await runToolInstall("agent-browser", { cwd: root, run, env: INSIDE }, io)).toBe(0);
    expect(out.join("")).toContain("already installed");
    expect(calls.some((c) => c.args.some((a) => a.includes("--with-deps")))).toBe(false);
  });

  it("verifies as the sandbox user, never through sudo", async () => {
    const root = makeRepo();
    const { calls, run } = inBox();
    const { io } = makeIo();
    await runToolStatus("gh", { cwd: root, run, env: INSIDE }, io);
    expect(calls.some((c) => c.cmd === "sudo")).toBe(false);
  });
});
