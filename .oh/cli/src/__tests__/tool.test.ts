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
  runToolInstall,
  runToolList,
  runToolStatus,
  type ToolIO,
} from "../commands/tool.js";
import type { LifecycleRunner, RunResult } from "../lib/execution/runner.js";
import { defaultOhConfig, ohConfigPath } from "../lib/oh-config.js";

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
  writeFileSync(ohConfigPath(d), `${JSON.stringify(defaultOhConfig("probe"), null, 2)}\n`);
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

const configText = (root: string): string => readFileSync(ohConfigPath(root), "utf8");

const absentTailscale = (cmd: string, args: string[]): RunResult | undefined =>
  isExecOf(cmd, args, "command -v tailscale") ? { status: 1, stdout: "", stderr: "" } : undefined;

const isTailscaleVersionExec = (cmd: string, args: string[]): boolean =>
  cmd === "docker" && args[0] === "exec" && args.join(" ").includes("tailscale --version");

const isTailscaleInstallCall = (c: RecordedCall): boolean =>
  c.cmd === "docker" && c.args[0] === "exec" && c.args.some((a) => a.includes("sha256sum -c -"));

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

  it("rejects the retired persistence flags as unknown", () => {
    for (const flag of ["--persist" + "-only", "--no-" + "persist", "--" + "defaults"]) {
      const r = parseToolArgs(["install", "x", flag]);
      expect(r.ok, flag).toBe(false);
      expect(!r.ok && r.error, flag).toMatch(/unknown flag/);
    }
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
    expect(text).toContain("isolation runtime");
    expect(text).toContain("agent-browser");
    expect(text).toContain("gh");
  });

  it("keeps --yes and promises no later boot-time install", () => {
    const w = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    printToolHelp();
    const text = w.mock.calls.map((c) => String(c[0])).join("");
    expect(text).toContain("--yes");
    expect(text).not.toMatch(/next (image build|container start|build)/);
    expect(text).not.toMatch(/persist-only|no-persist|install\.\*/);
  });
});

describe("oh tool list / status", () => {
  it("lists every tool with its kind", async () => {
    const root = makeRepo();
    const { io, out } = makeIo();
    expect(await runToolList({ cwd: root, run: liveHost().run }, io)).toBe(0);
    const text = out.join("");
    for (const id of ["agent-browser", "herdr", "cloudflared", "docker-cli", "gh", "tailscale"]) {
      expect(text, id).toContain(id);
    }
    expect(text).toMatch(/^TOOL\s+KIND\s+INSTALLED$/m);
    expect(text).not.toMatch(/ENABLED/);
    expect(text).toContain("baked-in");
    expect(text).toContain("installable");
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

  it("fails and promises nothing when the download is declined", async () => {
    const root = makeRepo();
    const before = configText(root);
    const { calls, run } = liveHost();
    const { io, out } = makeIo(false);
    expect(await runToolInstall("agent-browser", { cwd: root, run }, io)).toBe(1);
    expect(calls.some(isInstallCall)).toBe(false);
    expect(configText(root)).toBe(before);
    expect(out.join("")).not.toMatch(/oh\.json|next container start/);
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

  it("fails and execs nothing when the sandbox is stopped", async () => {
    const root = makeRepo();
    const before = configText(root);
    const { calls, run } = makeRunner((cmd, args) => (isInspect(cmd, args) ? exited : undefined));
    const { io, err } = makeIo(true);
    expect(await runToolInstall("agent-browser", { cwd: root, run }, io)).toBe(1);
    expect(calls.some((c) => c.args[0] === "exec")).toBe(false);
    expect(configText(root)).toBe(before);
    expect(err.join("")).toContain("oh sandbox");
    expect(err.join("")).not.toMatch(/next|picks it up/);
  });

  it("never writes oh.json on a successful install", async () => {
    const root = makeRepo();
    const before = configText(root);
    const { io, out } = makeIo(true);
    expect(await runToolInstall("agent-browser", { cwd: root, run: liveHost().run }, io)).toBe(0);
    expect(configText(root)).toBe(before);
    expect(out.join("")).not.toMatch(/oh\.json/);
  });

  it("surfaces the installer's exit code and promises no retry", async () => {
    const root = makeRepo();
    const before = configText(root);
    const { run } = liveHost((cmd, args) =>
      isExecOf(cmd, args, "--with-deps") ? { status: 7, stdout: "", stderr: "" } : undefined,
    );
    const { io, err } = makeIo(true);
    expect(await runToolInstall("agent-browser", { cwd: root, run }, io)).toBe(7);
    expect(configText(root)).toBe(before);
    expect(err.join("")).toContain("failed (exit 7)");
    expect(err.join("")).not.toMatch(/oh\.json|will install it|will retry it/);
  });

  it("rejects an unknown tool", async () => {
    const root = makeRepo();
    const { calls, run } = liveHost();
    const { io } = makeIo(true);
    expect(await runToolInstall("chromium", { cwd: root, run }, io)).toBe(1);
    expect(calls.length).toBe(0);
  });
});

describe("oh tool install tailscale", () => {
  it("execs the pinned install argv as the sandbox user, with no download prompt", async () => {
    const root = makeRepo();
    const { calls, run } = liveHost(absentTailscale);
    const { io, asked, out } = makeIo(true);
    expect(await runToolInstall("tailscale", { cwd: root, run }, io)).toBe(0);
    expect(asked).toEqual([]);
    const install = calls.find(isTailscaleInstallCall);
    expect(install).toBeDefined();
    // #858/#908: a root install becomes an interactive `sudo` inside the sandbox.
    expect(install!.args.join(" ")).toContain("-u sandbox");
    expect(install!.args.join(" ")).not.toContain("-u root");
    expect(install!.args.join(" ")).toContain("pkgs.tailscale.com/stable/");
    expect(out.join("")).toContain("installed");
  });

  it("is idempotent — an already-present binary short-circuits", async () => {
    const root = makeRepo();
    const { calls, run } = liveHost((cmd, args) =>
      isExecOf(cmd, args, "command -v tailscale")
        ? { status: 0, stdout: "", stderr: "" }
        : undefined,
    );
    const { io, out } = makeIo(true);
    expect(await runToolInstall("tailscale", { cwd: root, run }, io)).toBe(0);
    expect(calls.some(isTailscaleInstallCall)).toBe(false);
    expect(out.join("")).toContain("already installed");
  });

  it("surfaces the installer's exit code and writes no oh.json", async () => {
    const root = makeRepo();
    const before = configText(root);
    const { run } = liveHost((cmd, args) => {
      if (isExecOf(cmd, args, "sha256sum -c -")) return { status: 9, stdout: "", stderr: "" };
      return absentTailscale(cmd, args);
    });
    const { io, err } = makeIo(true);
    expect(await runToolInstall("tailscale", { cwd: root, run }, io)).toBe(9);
    expect(configText(root)).toBe(before);
    expect(err.join("")).toContain("failed (exit 9)");
    expect(err.join("")).not.toMatch(/oh\.json/);
  });
});

describe("oh tool status tailscale", () => {
  it("reports kind, installed and version as JSON, with no enabled field", async () => {
    const root = makeRepo();
    const { run } = liveHost((cmd, args) =>
      isTailscaleVersionExec(cmd, args)
        ? { status: 0, stdout: "1.102.3\n  tailscale commit: abc\n", stderr: "" }
        : undefined,
    );

    const { io, out } = makeIo();
    expect(await runToolStatus("tailscale", { cwd: root, run, json: true }, io)).toBe(0);
    const status = JSON.parse(out.join("")) as Record<string, unknown>;
    expect(status.id).toBe("tailscale");
    expect(status.kind).toBe("installable");
    expect(Object.keys(status)).not.toContain("enabled");
    expect(status.installed).toBe(true);
    expect(status.version).toBe("1.102.3");
    expect(status.installable).toBe(true);
  });

  it("reports not-installed and no version when the binary is absent", async () => {
    const root = makeRepo();
    const { calls, run } = liveHost(absentTailscale);
    const { io, out } = makeIo();
    await runToolStatus("tailscale", { cwd: root, run, json: true }, io);
    const status = JSON.parse(out.join("")) as Record<string, unknown>;
    expect(Object.keys(status)).not.toContain("enabled");
    expect(status.installed).toBe(false);
    expect(status.version).toBeNull();
    expect(calls.some((c) => isTailscaleVersionExec(c.cmd, c.args))).toBe(false);
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
    expect(out.join("")).toContain("installed");
    expect(
      calls.some((c) => c.cmd === "bash" && c.args.some((a) => a.includes("--with-deps"))),
    ).toBe(true);
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
