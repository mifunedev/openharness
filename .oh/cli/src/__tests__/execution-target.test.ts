import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ExecutionExitError,
  ExecutionSpawnError,
  resolveExecutionTarget,
  type LifecycleRunner,
  type RunResult,
} from "../lib/execution/index.js";

/**
 * Unit tests for the `ExecutionTarget` contract's first implementation
 * (EPIC #731, issue #733).
 *
 * Every case runs against an INJECTED fake runner over an mkdtemp fixture — no
 * real subprocess is ever spawned, so the suite asserts the exact argv the
 * adapter WOULD run rather than what a live engine happens to do. The
 * behavioural compat oracle for the CLI verbs themselves lives in
 * `lifecycle.test.ts`, whose assertions are unchanged by this slice.
 */

const cleanups: string[] = [];

afterEach(() => {
  while (cleanups.length > 0) {
    rmSync(cleanups.pop()!, { recursive: true, force: true });
  }
});

/** An equipped-repo fixture: a root containing `.oh/scripts/`. */
function makeRepo(): string {
  const d = mkdtempSync(join(tmpdir(), "oh-exec-target-"));
  cleanups.push(d);
  mkdirSync(join(d, ".oh", "scripts"), { recursive: true });
  return d;
}

/** Drop a stub script in place so `requireLifecycleScript` is satisfied. */
function addScript(root: string, name: string): string {
  const p = join(root, ".oh", "scripts", name);
  writeFileSync(p, "#!/usr/bin/env bash\n");
  return p;
}

interface RecordedCall {
  cmd: string;
  args: string[];
  opts: { stdio: "inherit" | "capture"; env?: NodeJS.ProcessEnv; timeoutMs?: number };
}

/** Queue-backed fake runner: returns results[i] for call i (last one repeats). */
function makeRunner(results: RunResult[] = [{ status: 0 }]): {
  calls: RecordedCall[];
  run: LifecycleRunner;
} {
  const calls: RecordedCall[] = [];
  const run: LifecycleRunner = (cmd, args, opts) => {
    calls.push({ cmd, args: [...args], opts });
    return results[Math.min(calls.length - 1, results.length - 1)];
  };
  return { calls, run };
}

/**
 * A `--print-argv` dump, one argv entry per line — the script's own
 * non-executing oracle, which is how the adapter discovers the socket overlay.
 */
function printArgvDump(root: string, opts: { socket: boolean }): string {
  const dc = join(root, ".devcontainer");
  const lines = ["docker", "compose", "-f", join(dc, "docker-compose.yml")];
  if (opts.socket) lines.push("-f", join(dc, "docker-compose.docker-sock.yml"));
  lines.push("config");
  return `${lines.join("\n")}\n`;
}

// ---------------------------------------------------------------------------
// provision()
// ---------------------------------------------------------------------------

describe("DockerComposeExecutionTarget.provision", () => {
  it("delegates the EXACT vendored argv with inherited stdio, in exactly one child", async () => {
    const root = makeRepo();
    const script = addScript(root, "docker-compose.sh");
    const { calls, run } = makeRunner([{ status: 0 }]);

    await resolveExecutionTarget({ projectRoot: root, run }).provision();

    expect(calls).toEqual([
      {
        cmd: "bash",
        args: [script, "--repo-dir", root, "up", "-d", "--build"],
        opts: { stdio: "inherit" },
      },
    ]);
  });

  it("passes --no-build when build is false, and threads the child env through", async () => {
    const root = makeRepo();
    const script = addScript(root, "docker-compose.sh");
    const { calls, run } = makeRunner([{ status: 0 }]);
    const env = { ...process.env, OH_SANDBOX_IMAGE: "ghcr.io/x/y:pinned" };

    await resolveExecutionTarget({ projectRoot: root, run, build: false, env }).provision();

    expect(calls[0].args).toEqual([script, "--repo-dir", root, "up", "-d", "--no-build"]);
    expect(calls[0].opts.env?.OH_SANDBOX_IMAGE).toBe("ghcr.io/x/y:pinned");
  });

  it("throws ExecutionExitError carrying the child's code — provision() has nowhere to return it", async () => {
    const root = makeRepo();
    addScript(root, "docker-compose.sh");
    const { run } = makeRunner([{ status: 17 }]);

    const err = await resolveExecutionTarget({ projectRoot: root, run })
      .provision()
      .then(() => undefined)
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ExecutionExitError);
    expect((err as ExecutionExitError).exitCode).toBe(17);
  });
});

// ---------------------------------------------------------------------------
// attach() — synchronous in contractVersion 1 (target.ts refinement 3)
// ---------------------------------------------------------------------------

describe("DockerComposeExecutionTarget.attach", () => {
  it("hands over the terminal with the EXACT argv, synchronously", () => {
    const root = makeRepo();
    const { calls, run } = makeRunner([{ status: 0 }]);
    const target = resolveExecutionTarget({ projectRoot: root, container: "my-box", run });

    const code = target.attach({ argv: ["zsh"], user: "sandbox" });

    // Synchronous by contract: a raw number, never a thenable. This is what
    // keeps `runShell(): number` — and therefore lifecycle.test.ts's
    // `expect(runShell(...)).toBe(0)` — valid.
    expect(typeof code).toBe("number");
    expect(code).toBe(0);
    expect(calls).toEqual([
      {
        cmd: "docker",
        args: ["exec", "-it", "-u", "sandbox", "my-box", "zsh"],
        opts: { stdio: "inherit" },
      },
    ]);
  });

  it("returns a non-zero exit code as DATA, never as a throw", () => {
    const root = makeRepo();
    const { run } = makeRunner([{ status: 126 }]);
    const target = resolveExecutionTarget({ projectRoot: root, container: "my-box", run });

    expect(target.attach({ argv: ["zsh"], user: "sandbox" })).toBe(126);
  });

  it("throws ExecutionSpawnError (code ENOENT) when the engine binary never ran", () => {
    const root = makeRepo();
    const { run } = makeRunner([{ status: null, error: { code: "ENOENT" } }]);
    const target = resolveExecutionTarget({ projectRoot: root, container: "my-box", run });

    let caught: unknown;
    try {
      target.attach({ argv: ["zsh"], user: "sandbox" });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ExecutionSpawnError);
    expect((caught as ExecutionSpawnError).code).toBe("ENOENT");
  });
});

// ---------------------------------------------------------------------------
// capabilities() — discovered, not assumed, in BOTH socket states
// ---------------------------------------------------------------------------

describe("DockerComposeExecutionTarget.capabilities", () => {
  it('includes "docker" when the socket overlay is ON, and asks the script rather than reimplementing truthy()', async () => {
    const root = makeRepo();
    const script = addScript(root, "docker-compose.sh");
    const { calls, run } = makeRunner([
      { status: 0, stdout: printArgvDump(root, { socket: true }) },
    ]);

    const caps = await resolveExecutionTarget({ projectRoot: root, run }).capabilities();

    expect(calls).toEqual([
      {
        cmd: "bash",
        args: [script, "--repo-dir", root, "--print-argv", "config"],
        opts: { stdio: "capture" },
      },
    ]);
    expect([...caps].sort()).toEqual(["docker", "exec", "pty"]);
  });

  it('omits "docker" when the socket overlay is OFF, and still advertises exec/pty', async () => {
    const root = makeRepo();
    addScript(root, "docker-compose.sh");
    const { run } = makeRunner([{ status: 0, stdout: printArgvDump(root, { socket: false }) }]);

    const caps = await resolveExecutionTarget({ projectRoot: root, run }).capabilities();

    expect(caps.has("docker")).toBe(false);
    expect(caps.has("exec")).toBe(true);
    expect(caps.has("pty")).toBe(true);
  });

  it('does not claim "files" or "ports" — the contract declares no method for either', async () => {
    const root = makeRepo();
    addScript(root, "docker-compose.sh");
    const { run } = makeRunner([{ status: 0, stdout: printArgvDump(root, { socket: true }) }]);

    const caps = await resolveExecutionTarget({ projectRoot: root, run }).capabilities();

    expect(caps.has("files")).toBe(false);
    expect(caps.has("ports")).toBe(false);
    expect(caps.has("snapshot")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// exec() — the minimal contract case: argv pass-through + REAL stderr
// ---------------------------------------------------------------------------

describe("DockerComposeExecutionTarget.exec", () => {
  it("resolves { exitCode, stdout, stderr } from the runner — stderr is plumbed, not stubbed", async () => {
    const root = makeRepo();
    const { calls, run } = makeRunner([{ status: 0, stdout: "hi", stderr: "warn" }]);
    const target = resolveExecutionTarget({ projectRoot: root, container: "my-box", run });

    const result = await target.exec({ argv: ["ls", "-la"] });

    expect(result).toEqual({ exitCode: 0, stdout: "hi", stderr: "warn" });
    expect(calls).toEqual([
      {
        cmd: "docker",
        args: ["exec", "my-box", "ls", "-la"],
        opts: { stdio: "capture" },
      },
    ]);
  });

  it("maps cwd/env/user/timeoutMs onto the request without a shell string anywhere", async () => {
    const root = makeRepo();
    const { calls, run } = makeRunner([{ status: 3, stdout: "", stderr: "boom" }]);
    const target = resolveExecutionTarget({ projectRoot: root, container: "my-box", run });

    const result = await target.exec({
      argv: ["sh", "-c", "echo hi"],
      cwd: "/workspace",
      env: { FOO: "bar" },
      user: "sandbox",
      timeoutMs: 5_000,
    });

    expect(result).toEqual({ exitCode: 3, stdout: "", stderr: "boom" });
    expect(calls[0].args).toEqual([
      "exec",
      "-u",
      "sandbox",
      "-w",
      "/workspace",
      "-e",
      "FOO=bar",
      "my-box",
      "sh",
      "-c",
      "echo hi",
    ]);
    expect(calls[0].opts.timeoutMs).toBe(5_000);
  });
});

// ---------------------------------------------------------------------------
// stdio: "inherit" — the streaming path, not only "capture"
// ---------------------------------------------------------------------------

describe("stdio: inherit streaming", () => {
  it('exec({ stdio: "inherit" }) streams to the terminal and captures nothing', async () => {
    const root = makeRepo();
    // A runner that "leaks" streams even on an inherit run: the adapter must
    // still report "" for both, because inherited output went to the terminal.
    const { calls, run } = makeRunner([{ status: 0, stdout: undefined, stderr: undefined }]);
    const target = resolveExecutionTarget({ projectRoot: root, container: "my-box", run });

    const result = await target.exec({ argv: ["make", "build"], stdio: "inherit" });

    expect(calls[0].opts.stdio).toBe("inherit");
    expect(result).toEqual({ exitCode: 0, stdout: "", stderr: "" });
  });

  it("provision() and attach() always inherit — live build output and interactive shells", async () => {
    const root = makeRepo();
    addScript(root, "docker-compose.sh");
    const { calls, run } = makeRunner([{ status: 0 }]);
    const target = resolveExecutionTarget({ projectRoot: root, container: "my-box", run });

    await target.provision();
    // `request.stdio` is deliberately NOT consulted by attach(): attaching IS
    // inheriting, so an explicit "capture" cannot silently swallow the session.
    target.attach({ argv: ["zsh"], user: "sandbox", stdio: "capture" });

    expect(calls.map((c) => c.opts.stdio)).toEqual(["inherit", "inherit"]);
  });
});

// ---------------------------------------------------------------------------
// status() — engine state mapped onto the contract's five states
// ---------------------------------------------------------------------------

describe("DockerComposeExecutionTarget.status", () => {
  it.each([
    ["running", "ready"],
    ["created", "starting"],
    ["restarting", "starting"],
    ["paused", "stopped"],
    ["exited", "stopped"],
    ["dead", "failed"],
  ])("maps %s → %s", async (reported, expected) => {
    const root = makeRepo();
    const { calls, run } = makeRunner([{ status: 0, stdout: `${reported}\n` }]);
    const target = resolveExecutionTarget({ projectRoot: root, container: "my-box", run });

    expect(await target.status()).toBe(expected);
    expect(calls[0].opts.stdio).toBe("capture");
  });

  it('reports "absent" when the environment does not exist (non-zero inspect, not an error)', async () => {
    const root = makeRepo();
    const { run } = makeRunner([{ status: 1, stdout: "" }]);
    const target = resolveExecutionTarget({ projectRoot: root, container: "my-box", run });

    expect(await target.status()).toBe("absent");
  });
});
