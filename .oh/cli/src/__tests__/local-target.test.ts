import { describe, expect, it } from "vitest";
import {
  HostOnlyError,
  LocalExecutionTarget,
  resolveExecutionTarget,
  runningInsideSandbox,
  SANDBOX_MARKER_FILE,
  type LifecycleRunner,
  type RunResult,
} from "../lib/execution/index.js";


interface RecordedCall {
  cmd: string;
  args: string[];
  stdio: string;
}

function makeRunner(
  reply: (cmd: string, args: string[]) => RunResult | undefined = () => undefined,
): { calls: RecordedCall[]; run: LifecycleRunner } {
  const calls: RecordedCall[] = [];
  const run: LifecycleRunner = (cmd, args, opts) => {
    calls.push({ cmd, args: [...args], stdio: opts.stdio });
    return reply(cmd, args) ?? { status: 0, stdout: "", stderr: "" };
  };
  return { calls, run };
}

function target(uid: number, run: LifecycleRunner): LocalExecutionTarget {
  return new LocalExecutionTarget({
    projectRoot: "/workspace",
    run,
    env: {},
    identity: () => (uid === 0 ? { name: "root", uid: 0 } : { name: "sandbox", uid }),
  });
}

describe("runningInsideSandbox", () => {
  const present = (p: string): boolean => p === SANDBOX_MARKER_FILE;
  const absent = (): boolean => false;

  it("is true when the container marker and SANDBOX_NAME are both present", () => {
    expect(runningInsideSandbox({ SANDBOX_NAME: "openharness" }, present)).toBe(true);
  });

  it("is false on a host without the container marker", () => {
    expect(runningInsideSandbox({ SANDBOX_NAME: "openharness" }, absent)).toBe(false);
  });

  it("is false inside a container that is not an Open Harness sandbox", () => {
    expect(runningInsideSandbox({}, present)).toBe(false);
  });

  it("honours OH_EXECUTION_TARGET=local on a host", () => {
    expect(runningInsideSandbox({ OH_EXECUTION_TARGET: "local" }, absent)).toBe(true);
  });

  it("honours OH_EXECUTION_TARGET=docker-compose inside the sandbox", () => {
    expect(
      runningInsideSandbox(
        { OH_EXECUTION_TARGET: "docker-compose", SANDBOX_NAME: "openharness" },
        present,
      ),
    ).toBe(false);
  });
});

describe("resolveExecutionTarget", () => {
  it("returns the local target inside the sandbox", () => {
    const t = resolveExecutionTarget({
      projectRoot: "/workspace",
      container: "openharness",
      env: { OH_EXECUTION_TARGET: "local" },
    });
    expect(t.kind).toBe("local");
  });

  it("returns the docker compose target on the host", () => {
    const t = resolveExecutionTarget({
      projectRoot: "/workspace",
      container: "openharness",
      env: { OH_EXECUTION_TARGET: "docker-compose" },
    });
    expect(t.kind).toBe("docker-compose");
  });
});

describe("LocalExecutionTarget", () => {
  it("is always ready and can exec", async () => {
    const { run } = makeRunner();
    const t = target(1001, run);
    expect(await t.status()).toBe("ready");
    expect([...(await t.capabilities())]).toContain("exec");
  });

  it("runs the argv directly for the current user", async () => {
    const { calls, run } = makeRunner();
    const r = await target(1001, run).exec({
      argv: ["claude", "--version"],
      user: "sandbox",
      stdio: "capture",
    });
    expect(r.exitCode).toBe(0);
    expect(calls).toEqual([{ cmd: "claude", args: ["--version"], stdio: "capture" }]);
  });

  it("runs the argv directly when no user is requested", async () => {
    const { calls, run } = makeRunner();
    await target(1001, run).exec({ argv: ["bash", "-lc", "true"], stdio: "capture" });
    expect(calls[0].cmd).toBe("bash");
  });

  it("wraps a root request in sudo when the caller is not root", async () => {
    const { calls, run } = makeRunner();
    await target(1001, run).exec({
      argv: ["npm", "install", "-g", "x"],
      user: "root",
      stdio: "inherit",
    });
    expect(calls[0]).toEqual({
      cmd: "sudo",
      args: ["--", "npm", "install", "-g", "x"],
      stdio: "inherit",
    });
  });

  it("uses non-interactive sudo for captured root execs", async () => {
    const { calls, run } = makeRunner();
    await target(1001, run).exec({ argv: ["id"], user: "root", stdio: "capture" });
    expect(calls[0]).toEqual({ cmd: "sudo", args: ["-n", "--", "id"], stdio: "capture" });
  });

  it("does not wrap a root request when the caller is already root", async () => {
    const { calls, run } = makeRunner();
    await target(0, run).exec({ argv: ["id"], user: "root", stdio: "capture" });
    expect(calls[0].cmd).toBe("id");
  });

  it("drops privileges with gosu when root asks for another user", async () => {
    const { calls, run } = makeRunner();
    await target(0, run).exec({ argv: ["id"], user: "sandbox", stdio: "capture" });
    expect(calls[0]).toEqual({ cmd: "gosu", args: ["sandbox", "id"], stdio: "capture" });
  });

  it("reports a missing binary as exit 127 instead of a spawn failure", async () => {
    const { run } = makeRunner(() => ({ status: null, error: { code: "ENOENT" } }));
    const r = await target(1001, run).exec({ argv: ["nope"], stdio: "capture" });
    expect(r.exitCode).toBe(127);
  });

  it("refuses to provision the sandbox from inside it", async () => {
    const { run } = makeRunner();
    await expect(target(1001, run).provision()).rejects.toBeInstanceOf(HostOnlyError);
  });

  it("refuses to destroy the sandbox from inside it", async () => {
    const { run } = makeRunner();
    await expect(target(1001, run).destroy()).rejects.toBeInstanceOf(HostOnlyError);
  });

  it("attaches by running the argv with inherited stdio", () => {
    const { calls, run } = makeRunner();
    expect(target(1001, run).attach({ argv: ["zsh"], user: "sandbox" })).toBe(0);
    expect(calls[0]).toEqual({ cmd: "zsh", args: [], stdio: "inherit" });
  });
});
