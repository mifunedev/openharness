import { afterEach, describe, expect, it, vi } from "vitest";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  runSubstrateInstall,
  runSubstrateList,
  runSubstrateStatus,
  type SubstrateIO,
} from "../commands/substrate.js";
import type { LifecycleRunner, RunResult } from "../lib/execution/runner.js";

// cli.ts has a top-level side effect: main(process.argv.slice(2)).then(process.exit).
// Same guard as harness.test.ts: stub process.exit around the import so the
// module body's main() call cannot terminate the vitest worker.
vi.mock("../cli.js", async (importOriginal) => {
  const original = process.exit;
  process.exit = (() => {}) as never;
  const mod = await importOriginal<typeof import("../cli.js")>();
  await new Promise((r) => setTimeout(r, 0));
  process.exit = original;
  return mod;
});

const { parseSubstrateArgs, printSubstrateHelp, printOhHelp } = await import("../cli.js");

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const REAL_EXAMPLE = join(REPO_ROOT, "harness.yaml.example");

const cleanups: string[] = [];
afterEach(() => {
  while (cleanups.length > 0) rmSync(cleanups.pop()!, { recursive: true, force: true });
  vi.restoreAllMocks();
});

/** An equipped-repo fixture. mkdtemp only — never the real worktree root. */
function makeRepo(): string {
  const d = mkdtempSync(join(tmpdir(), "oh-substrate-"));
  cleanups.push(d);
  mkdirSync(join(d, ".oh", "scripts"), { recursive: true });
  writeFileSync(join(d, ".oh", "scripts", "harness-config.sh"), "#!/bin/sh\n");
  copyFileSync(REAL_EXAMPLE, join(d, "harness.yaml.example"));
  copyFileSync(REAL_EXAMPLE, join(d, "harness.yaml"));
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

function makeIo(): { io: SubstrateIO; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { stdout: (s) => out.push(s), stderr: (s) => err.push(s) }, out, err };
}

const isInspect = (cmd: string, args: string[]): boolean =>
  cmd === "docker" && args[0] === "inspect";
const isExecOf = (cmd: string, args: string[], token: string): boolean =>
  cmd === "docker" && args[0] === "exec" && args.some((a) => a.includes(token));

const running: RunResult = { status: 0, stdout: "running\n", stderr: "" };
const exited: RunResult = { status: 0, stdout: "exited\n", stderr: "" };

/** A container that reports `running`, with msb absent and both blockers present. */
function blockedHost(extra: (cmd: string, args: string[]) => RunResult | undefined = () => undefined) {
  return makeRunner((cmd, args) => {
    const custom = extra(cmd, args);
    if (custom) return custom;
    if (isInspect(cmd, args)) return running;
    if (isExecOf(cmd, args, "command -v msb")) return { status: 1, stdout: "", stderr: "" };
    if (isExecOf(cmd, args, "ldd --version")) {
      return { status: 0, stdout: "ldd (Debian GLIBC 2.36-9+deb12u7) 2.36\n", stderr: "" };
    }
    if (isExecOf(cmd, args, "/dev/kvm")) return { status: 1, stdout: "", stderr: "" };
    return undefined;
  });
}

/** A host that clears both blockers. */
function readyHost(extra: (cmd: string, args: string[]) => RunResult | undefined = () => undefined) {
  return makeRunner((cmd, args) => {
    const custom = extra(cmd, args);
    if (custom) return custom;
    if (isInspect(cmd, args)) return running;
    if (isExecOf(cmd, args, "command -v msb")) return { status: 1, stdout: "", stderr: "" };
    if (isExecOf(cmd, args, "ldd --version")) {
      return { status: 0, stdout: "ldd (Ubuntu GLIBC 2.41-1ubuntu1) 2.41\n", stderr: "" };
    }
    if (isExecOf(cmd, args, "/dev/kvm")) return { status: 0, stdout: "", stderr: "" };
    return undefined;
  });
}

const isInstallCall = (c: RecordedCall): boolean =>
  c.cmd === "docker" && c.args[0] === "exec" && c.args.some((a) => a.includes("get-msb.sh"));

describe("oh substrate — argument parsing", () => {
  it("shows help with no args", () => {
    const r = parseSubstrateArgs([]);
    expect(r.ok && r.args.help).toBe(true);
  });

  it("defaults `install` to microsandbox", () => {
    const r = parseSubstrateArgs(["install"]);
    expect(r.ok && r.args.name).toBe("microsandbox");
  });

  it("accepts an explicit name", () => {
    const r = parseSubstrateArgs(["install", "gvisor"]);
    expect(r.ok && r.args.name).toBe("gvisor");
  });

  it("leaves list/status unnamed, meaning all", () => {
    const r = parseSubstrateArgs(["list"]);
    expect(r.ok && r.args.name).toBeUndefined();
  });

  it("rejects an unknown subcommand and offers help", () => {
    const r = parseSubstrateArgs(["frobnicate"]);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.showHelp).toBe(true);
  });

  it("rejects an unknown flag", () => {
    const r = parseSubstrateArgs(["list", "--wat"]);
    expect(r.ok).toBe(false);
  });

  it("rejects a trailing argument", () => {
    expect(parseSubstrateArgs(["list", "microsandbox"]).ok).toBe(false);
    expect(parseSubstrateArgs(["install", "microsandbox", "extra"]).ok).toBe(false);
  });

  it("parses --force and --json", () => {
    const r = parseSubstrateArgs(["install", "--force", "--json"]);
    expect(r.ok && r.args.force).toBe(true);
    expect(r.ok && r.args.json).toBe(true);
  });
});

describe("oh substrate — help", () => {
  it("is listed in the top-level usage block", () => {
    const w = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    printOhHelp();
    const text = w.mock.calls.map((c) => String(c[0])).join("");
    expect(text).toContain("oh substrate");
  });

  it("states that it selects no runtime", () => {
    const w = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    printSubstrateHelp();
    const text = w.mock.calls.map((c) => String(c[0])).join("");
    expect(text).toContain("selects no runtime");
    expect(text).toContain("microsandbox");
    expect(text).toContain("gvisor");
  });
});

describe("oh substrate list", () => {
  it("lists both substrates with their tier and state", async () => {
    const root = makeRepo();
    const { run } = blockedHost();
    const { io, out } = makeIo();
    expect(await runSubstrateList({ cwd: root, run }, io)).toBe(0);
    const text = out.join("");
    expect(text).toContain("microsandbox");
    expect(text).toContain("gvisor");
    expect(text).toContain("microvm");
    expect(text).toContain("SUPPORTED");
  });

  it("marks the non-installable substrate n/a rather than unsupported", async () => {
    const root = makeRepo();
    const { run } = blockedHost();
    const { io, out } = makeIo();
    await runSubstrateList({ cwd: root, run, json: true }, io);
    const states = JSON.parse(out.join(""));
    const gvisor = states.find((s: { id: string }) => s.id === "gvisor");
    expect(gvisor.installable).toBe(false);
    expect(gvisor.supported).toBeNull();
  });

  it("reports the blocked host as unsupported", async () => {
    const root = makeRepo();
    const { run } = blockedHost();
    const { io, out } = makeIo();
    await runSubstrateList({ cwd: root, run, json: true }, io);
    const states = JSON.parse(out.join(""));
    const msb = states.find((s: { id: string }) => s.id === "microsandbox");
    expect(msb.supported).toBe(false);
  });

  it("measures nothing and never execs when the container is stopped", async () => {
    const root = makeRepo();
    const { calls, run } = makeRunner((cmd, args) => (isInspect(cmd, args) ? exited : undefined));
    const { io, out } = makeIo();
    expect(await runSubstrateList({ cwd: root, run }, io)).toBe(0);
    expect(calls.some((c) => c.args[0] === "exec")).toBe(false);
    expect(out.join("")).toContain("oh sandbox");
  });
});

describe("oh substrate status", () => {
  it("shows the measured value behind each verdict", async () => {
    const root = makeRepo();
    const { run } = blockedHost();
    const { io, out } = makeIo();
    expect(await runSubstrateStatus("microsandbox", { cwd: root, run }, io)).toBe(0);
    const text = out.join("");
    // The whole point of `status` over `list`: the numbers, not just a verdict.
    expect(text).toContain("2.36");
    expect(text).toContain(">= 2.39");
    expect(text).toContain("/dev/kvm");
    expect(text).toContain("absent");
    expect(text).toContain("#805");
  });

  it("prints the remediation for a failing check", async () => {
    const root = makeRepo();
    const { run } = blockedHost();
    const { io, out } = makeIo();
    await runSubstrateStatus("microsandbox", { cwd: root, run }, io);
    expect(out.join("")).toContain("docker-compose.yml");
  });

  it("reports unknown, not unsupported, when the probe cannot run", async () => {
    const root = makeRepo();
    // glibc probe fails to produce a parseable line.
    const { run } = blockedHost((cmd, args) =>
      isExecOf(cmd, args, "ldd --version")
        ? { status: 127, stdout: "", stderr: "not found\n" }
        : undefined,
    );
    const { io, out } = makeIo();
    await runSubstrateStatus("microsandbox", { cwd: root, run, json: true }, io);
    const state = JSON.parse(out.join(""));
    const glibc = state.checks.find((c: { id: string }) => c.id === "glibc");
    expect(glibc.ok).toBeNull();
    expect(glibc.found).toBe("?");
  });

  it("rejects an unknown substrate with the known list", async () => {
    const root = makeRepo();
    const { run } = blockedHost();
    const { io, err } = makeIo();
    expect(await runSubstrateStatus("firecracker", { cwd: root, run }, io)).toBe(1);
    expect(err.join("")).toContain("microsandbox");
  });
});

describe("oh substrate install — the preflight gate", () => {
  it("refuses on a blocked host and installs NOTHING", async () => {
    const root = makeRepo();
    const { calls, run } = blockedHost();
    const { io, err } = makeIo();
    expect(await runSubstrateInstall("microsandbox", { cwd: root, run }, io)).toBe(1);
    expect(calls.some(isInstallCall)).toBe(false);
  });

  it("names both blockers and their remediation", async () => {
    const root = makeRepo();
    const { run } = blockedHost();
    const { io, err } = makeIo();
    await runSubstrateInstall("microsandbox", { cwd: root, run }, io);
    const text = err.join("");
    expect(text).toContain("2.36");
    expect(text).toContain("/dev/kvm");
    expect(text).toContain("Dockerfile");
    expect(text).toContain("docker-compose.yml");
    expect(text).toContain("#805");
    expect(text).toContain("--force");
  });

  it("--force overrides the gate and runs the installer", async () => {
    const root = makeRepo();
    const { calls, run } = blockedHost();
    const { io } = makeIo();
    await runSubstrateInstall("microsandbox", { cwd: root, run, force: true }, io);
    expect(calls.some(isInstallCall)).toBe(true);
  });

  it("installs without --force once the host clears both blockers", async () => {
    const root = makeRepo();
    const { calls, run } = readyHost();
    const { io, out } = makeIo();
    expect(await runSubstrateInstall("microsandbox", { cwd: root, run }, io)).toBe(0);
    expect(calls.some(isInstallCall)).toBe(true);
    expect(out.join("")).toContain("installed");
  });

  it("refuses when only one blocker clears", async () => {
    const root = makeRepo();
    // glibc fine, KVM still absent.
    const { calls, run } = readyHost((cmd, args) =>
      isExecOf(cmd, args, "/dev/kvm") ? { status: 1, stdout: "", stderr: "" } : undefined,
    );
    const { io } = makeIo();
    expect(await runSubstrateInstall("microsandbox", { cwd: root, run }, io)).toBe(1);
    expect(calls.some(isInstallCall)).toBe(false);
  });
});

describe("oh substrate install — the other exits", () => {
  it("exits 0 with a hint when the sandbox is stopped, and execs nothing", async () => {
    const root = makeRepo();
    const { calls, run } = makeRunner((cmd, args) => (isInspect(cmd, args) ? exited : undefined));
    const { io, out } = makeIo();
    expect(await runSubstrateInstall("microsandbox", { cwd: root, run }, io)).toBe(0);
    expect(calls.some((c) => c.args[0] === "exec")).toBe(false);
    expect(out.join("")).toContain("oh sandbox");
  });

  it("is a no-op when msb is already present", async () => {
    const root = makeRepo();
    const { calls, run } = blockedHost((cmd, args) =>
      isExecOf(cmd, args, "command -v msb") ? { status: 0, stdout: "", stderr: "" } : undefined,
    );
    const { io, out } = makeIo();
    expect(await runSubstrateInstall("microsandbox", { cwd: root, run }, io)).toBe(0);
    expect(out.join("")).toContain("already installed");
    expect(calls.some(isInstallCall)).toBe(false);
  });

  it("refuses gvisor with a pointer to its issue, not a preflight", async () => {
    const root = makeRepo();
    const { calls, run } = blockedHost();
    const { io, err } = makeIo();
    expect(await runSubstrateInstall("gvisor", { cwd: root, run }, io)).toBe(1);
    expect(err.join("")).toContain("#806");
    // Not installable means not even reachable — no container work at all.
    expect(calls.length).toBe(0);
  });

  it("surfaces a failing installer with its exit code", async () => {
    const root = makeRepo();
    const { run } = readyHost((cmd, args) =>
      isExecOf(cmd, args, "get-msb.sh") ? { status: 3, stdout: "", stderr: "" } : undefined,
    );
    const { io, err } = makeIo();
    expect(await runSubstrateInstall("microsandbox", { cwd: root, run }, io)).toBe(3);
    expect(err.join("")).toContain("failed (exit 3)");
  });

  it("reports a failing doctor without failing the install", async () => {
    const root = makeRepo();
    const { run } = readyHost((cmd, args) =>
      isExecOf(cmd, args, "doctor") ? { status: 1, stdout: "", stderr: "" } : undefined,
    );
    const { io, out } = makeIo();
    // The install itself succeeded; the doctor is diagnosing the host.
    expect(await runSubstrateInstall("microsandbox", { cwd: root, run }, io)).toBe(0);
    expect(out.join("")).toContain("msb self doctor");
  });

  it("rejects an unknown substrate", async () => {
    const root = makeRepo();
    const { calls, run } = blockedHost();
    const { io } = makeIo();
    expect(await runSubstrateInstall("firecracker", { cwd: root, run }, io)).toBe(1);
    expect(calls.length).toBe(0);
  });
});

describe("oh substrate never writes configuration", () => {
  it("leaves harness.yaml byte-identical across every verb", async () => {
    const root = makeRepo();
    const before = readFileSync(join(root, "harness.yaml"), "utf8");
    const { io } = makeIo();

    await runSubstrateList({ cwd: root, run: blockedHost().run }, io);
    await runSubstrateStatus(undefined, { cwd: root, run: blockedHost().run }, io);
    await runSubstrateInstall("microsandbox", { cwd: root, run: blockedHost().run }, io);
    await runSubstrateInstall("microsandbox", { cwd: root, run: readyHost().run }, io);

    expect(readFileSync(join(root, "harness.yaml"), "utf8")).toBe(before);
  });
});
