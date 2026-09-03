import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSandboxInstall, runSandboxList, type SandboxIO } from "../commands/sandbox.js";
import type { LifecycleRunner, RunResult } from "../lib/execution/runner.js";

const cleanups: string[] = [];

afterEach(() => {
  while (cleanups.length > 0) rmSync(cleanups.pop()!, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

function registry(): string {
  const home = mkdtempSync(join(tmpdir(), "oh-sandbox-cmd-"));
  cleanups.push(home);
  vi.stubEnv("OH_HOME", home);
  vi.stubEnv("TZ", "UTC");
  return join(home, "sandboxes");
}

interface RecordedCall {
  cmd: string;
  args: string[];
}

function makeRunner(result: RunResult = { status: 0 }): {
  calls: RecordedCall[];
  run: LifecycleRunner;
} {
  const calls: RecordedCall[] = [];
  const run: LifecycleRunner = (cmd, args) => {
    calls.push({ cmd, args: [...args] });
    if (cmd === "git") return { status: 0, stdout: "Ada Lovelace\n" };
    if (cmd === "docker") return { status: 0, stdout: "" };
    return result;
  };
  return { calls, run };
}

function makeIo(answers?: string[]): {
  out: string[];
  err: string[];
  asked: string[];
  io: SandboxIO;
} {
  const out: string[] = [];
  const err: string[] = [];
  const asked: string[] = [];
  const io: SandboxIO = { stdout: (s) => out.push(s), stderr: (s) => err.push(s) };
  if (answers !== undefined) {
    const queue = [...answers];
    io.ask = async (q: string): Promise<string> => {
      asked.push(q);
      return queue.shift() ?? "";
    };
  }
  return { out, err, asked, io };
}

const readJson = (path: string): Record<string, unknown> =>
  JSON.parse(readFileSync(path, "utf8"));

describe("oh sandbox install — runtime selection", () => {
  it("refuses microsandbox with the RFC pointer and the tool verb", async () => {
    registry();
    const { err, io } = makeIo();
    expect(await runSandboxInstall({ runtime: "microsandbox", yes: true }, io)).toBe(1);
    expect(err.join("")).toContain(
      "microsandbox is not a provisionable runtime yet; see docs/rfcs/rfc-runtime-support.md. " +
        "Inside a sandbox run `oh tool install microsandbox`.",
    );
  });

  it("refuses an unknown runtime and lists the catalog", async () => {
    registry();
    const { err, io } = makeIo();
    expect(await runSandboxInstall({ runtime: "podman", yes: true }, io)).toBe(1);
    expect(err.join("")).toContain('unknown runtime "podman"');
    expect(err.join("")).toContain("docker, microsandbox");
  });

  it("writes no entry for a refused runtime", async () => {
    const registryPath = registry();
    await runSandboxInstall({ runtime: "microsandbox", yes: true }, makeIo().io);
    expect(existsSync(registryPath)).toBe(false);
  });
});

describe("oh sandbox install — the entry it writes", () => {
  it("names the sandbox oh-sbx-1, then oh-sbx-2, and boots each one", async () => {
    const registryPath = registry();
    const { calls, run } = makeRunner();
    const { out, io } = makeIo();

    expect(await runSandboxInstall({ runtime: "docker", yes: true, run }, io)).toBe(0);
    expect(readdirSync(registryPath)).toEqual(["oh-sbx-1"]);
    expect(out.join("")).toContain("next: oh shell oh-sbx-1");
    expect(calls.some((c) => c.cmd === "bash" && c.args.includes("up"))).toBe(true);

    expect(await runSandboxInstall({ runtime: "docker", yes: true, run }, makeIo().io)).toBe(0);
    expect(readdirSync(registryPath).sort()).toEqual(["oh-sbx-1", "oh-sbx-2"]);
  });

  it("records runtime docker, the host timezone and the git identity", async () => {
    const registryPath = registry();
    const { run } = makeRunner();

    expect(
      await runSandboxInstall({ runtime: "docker", name: "box", yes: true, run }, makeIo().io),
    ).toBe(0);
    const config = readJson(join(registryPath, "box", "oh.json"));
    expect(config).toMatchObject({
      version: 1,
      name: "box",
      runtime: "docker",
      timezone: "UTC",
      git: { userName: "Ada Lovelace", userEmail: "Ada Lovelace" },
      image: { mode: "image" },
    });
    expect(config.repo).toBeUndefined();
  });

  it("materialises the entry and runs the wrapper from inside it, with --no-build", async () => {
    const registryPath = registry();
    const { calls, run } = makeRunner();

    expect(
      await runSandboxInstall({ runtime: "docker", name: "box", yes: true, run }, makeIo().io),
    ).toBe(0);
    const root = join(registryPath, "box");
    for (const rel of [
      ".devcontainer/docker-compose.yml",
      ".devcontainer/docker-compose.ssh.yml",
      ".devcontainer/docker-compose.docker-sock.yml",
      ".oh/scripts/docker-compose.sh",
      ".oh/scripts/check-host-port.sh",
    ]) {
      expect(existsSync(join(root, rel)), rel).toBe(true);
    }
    const wrapper = calls.find((c) => c.cmd === "bash");
    expect(wrapper?.args[0]).toBe(join(root, ".oh", "scripts", "docker-compose.sh"));
    expect(wrapper?.args).toContain("--no-build");
    expect(wrapper?.args).not.toContain("--build");
  });

  it("--repo renders OH_REPO_DIR into the compose env and selects the build base", async () => {
    const registryPath = registry();
    const checkout = mkdtempSync(join(tmpdir(), "oh-sandbox-repo-"));
    cleanups.push(checkout);

    const rendered: string[] = [];
    const run: LifecycleRunner = (cmd, args) => {
      if (cmd === "git") return { status: 0, stdout: "" };
      const i = args.indexOf("--extra-env-file");
      if (i !== -1) rendered.push(readFileSync(args[i + 1], "utf8"));
      return { status: 0 };
    };

    expect(
      await runSandboxInstall(
        { runtime: "docker", name: "box", repo: checkout, yes: true, run },
        makeIo().io,
      ),
    ).toBe(0);

    const root = join(registryPath, "box");
    expect(readJson(join(root, "oh.json"))).toMatchObject({
      repo: checkout,
      image: { mode: "build" },
    });
    expect(rendered.join("")).toContain(`OH_REPO_DIR=${checkout}`);
    const base = readFileSync(join(root, ".devcontainer", "docker-compose.yml"), "utf8");
    expect(base).toContain("${OH_REPO_DIR:-..}:/home/sandbox/harness");
  });

  it("seeds every default from <repo>/oh.json when that checkout has one", async () => {
    const registryPath = registry();
    const checkout = mkdtempSync(join(tmpdir(), "oh-sandbox-repo-"));
    cleanups.push(checkout);
    writeFileSync(
      join(checkout, "oh.json"),
      `${JSON.stringify({
        version: 1,
        name: "seeded",
        timezone: "Europe/Paris",
        git: { userName: "Grace", userEmail: "grace@example.com" },
        storage: { homePath: "/srv/oh-home" },
        access: { ssh: true, sshPort: 2345, dockerSocket: true },
        image: { ref: "ghcr.io/x/y:pinned", mode: "image" },
      })}\n`,
    );
    const { run } = makeRunner();

    expect(
      await runSandboxInstall(
        { runtime: "docker", repo: checkout, yes: true, run },
        makeIo().io,
      ),
    ).toBe(0);
    expect(readdirSync(registryPath)).toEqual(["seeded"]);
    expect(readJson(join(registryPath, "seeded", "oh.json"))).toMatchObject({
      name: "seeded",
      timezone: "Europe/Paris",
      git: { userName: "Grace", userEmail: "grace@example.com" },
      storage: { homePath: "/srv/oh-home" },
      access: { ssh: true, sshPort: 2345, dockerSocket: true },
      image: { ref: "ghcr.io/x/y:pinned", mode: "image" },
      repo: checkout,
    });
  });

  it("--print-argv prints the wrapper argv and writes no entry", async () => {
    const registryPath = registry();
    const { calls, run } = makeRunner();
    const { io } = makeIo();

    expect(
      await runSandboxInstall(
        { runtime: "docker", name: "box", yes: true, printArgv: true, run },
        io,
      ),
    ).toBe(0);
    expect(existsSync(registryPath)).toBe(false);
    const wrapper = calls.find((c) => c.cmd === "bash");
    expect(wrapper?.args).toContain("--print-argv");
    expect(wrapper?.args.slice(-3)).toEqual(["up", "-d", "--no-build"]);
    expect(wrapper?.args[0].startsWith(registryPath)).toBe(false);
  });
});

describe("oh sandbox install — the wizard", () => {
  it("asks exactly six questions in order and writes the answers", async () => {
    const registryPath = registry();
    const { run } = makeRunner();
    const { asked, io } = makeIo(["box", "Europe/Berlin", "Ada", "ada@example.com", "n", "y"]);

    expect(await runSandboxInstall({ runtime: "docker", run }, io)).toBe(0);
    expect(asked).toHaveLength(6);
    expect(asked[0]).toContain("Sandbox name");
    expect(asked[1]).toContain("Timezone");
    expect(asked[2]).toContain("Git user name");
    expect(asked[3]).toContain("Git user email");
    expect(asked[4]).toContain("sshd");
    expect(asked[5]).toContain("Docker socket");

    expect(readJson(join(registryPath, "box", "oh.json"))).toMatchObject({
      name: "box",
      timezone: "Europe/Berlin",
      git: { userName: "Ada", userEmail: "ada@example.com" },
      access: { ssh: false, dockerSocket: true },
    });
  });

  it("asks for the SSH host port only when sshd is enabled", async () => {
    const registryPath = registry();
    const { run } = makeRunner();
    const { asked, io } = makeIo(["box", "", "", "", "y", "2345", "n"]);

    expect(await runSandboxInstall({ runtime: "docker", run }, io)).toBe(0);
    expect(asked).toHaveLength(7);
    expect(asked[5]).toContain("SSH host port");
    expect(readJson(join(registryPath, "box", "oh.json"))).toMatchObject({
      access: { ssh: true, sshPort: 2345, dockerSocket: false },
    });
  });

  it("--yes asks nothing at all", async () => {
    registry();
    const { run } = makeRunner();
    const { asked, io } = makeIo(["never-read"]);

    expect(await runSandboxInstall({ runtime: "docker", yes: true, run }, io)).toBe(0);
    expect(asked).toEqual([]);
  });
});

describe("oh sandbox list", () => {
  function seed(name: string, config: Record<string, unknown> = {}): void {
    const root = join(registryRootPath(), name);
    mkdirSync(root, { recursive: true });
    writeFileSync(
      join(root, "oh.json"),
      `${JSON.stringify({ version: 1, name, runtime: "docker", ...config })}\n`,
    );
  }
  function registryRootPath(): string {
    return join(process.env.OH_HOME as string, "sandboxes");
  }

  it("prints one row per entry with runtime, status and repo", async () => {
    registry();
    seed("alpha");
    seed("beta", { repo: "/srv/checkout" });
    const run: LifecycleRunner = (cmd, args) => {
      if (cmd === "docker" && args[0] === "inspect") {
        return { status: 0, stdout: args.includes("alpha") ? "running\n" : "exited\n" };
      }
      return { status: 0 };
    };
    const { out, io } = makeIo();

    expect(await runSandboxList({ run }, io)).toBe(0);
    const rows = out.join("").trimEnd().split("\n");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatch(/^alpha\s+docker\s+ready\s+-$/);
    expect(rows[1]).toMatch(/^beta\s+docker\s+stopped\s+\/srv\/checkout$/);
  });

  it("--json emits the same rows as data", async () => {
    registry();
    seed("alpha", { repo: "/srv/checkout" });
    const run: LifecycleRunner = () => ({ status: 1 });
    const { out, io } = makeIo();

    expect(await runSandboxList({ json: true, run }, io)).toBe(0);
    expect(JSON.parse(out.join(""))).toEqual([
      { name: "alpha", runtime: "docker", repo: "/srv/checkout", status: "absent" },
    ]);
  });

  it("points at the install verb when the registry is empty", async () => {
    registry();
    const { out, io } = makeIo();
    expect(await runSandboxList({ run: makeRunner().run }, io)).toBe(0);
    expect(out.join("")).toContain("`oh sandbox install docker`");
  });
});
