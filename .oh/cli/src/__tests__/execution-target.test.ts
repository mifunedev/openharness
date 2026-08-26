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


const cleanups: string[] = [];

afterEach(() => {
  while (cleanups.length > 0) {
    rmSync(cleanups.pop()!, { recursive: true, force: true });
  }
});

function makeRepo(): string {
  const d = mkdtempSync(join(tmpdir(), "oh-exec-target-"));
  cleanups.push(d);
  mkdirSync(join(d, ".oh", "scripts"), { recursive: true });
  return d;
}

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

function printArgvDump(root: string, opts: { socket: boolean }): string {
  const dc = join(root, ".devcontainer");
  const lines = ["docker", "compose", "-f", join(dc, "docker-compose.yml")];
  if (opts.socket) lines.push("-f", join(dc, "docker-compose.docker-sock.yml"));
  lines.push("config");
  return `${lines.join("\n")}\n`;
}


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


describe("DockerComposeExecutionTarget.attach", () => {
  it("hands over the terminal with the EXACT argv, synchronously", () => {
    const root = makeRepo();
    const { calls, run } = makeRunner([{ status: 0 }]);
    const target = resolveExecutionTarget({ projectRoot: root, container: "my-box", run });

    const code = target.attach({ argv: ["zsh"], user: "sandbox" });

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


describe("stdio: inherit streaming", () => {
  it('exec({ stdio: "inherit" }) streams to the terminal and captures nothing', async () => {
    const root = makeRepo();
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
    target.attach({ argv: ["zsh"], user: "sandbox", stdio: "capture" });

    expect(calls.map((c) => c.opts.stdio)).toEqual(["inherit", "inherit"]);
  });
});


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
