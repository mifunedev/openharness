import { afterEach, describe, expect, it, vi } from "vitest";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  runRuntimeInstall,
  runRuntimeList,
  runRuntimeStatus,
  type RuntimeIO,
} from "../commands/runtime.js";
import type { LifecycleRunner, RunResult } from "../lib/execution/runner.js";

vi.mock("../cli.js", async (importOriginal) => {
  const original = process.exit;
  process.exit = (() => {}) as never;
  const mod = await importOriginal<typeof import("../cli.js")>();
  await new Promise((r) => setTimeout(r, 0));
  process.exit = original;
  return mod;
});

const { parseRuntimeArgs, printRuntimeHelp, printOhHelp } = await import("../cli.js");

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const REAL_EXAMPLE = join(REPO_ROOT, ".devcontainer", ".example.env");

const cleanups: string[] = [];
afterEach(() => {
  while (cleanups.length > 0) rmSync(cleanups.pop()!, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function makeRepo(): string {
  const d = mkdtempSync(join(tmpdir(), "oh-runtime-"));
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

function makeIo(): { io: RuntimeIO; out: string[]; err: string[] } {
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

describe("oh runtime — argument parsing", () => {
  it("shows help with no args", () => {
    const r = parseRuntimeArgs([]);
    expect(r.ok && r.args.help).toBe(true);
  });

  it("defaults `install` to microsandbox", () => {
    const r = parseRuntimeArgs(["install"]);
    expect(r.ok && r.args.name).toBe("microsandbox");
  });

  it("accepts an explicit name", () => {
    const r = parseRuntimeArgs(["install", "gvisor"]);
    expect(r.ok && r.args.name).toBe("gvisor");
  });

  it("leaves list/status unnamed, meaning all", () => {
    const r = parseRuntimeArgs(["list"]);
    expect(r.ok && r.args.name).toBeUndefined();
  });

  it("rejects an unknown subcommand and offers help", () => {
    const r = parseRuntimeArgs(["frobnicate"]);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.showHelp).toBe(true);
  });

  it("rejects an unknown flag", () => {
    const r = parseRuntimeArgs(["list", "--wat"]);
    expect(r.ok).toBe(false);
  });

  it("rejects a trailing argument", () => {
    expect(parseRuntimeArgs(["list", "microsandbox"]).ok).toBe(false);
    expect(parseRuntimeArgs(["install", "microsandbox", "extra"]).ok).toBe(false);
  });

  it("parses --force and --json", () => {
    const r = parseRuntimeArgs(["install", "--force", "--json"]);
    expect(r.ok && r.args.force).toBe(true);
    expect(r.ok && r.args.json).toBe(true);
  });
});

describe("oh runtime — help", () => {
  it("is listed in the top-level usage block", () => {
    const w = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    printOhHelp();
    const text = w.mock.calls.map((c) => String(c[0])).join("");
    expect(text).toContain("oh runtime");
  });

  it("states that it selects no runtime", () => {
    const w = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    printRuntimeHelp();
    const text = w.mock.calls.map((c) => String(c[0])).join("");
    expect(text).toContain("selects no runtime");
    expect(text).toContain("microsandbox");
    expect(text).toContain("gvisor");
  });
});

describe("oh runtime list", () => {
  it("lists both runtimes with their tier and state", async () => {
    const root = makeRepo();
    const { run } = blockedHost();
    const { io, out } = makeIo();
    expect(await runRuntimeList({ cwd: root, run }, io)).toBe(0);
    const text = out.join("");
    expect(text).toContain("microsandbox");
    expect(text).toContain("gvisor");
    expect(text).toContain("microvm");
    expect(text).toContain("SUPPORTED");
  });

  it("marks the non-installable runtime n/a rather than unsupported", async () => {
    const root = makeRepo();
    const { run } = blockedHost();
    const { io, out } = makeIo();
    await runRuntimeList({ cwd: root, run, json: true }, io);
    const states = JSON.parse(out.join(""));
    const gvisor = states.find((s: { id: string }) => s.id === "gvisor");
    expect(gvisor.installable).toBe(false);
    expect(gvisor.supported).toBeNull();
  });

  it("reports the blocked host as unsupported", async () => {
    const root = makeRepo();
    const { run } = blockedHost();
    const { io, out } = makeIo();
    await runRuntimeList({ cwd: root, run, json: true }, io);
    const states = JSON.parse(out.join(""));
    const msb = states.find((s: { id: string }) => s.id === "microsandbox");
    expect(msb.supported).toBe(false);
  });

  it("measures nothing and never execs when the container is stopped", async () => {
    const root = makeRepo();
    const { calls, run } = makeRunner((cmd, args) => (isInspect(cmd, args) ? exited : undefined));
    const { io, out } = makeIo();
    expect(await runRuntimeList({ cwd: root, run }, io)).toBe(0);
    expect(calls.some((c) => c.args[0] === "exec")).toBe(false);
    expect(out.join("")).toContain("oh sandbox");
  });
});

describe("oh runtime — docker, the runtime in use", () => {
  const isDaemonProbe = (c: RecordedCall): boolean =>
    c.cmd === "docker" && c.args[0] === "version";

  it("reports docker IN USE when the sandbox is running", async () => {
    const root = makeRepo();
    const { run } = blockedHost();
    const { io, out } = makeIo();
    await runRuntimeList({ cwd: root, run, json: true }, io);
    const rows = JSON.parse(out.join(""));
    const docker = rows.find((r: { id: string }) => r.id === "docker");
    expect(docker.active).toBe(true);
    expect(docker.state).toBe("active");
    expect(rows.filter((r: { active: boolean }) => r.active).length).toBe(1);
  });

  it("is not IN USE when the container is stopped", async () => {
    const root = makeRepo();
    const { run } = makeRunner((cmd, args) => (isInspect(cmd, args) ? exited : undefined));
    const { io, out } = makeIo();
    await runRuntimeList({ cwd: root, run, json: true }, io);
    const docker = JSON.parse(out.join("")).find((r: { id: string }) => r.id === "docker");
    expect(docker.active).toBe(false);
  });

  it("probes the daemon on the HOST, not through docker exec", async () => {
    const root = makeRepo();
    const { calls, run } = blockedHost();
    const { io } = makeIo();
    await runRuntimeList({ cwd: root, run }, io);
    const probe = calls.find(isDaemonProbe);
    expect(probe).toBeDefined();
    expect(probe!.args).toEqual(["version", "--format", "{{.Server.Version}}"]);
  });

  it("reports the daemon version it actually read", async () => {
    const root = makeRepo();
    const { run } = blockedHost((cmd, args) =>
      cmd === "docker" && args[0] === "version"
        ? { status: 0, stdout: "29.7.2\n", stderr: "" }
        : undefined,
    );
    const { io, out } = makeIo();
    await runRuntimeStatus("docker", { cwd: root, run }, io);
    expect(out.join("")).toContain("29.7.2");
  });

  it("says the daemon is down instead of implying it is fine", async () => {
    const root = makeRepo();
    const { run } = blockedHost((cmd, args) =>
      cmd === "docker" && args[0] === "version"
        ? { status: 1, stdout: "", stderr: "Cannot connect to the Docker daemon\n" }
        : undefined,
    );
    const { io, out } = makeIo();
    await runRuntimeStatus("docker", { cwd: root, run }, io);
    const text = out.join("");
    expect(text).toContain("FAIL");
    expect(text).toContain("docker.com");
  });

  it("still probes the daemon when the container is unreachable", async () => {
    const root = makeRepo();
    const { calls, run } = makeRunner((cmd, args) => (isInspect(cmd, args) ? exited : undefined));
    const { io } = makeIo();
    await runRuntimeList({ cwd: root, run }, io);
    expect(calls.some(isDaemonProbe)).toBe(true);
  });

  it("refuses `install docker` because there is nothing to install", async () => {
    const root = makeRepo();
    const { run } = blockedHost();
    const { io, err } = makeIo();
    expect(await runRuntimeInstall("docker", { cwd: root, run }, io)).toBe(1);
    expect(err.join("")).toContain("already runs on");
  });
});

describe("oh runtime status", () => {
  it("shows the measured value behind each verdict", async () => {
    const root = makeRepo();
    const { run } = blockedHost();
    const { io, out } = makeIo();
    expect(await runRuntimeStatus("microsandbox", { cwd: root, run }, io)).toBe(0);
    const text = out.join("");
    expect(text).toContain("2.36");
    expect(text).toContain(">= 2.39");
    expect(text).toContain("/dev/kvm");
    expect(text).toContain("absent");
    expect(text).toContain("#805");
    expect(text).toContain(
      "https://github.com/mifunedev/openharness/blob/main/docs/runtimes/microsandbox.md",
    );
  });

  it("prints the remediation for a failing check", async () => {
    const root = makeRepo();
    const { run } = blockedHost();
    const { io, out } = makeIo();
    await runRuntimeStatus("microsandbox", { cwd: root, run }, io);
    expect(out.join("")).toContain("docker-compose.yml");
  });

  it("reports unknown, not unsupported, when the probe cannot run", async () => {
    const root = makeRepo();
    const { run } = blockedHost((cmd, args) =>
      isExecOf(cmd, args, "ldd --version")
        ? { status: 127, stdout: "", stderr: "not found\n" }
        : undefined,
    );
    const { io, out } = makeIo();
    await runRuntimeStatus("microsandbox", { cwd: root, run, json: true }, io);
    const state = JSON.parse(out.join(""));
    const glibc = state.checks.find((c: { id: string }) => c.id === "glibc");
    expect(glibc.ok).toBeNull();
    expect(glibc.found).toBe("?");
  });

  it("rejects an unknown runtime with the known list", async () => {
    const root = makeRepo();
    const { run } = blockedHost();
    const { io, err } = makeIo();
    expect(await runRuntimeStatus("firecracker", { cwd: root, run }, io)).toBe(1);
    expect(err.join("")).toContain("microsandbox");
  });
});

describe("oh runtime install — the preflight gate", () => {
  it("refuses on a blocked host and installs NOTHING", async () => {
    const root = makeRepo();
    const { calls, run } = blockedHost();
    const { io, err } = makeIo();
    expect(await runRuntimeInstall("microsandbox", { cwd: root, run }, io)).toBe(1);
    expect(calls.some(isInstallCall)).toBe(false);
  });

  it("names both blockers and their remediation", async () => {
    const root = makeRepo();
    const { run } = blockedHost();
    const { io, err } = makeIo();
    await runRuntimeInstall("microsandbox", { cwd: root, run }, io);
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
    await runRuntimeInstall("microsandbox", { cwd: root, run, force: true }, io);
    expect(calls.some(isInstallCall)).toBe(true);
  });

  it("installs without --force once the host clears both blockers", async () => {
    const root = makeRepo();
    const { calls, run } = readyHost();
    const { io, out } = makeIo();
    expect(await runRuntimeInstall("microsandbox", { cwd: root, run }, io)).toBe(0);
    expect(calls.some(isInstallCall)).toBe(true);
    expect(out.join("")).toContain("installed");
    expect(out.join("")).toContain(
      "https://github.com/mifunedev/openharness/blob/main/docs/runtimes/microsandbox.md",
    );
  });

  it("refuses when only one blocker clears", async () => {
    const root = makeRepo();
    const { calls, run } = readyHost((cmd, args) =>
      isExecOf(cmd, args, "/dev/kvm") ? { status: 1, stdout: "", stderr: "" } : undefined,
    );
    const { io } = makeIo();
    expect(await runRuntimeInstall("microsandbox", { cwd: root, run }, io)).toBe(1);
    expect(calls.some(isInstallCall)).toBe(false);
  });
});

describe("oh runtime install — the other exits", () => {
  it("exits 0 with a hint when the sandbox is stopped, and execs nothing", async () => {
    const root = makeRepo();
    const { calls, run } = makeRunner((cmd, args) => (isInspect(cmd, args) ? exited : undefined));
    const { io, out } = makeIo();
    expect(await runRuntimeInstall("microsandbox", { cwd: root, run }, io)).toBe(0);
    expect(calls.some((c) => c.args[0] === "exec")).toBe(false);
    expect(out.join("")).toContain("oh sandbox");
  });

  it("is a no-op when msb is already present", async () => {
    const root = makeRepo();
    const { calls, run } = blockedHost((cmd, args) =>
      isExecOf(cmd, args, "command -v msb") ? { status: 0, stdout: "", stderr: "" } : undefined,
    );
    const { io, out } = makeIo();
    expect(await runRuntimeInstall("microsandbox", { cwd: root, run }, io)).toBe(0);
    expect(out.join("")).toContain("already installed");
    expect(calls.some(isInstallCall)).toBe(false);
  });

  it("refuses gvisor with a pointer to its issue, not a preflight", async () => {
    const root = makeRepo();
    const { calls, run } = blockedHost();
    const { io, err } = makeIo();
    expect(await runRuntimeInstall("gvisor", { cwd: root, run }, io)).toBe(1);
    expect(err.join("")).toContain("#806");
    expect(err.join("")).toContain(
      "https://github.com/mifunedev/openharness/blob/main/docs/runtimes/overview.md",
    );
    expect(calls.length).toBe(0);
  });

  it("surfaces a failing installer with its exit code", async () => {
    const root = makeRepo();
    const { run } = readyHost((cmd, args) =>
      isExecOf(cmd, args, "get-msb.sh") ? { status: 3, stdout: "", stderr: "" } : undefined,
    );
    const { io, err } = makeIo();
    expect(await runRuntimeInstall("microsandbox", { cwd: root, run }, io)).toBe(3);
    expect(err.join("")).toContain("failed (exit 3)");
  });

  it("reports a failing doctor without failing the install", async () => {
    const root = makeRepo();
    const { run } = readyHost((cmd, args) =>
      isExecOf(cmd, args, "doctor") ? { status: 1, stdout: "", stderr: "" } : undefined,
    );
    const { io, out } = makeIo();
    expect(await runRuntimeInstall("microsandbox", { cwd: root, run }, io)).toBe(0);
    expect(out.join("")).toContain("msb self doctor");
  });

  it("rejects an unknown runtime", async () => {
    const root = makeRepo();
    const { calls, run } = blockedHost();
    const { io } = makeIo();
    expect(await runRuntimeInstall("firecracker", { cwd: root, run }, io)).toBe(1);
    expect(calls.length).toBe(0);
  });
});

describe("oh runtime never writes configuration", () => {
  it("leaves .devcontainer/.env byte-identical across every verb", async () => {
    const root = makeRepo();
    const before = readFileSync(join(root, ".devcontainer", ".env"), "utf8");
    const { io } = makeIo();

    await runRuntimeList({ cwd: root, run: blockedHost().run }, io);
    await runRuntimeStatus(undefined, { cwd: root, run: blockedHost().run }, io);
    await runRuntimeInstall("microsandbox", { cwd: root, run: blockedHost().run }, io);
    await runRuntimeInstall("microsandbox", { cwd: root, run: readyHost().run }, io);

    expect(readFileSync(join(root, ".devcontainer", ".env"), "utf8")).toBe(before);
  });
});
