import { afterEach, describe, expect, it, vi } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return { ...actual, userInfo: () => ({ ...actual.userInfo(), username: "sandbox", uid: 1000 }) };
});
import { dirname, join } from "node:path";
import {
  runComposeVerb,
  runGateway,
  runSandbox,
  runShell,
  DEFAULT_CONTAINER_NAME,
  DEFAULT_SANDBOX_IMAGE,
  type LifecycleIO,
  type LifecycleRunner,
  type RunResult,
} from "../commands/lifecycle.js";
import { ohConfigPath } from "../lib/oh-config.js";

const readOhJson = (root: string): Record<string, never> =>
  JSON.parse(readFileSync(ohConfigPath(root), "utf8"));

vi.mock("../cli.js", async (importOriginal) => {
  const original = process.exit;
  process.exit = (() => {}) as never;
  const mod = await importOriginal<typeof import("../cli.js")>();
  await new Promise((r) => setTimeout(r, 0));
  process.exit = original;
  return mod;
});

const {
  parseGatewayArgs,
  parseSandboxArgs,
  parseShellArgs,
  printGatewayHelp,
  printOhHelp,
  printSandboxHelp,
  printShellHelp,
} = await import("../cli.js");


const cleanups: string[] = [];

afterEach(() => {
  while (cleanups.length > 0) {
    rmSync(cleanups.pop()!, { recursive: true, force: true });
  }
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const ENTRY_NAME = "oh-lifecycle-box";

function makeRepo(): string {
  const home = mkdtempSync(join(tmpdir(), "oh-lifecycle-"));
  cleanups.push(home);
  vi.stubEnv("OH_HOME", home);
  const d = join(home, "sandboxes", ENTRY_NAME);
  mkdirSync(join(d, ".oh", "scripts"), { recursive: true });
  return d;
}

const entry = { name: ENTRY_NAME };

function writeOhJson(root: string, body: Record<string, unknown>): void {
  writeFileSync(ohConfigPath(root), `${JSON.stringify({ version: 1, ...body })}\n`);
}

function addScript(root: string, name: string): string {
  const p = join(root, ".oh", "scripts", name);
  writeFileSync(p, "#!/usr/bin/env bash\n");
  return p;
}

interface RecordedCall {
  cmd: string;
  args: string[];
  opts: { stdio: "inherit" | "capture"; env?: NodeJS.ProcessEnv };
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

function makeIo(): { out: string[]; err: string[]; io: LifecycleIO } {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, io: { stdout: (s) => out.push(s), stderr: (s) => err.push(s) } };
}

function captureStdout(fn: () => void): string {
  const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  fn();
  const text = spy.mock.calls.map((c) => String(c[0])).join("");
  spy.mockRestore();
  return text;
}


describe("oh.json -> compose env wiring (issue #880)", () => {
  const ohJson = (root: string, body: Record<string, unknown> = { version: 1, name: "wired" }): void => {
    writeFileSync(join(root, "oh.json"), `${JSON.stringify(body)}\n`);
  };

  it("renders oh.json into a 0600 temp file outside the repo and passes it as --extra-env-file", async () => {
    const root = makeRepo();
    addScript(root, "docker-compose.sh");
    ohJson(root, { version: 1, name: "wired", timezone: "UTC" });

    const seen: { path: string; mode: number; body: string }[] = [];
    const run: LifecycleRunner = (_cmd, args) => {
      const i = args.indexOf("--extra-env-file");
      const path = args[i + 1];
      const st = statSync(path);
      seen.push({ path, mode: st.mode & 0o777, body: readFileSync(path, "utf8") });
      return { status: 0 };
    };

    expect(await runSandbox({ cwd: root, run }, makeIo().io)).toBe(0);
    expect(seen).toHaveLength(1);
    expect(seen[0].mode).toBe(0o600);
    expect(seen[0].body).toContain("SANDBOX_NAME=wired");
    expect(seen[0].body).toContain("TZ=UTC");
    expect(seen[0].path.startsWith(root)).toBe(false);
  });

  it("removes the rendered file and its directory in a finally, even when provisioning throws", async () => {
    const root = makeRepo();
    addScript(root, "docker-compose.sh");
    ohJson(root);

    let rendered = "";
    const run: LifecycleRunner = (_cmd, args) => {
      rendered = args[args.indexOf("--extra-env-file") + 1];
      throw new Error("boom");
    };

    await expect(runSandbox({ cwd: root, run }, makeIo().io)).rejects.toThrow("boom");
    expect(rendered).not.toBe("");
    expect(existsSync(rendered)).toBe(false);
    expect(existsSync(dirname(rendered))).toBe(false);
  });

  it("orders the sandbox argv --repo-dir, --extra-env-file, then the compose verb", async () => {
    const root = makeRepo();
    const script = addScript(root, "docker-compose.sh");
    ohJson(root);
    const { calls, run } = makeRunner();

    expect(await runSandbox({ cwd: root, run }, makeIo().io)).toBe(0);
    const args = calls[0].args;
    expect(args.slice(0, 4)).toEqual([script, "--repo-dir", root, "--extra-env-file"]);
    expect(args.slice(5)).toEqual(["up", "-d", "--build"]);
    expect(existsSync(args[4])).toBe(false);
  });

  it("passes no --extra-env-file at all when the repo has no oh.json", async () => {
    const root = makeRepo();
    const script = addScript(root, "docker-compose.sh");
    const { calls, run } = makeRunner();

    expect(await runSandbox({ cwd: root, run }, makeIo().io)).toBe(0);
    expect(calls[0].args).toEqual([script, "--repo-dir", root, "up", "-d", "--build"]);
  });

  it("threads the rendered file through every compose verb", async () => {
    const root = makeRepo();
    const script = addScript(root, "docker-compose.sh");
    ohJson(root);
    const { calls, run } = makeRunner();

    expect(runComposeVerb("ps", { ...entry, run })).toBe(0);
    expect(calls[0].args.slice(0, 2)).toEqual([script, "--extra-env-file"]);
    expect(calls[0].args.slice(3)).toEqual(["ps"]);
    expect(existsSync(calls[0].args[2])).toBe(false);
  });

  it("prints the compose argv without provisioning when --print-argv is set", async () => {
    const root = makeRepo();
    const script = addScript(root, "docker-compose.sh");
    ohJson(root);
    const { calls, run } = makeRunner();

    expect(await runSandbox({ cwd: root, run, printArgv: true }, makeIo().io)).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0].args.slice(0, 4)).toEqual([script, "--repo-dir", root, "--extra-env-file"]);
    expect(calls[0].args.slice(5)).toEqual(["--print-argv", "up", "-d", "--build"]);
  });

});

describe("runSandbox", () => {
  it("delegates the EXACT vendored argv with inherited stdio and returns the child's exit code", async () => {
    const root = makeRepo();
    const script = addScript(root, "docker-compose.sh");
    mkdirSync(join(root, ".devcontainer"), { recursive: true });
    const { calls, run } = makeRunner([{ status: 0 }]);
    const { out, io } = makeIo();

    expect(await runSandbox({ cwd: root, run }, io)).toBe(0);
    expect(calls).toEqual([
      {
        cmd: "bash",
        args: [script, "--repo-dir", root, "up", "-d", "--build"],
        opts: { stdio: "inherit" },
      },
    ]);
    expect(out).toEqual([]);
  });

  it("propagates a non-zero exit code from docker-compose.sh", async () => {
    const root = makeRepo();
    addScript(root, "docker-compose.sh");
    const { run } = makeRunner([{ status: 17 }]);
    expect(await runSandbox({ cwd: root, run }, makeIo().io)).toBe(17);
  });

  it("errors naming the missing docker-compose.sh path (no oh: prefix) without spawning", async () => {
    const root = makeRepo();
    const { calls, run } = makeRunner();
    const expected = join(root, ".oh", "scripts", "docker-compose.sh");

    await expect(runSandbox({ cwd: root, run }, makeIo().io)).rejects.toThrow(expected);
    await expect(runSandbox({ cwd: root, run }, makeIo().io)).rejects.not.toThrow(/oh:/);
    expect(calls).toEqual([]);
  });

  it("resolves the project root from a nested cwd", async () => {
    const root = makeRepo();
    const script = addScript(root, "docker-compose.sh");
    const nested = join(root, "src", "app", "deep");
    mkdirSync(nested, { recursive: true });
    const { calls, run } = makeRunner();

    expect(await runSandbox({ cwd: nested, run }, makeIo().io)).toBe(0);
    expect(calls[0].args).toEqual([script, "--repo-dir", root, "up", "-d", "--build"]);
  });

  it("errors when not inside an equipped repo", async () => {
    const bare = mkdtempSync(join(tmpdir(), "oh-lifecycle-bare-"));
    cleanups.push(bare);
    await expect(runSandbox({ cwd: bare, run: makeRunner().run }, makeIo().io)).rejects.toThrow(
      "not an OpenHarness-equipped repo — run `oh update` first",
    );
  });

  it("prompts and records access.dockerSocket=true in oh.json on yes", async () => {
    const root = makeRepo();
    addScript(root, "docker-compose.sh");
    mkdirSync(join(root, ".devcontainer"), { recursive: true });
    const { run } = makeRunner();
    const asked: string[] = [];
    const io: LifecycleIO = {
      stdout: () => {},
      stderr: () => {},
      ask: async (q) => {
        asked.push(q);
        return "y";
      },
    };

    expect(await runSandbox({ cwd: root, run }, io)).toBe(0);
    expect(asked).toHaveLength(1);
    expect(readOhJson(root)).toMatchObject({ access: { dockerSocket: true } });
    expect(existsSync(join(root, ".devcontainer", ".env"))).toBe(false);
  });

  it("records access.dockerSocket=false in oh.json on no", async () => {
    const root = makeRepo();
    addScript(root, "docker-compose.sh");
    mkdirSync(join(root, ".devcontainer"), { recursive: true });
    const { run } = makeRunner();
    const io: LifecycleIO = { stdout: () => {}, stderr: () => {}, ask: async () => "n" };

    expect(await runSandbox({ cwd: root, run }, io)).toBe(0);
    expect(readOhJson(root)).toMatchObject({ access: { dockerSocket: false } });
    expect(existsSync(join(root, ".devcontainer", ".env"))).toBe(false);
  });

  it("does NOT re-prompt once access.dockerSocket is answered TRUE in oh.json", async () => {
    const root = makeRepo();
    addScript(root, "docker-compose.sh");
    mkdirSync(join(root, ".devcontainer"), { recursive: true });
    writeOhJson(root, { access: { dockerSocket: true } });
    const { run } = makeRunner();
    let asked = 0;
    const io: LifecycleIO = {
      stdout: () => {},
      stderr: () => {},
      ask: async () => {
        asked++;
        return "y";
      },
    };

    expect(await runSandbox({ cwd: root, run }, io)).toBe(0);
    expect(asked).toBe(0);
    expect(readOhJson(root)).toMatchObject({ access: { dockerSocket: true } });
  });

  it("does NOT re-prompt once access.dockerSocket is answered FALSE in oh.json", async () => {
    const root = makeRepo();
    addScript(root, "docker-compose.sh");
    mkdirSync(join(root, ".devcontainer"), { recursive: true });
    writeOhJson(root, { access: { dockerSocket: false } });
    const { run } = makeRunner();
    let asked = 0;
    const io: LifecycleIO = {
      stdout: () => {},
      stderr: () => {},
      ask: async () => {
        asked++;
        return "y";
      },
    };

    expect(await runSandbox({ cwd: root, run }, io)).toBe(0);
    expect(asked).toBe(0);
    expect(readOhJson(root)).toMatchObject({ access: { dockerSocket: false } });
  });

  it("asks exactly once across two runs — the answer latches in oh.json (issue #880)", async () => {
    const root = makeRepo();
    addScript(root, "docker-compose.sh");
    mkdirSync(join(root, ".devcontainer"), { recursive: true });
    let asked = 0;
    const io: LifecycleIO = {
      stdout: () => {},
      stderr: () => {},
      ask: async () => {
        asked++;
        return "n";
      },
    };

    expect(await runSandbox({ cwd: root, run: makeRunner().run }, io)).toBe(0);
    expect(asked).toBe(1);
    expect(readOhJson(root)).toMatchObject({ access: { dockerSocket: false } });

    expect(await runSandbox({ cwd: root, run: makeRunner().run }, io)).toBe(0);
    expect(asked).toBe(1);
  });

  it("treats an oh.json WITHOUT access.dockerSocket as unanswered and prompts", async () => {
    const root = makeRepo();
    addScript(root, "docker-compose.sh");
    mkdirSync(join(root, ".devcontainer"), { recursive: true });
    writeOhJson(root, { name: "no-answer-yet", access: { ssh: false } });
    const { run } = makeRunner();
    let asked = 0;
    const io: LifecycleIO = {
      stdout: () => {},
      stderr: () => {},
      ask: async () => {
        asked++;
        return "y";
      },
    };

    expect(await runSandbox({ cwd: root, run }, io)).toBe(0);
    expect(asked).toBe(1);
    expect(readOhJson(root)).toMatchObject({ access: { dockerSocket: true } });
  });

  it("does not read the docker-socket answer out of the secrets dotenv", async () => {
    const root = makeRepo();
    addScript(root, "docker-compose.sh");
    mkdirSync(join(root, ".devcontainer"), { recursive: true });
    writeFileSync(join(root, ".devcontainer", ".env"), "DOCKER_SOCKET=false\n");
    const { run } = makeRunner();
    let asked = 0;
    const io: LifecycleIO = {
      stdout: () => {},
      stderr: () => {},
      ask: async () => {
        asked++;
        return "n";
      },
    };

    expect(await runSandbox({ cwd: root, run }, io)).toBe(0);
    expect(asked).toBe(1);
    expect(readFileSync(join(root, ".devcontainer", ".env"), "utf8")).toBe("DOCKER_SOCKET=false\n");
    expect(readOhJson(root)).toMatchObject({ access: { dockerSocket: false } });
  });

  it("reads config with ZERO subprocesses — only compose is spawned", async () => {
    const root = makeRepo();
    const composeScript = addScript(root, "docker-compose.sh");
    mkdirSync(join(root, ".devcontainer"), { recursive: true });
    writeOhJson(root, {
      name: "configured",
      access: { dockerSocket: true },
      image: { ref: "ghcr.io/x/y:cfg" },
    });
    const { calls, run } = makeRunner([{ status: 0 }]);
    let asked = 0;
    const io: LifecycleIO = {
      stdout: () => {},
      stderr: () => {},
      ask: async () => {
        asked++;
        return "n";
      },
    };

    expect(await runSandbox({ cwd: root, run }, io)).toBe(0);
    expect(asked).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0].args.slice(0, 4)).toEqual([composeScript, "--repo-dir", root, "--extra-env-file"]);
    expect(calls[0].args.slice(5)).toEqual(["up", "-d", "--build"]);
  });

  it("--image (bare, no OH_SANDBOX_IMAGE) → up -d --no-build + OH_SANDBOX_IMAGE=<default>", async () => {
    const root = makeRepo();
    const script = addScript(root, "docker-compose.sh");
    const { calls, run } = makeRunner([{ status: 0 }]);
    const { out, io } = makeIo();

    expect(await runSandbox({ cwd: root, run, image: true }, io)).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0].cmd).toBe("bash");
    expect(calls[0].args).toEqual([script, "--repo-dir", root, "up", "-d", "--no-build"]);
    expect(calls[0].args).not.toContain("--build");
    expect(calls[0].opts.env?.OH_SANDBOX_IMAGE).toBe(DEFAULT_SANDBOX_IMAGE);
    expect(out.join("")).toContain(`image mode: ${DEFAULT_SANDBOX_IMAGE}`);
  });

  it("--image=<ref> wins over oh.json image.ref (explicit ref short-circuits the read)", async () => {
    const root = makeRepo();
    const composeScript = addScript(root, "docker-compose.sh");
    mkdirSync(join(root, ".devcontainer"), { recursive: true });
    writeOhJson(root, { access: { dockerSocket: false }, image: { ref: "ghcr.io/x/y:pinned" } });
    const { calls, run } = makeRunner([{ status: 0 }]);
    const ref = "ghcr.io/mifunedev/openharness:2026.7.5";

    expect(await runSandbox({ cwd: root, run, image: true, imageRef: ref }, makeIo().io)).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0].args.slice(0, 4)).toEqual([composeScript, "--repo-dir", root, "--extra-env-file"]);
    expect(calls[0].args.slice(5)).toEqual(["up", "-d", "--no-build"]);
    expect(calls[0].opts.env?.OH_SANDBOX_IMAGE).toBe(ref);
  });

  it("--image (bare) reads image.ref from oh.json", async () => {
    const root = makeRepo();
    const composeScript = addScript(root, "docker-compose.sh");
    mkdirSync(join(root, ".devcontainer"), { recursive: true });
    writeOhJson(root, {
      access: { dockerSocket: false },
      image: { ref: "ghcr.io/x/y:configured" },
    });
    const { calls, run } = makeRunner([{ status: 0 }]);

    expect(await runSandbox({ cwd: root, run, image: true }, makeIo().io)).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0].args.slice(0, 4)).toEqual([composeScript, "--repo-dir", root, "--extra-env-file"]);
    expect(calls[0].args.slice(5)).toEqual(["up", "-d", "--no-build"]);
    expect(calls[0].opts.env?.OH_SANDBOX_IMAGE).toBe("ghcr.io/x/y:configured");
  });

  it("an ambient OH_SANDBOX_IMAGE beats oh.json, matching compose interpolation", async () => {
    vi.stubEnv("OH_SANDBOX_IMAGE", "ghcr.io/x/y:ambient");
    const root = makeRepo();
    addScript(root, "docker-compose.sh");
    mkdirSync(join(root, ".devcontainer"), { recursive: true });
    writeOhJson(root, { access: { dockerSocket: false }, image: { ref: "ghcr.io/x/y:from-json" } });
    const { calls, run } = makeRunner([{ status: 0 }]);

    expect(await runSandbox({ cwd: root, run, image: true }, makeIo().io)).toBe(0);
    expect(calls[0].opts.env?.OH_SANDBOX_IMAGE).toBe("ghcr.io/x/y:ambient");
  });

  it("--no-build alone → up -d --no-build with NO OH_SANDBOX_IMAGE pinned", async () => {
    const root = makeRepo();
    const script = addScript(root, "docker-compose.sh");
    const { calls, run } = makeRunner([{ status: 0 }]);
    const { out, io } = makeIo();

    expect(await runSandbox({ cwd: root, run, noBuild: true }, io)).toBe(0);
    expect(calls[0].args).toEqual([script, "--repo-dir", root, "up", "-d", "--no-build"]);
    expect(calls[0].opts.env).toBeUndefined();
    expect(out.join("")).toContain("no-build mode");
  });
});


describe("runShell", () => {
  it("resolves the entry by name and execs into its container", () => {
    vi.stubEnv("SANDBOX_NAME", "");
    const root = makeRepo();
    writeOhJson(root, { name: "configured" });
    const { calls, run } = makeRunner([{ status: 0 }]);

    expect(runShell({ ...entry, run }, makeIo().io)).toBe(0);
    expect(calls).toEqual([
      {
        cmd: "docker",
        args: ["exec", "-it", "-u", "sandbox", "configured", "zsh"],
        opts: { stdio: "inherit" },
      },
    ]);
  });

  it("resolves the only registered sandbox when no name is given", () => {
    vi.stubEnv("SANDBOX_NAME", "");
    const root = makeRepo();
    writeOhJson(root, { name: "my-sandbox" });
    const { calls, run } = makeRunner([{ status: 0 }]);

    expect(runShell({ run }, makeIo().io)).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0].cmd).toBe("docker");
    expect(calls[0].args).toEqual(["exec", "-it", "-u", "sandbox", "my-sandbox", "zsh"]);
  });

  it("resolves the entry whose repo contains the cwd", () => {
    vi.stubEnv("SANDBOX_NAME", "");
    const root = makeRepo();
    const checkout = mkdtempSync(join(tmpdir(), "oh-lifecycle-repo-"));
    cleanups.push(checkout);
    writeOhJson(root, { name: "repo-box", repo: checkout });
    mkdirSync(join(root, "..", "oh-lifecycle-other"), { recursive: true });
    writeFileSync(
      join(root, "..", "oh-lifecycle-other", "oh.json"),
      `${JSON.stringify({ version: 1, name: "other" })}\n`,
    );
    const { calls, run } = makeRunner([{ status: 0 }]);

    expect(runShell({ cwd: join(checkout, "src"), run }, makeIo().io)).toBe(0);
    expect(calls[0].args[4]).toBe("repo-box");
  });

  it(`falls back to "${DEFAULT_CONTAINER_NAME}" when oh.json carries no name`, () => {
    vi.stubEnv("SANDBOX_NAME", "");
    const root = makeRepo();
    writeOhJson(root, { git: { userName: "someone" } });
    const { calls, run } = makeRunner([{ status: 0 }]);

    expect(runShell({ ...entry, run }, makeIo().io)).toBe(0);
    expect(calls[0].args[4]).toBe(DEFAULT_CONTAINER_NAME);
  });

  it("an ambient SANDBOX_NAME beats oh.json, matching what compose interpolates", () => {
    vi.stubEnv("SANDBOX_NAME", "from-env");
    const root = makeRepo();
    writeOhJson(root, { name: "from-json" });
    const { calls, run } = makeRunner([{ status: 0 }]);

    expect(runShell({ ...entry, run }, makeIo().io)).toBe(0);
    expect(calls[0].args[4]).toBe("from-env");
  });

  it(`uses "${DEFAULT_CONTAINER_NAME}" when oh.json is absent`, () => {
    vi.stubEnv("SANDBOX_NAME", "");
    const root = makeRepo();
    const { calls, run } = makeRunner([{ status: 0 }]);

    expect(runShell({ ...entry, run }, makeIo().io)).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0].cmd).toBe("docker");
    expect(calls[0].args[4]).toBe(DEFAULT_CONTAINER_NAME);
  });

  it("prints the install hint (after docker's own error) and propagates a non-zero exit", () => {
    vi.stubEnv("SANDBOX_NAME", "");
    makeRepo();
    const { run } = makeRunner([{ status: 126 }]);
    const { err, io } = makeIo();

    expect(runShell({ ...entry, run }, io)).toBe(126);
    expect(err).toEqual([
      "container `openharness` not running? start it with `oh sandbox install docker`\n",
    ]);
  });

  it("no hint on a clean exit", () => {
    makeRepo();
    const { err, io } = makeIo();
    expect(runShell({ ...entry, run: makeRunner([{ status: 0 }]).run }, io)).toBe(0);
    expect(err).toEqual([]);
  });

  it("throws a clean error when docker is not on PATH (ENOENT)", () => {
    makeRepo();
    const { run } = makeRunner([{ status: null, error: { code: "ENOENT" } }]);
    expect(() => runShell({ ...entry, run }, makeIo().io)).toThrow(
      "docker is required for `oh shell` but was not found on PATH",
    );
  });

  it("errors listing the registered names when no sandbox matches", () => {
    const root = makeRepo();
    writeOhJson(root, { name: "one" });
    mkdirSync(join(root, "..", "oh-lifecycle-two"), { recursive: true });
    writeFileSync(
      join(root, "..", "oh-lifecycle-two", "oh.json"),
      `${JSON.stringify({ version: 1, name: "two" })}\n`,
    );
    const bare = mkdtempSync(join(tmpdir(), "oh-lifecycle-bare-"));
    cleanups.push(bare);

    expect(() => runShell({ cwd: bare, run: makeRunner().run }, makeIo().io)).toThrow(
      /several sandboxes are registered .*oh-lifecycle-box, oh-lifecycle-two/,
    );
  });

  it("errors naming the missing sandbox when a name does not resolve", () => {
    makeRepo();
    expect(() => runShell({ name: "absent", run: makeRunner().run }, makeIo().io)).toThrow(
      "no sandbox named `absent`",
    );
  });
});


describe("runGateway", () => {
  it("passes args through VERBATIM with OH_PROJECT_ROOT set and inherited stdio", () => {
    const root = makeRepo();
    const script = addScript(root, "gateway.sh");
    const { calls, run } = makeRunner([{ status: 0 }]);

    expect(runGateway(["pi", "--attach"], { cwd: root, run })).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0].cmd).toBe("bash");
    expect(calls[0].args).toEqual([script, "pi", "--attach"]);
    expect(calls[0].opts.stdio).toBe("inherit");
    expect(calls[0].opts.env?.OH_PROJECT_ROOT).toBe(root);
  });

  it("a NON-leading --help is NOT intercepted — it flows through to the script", () => {
    const root = makeRepo();
    const script = addScript(root, "gateway.sh");
    const { calls, run } = makeRunner();

    const parsed = parseGatewayArgs(["pi", "--help"]);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.args.help).toBe(false);
      expect(runGateway(parsed.args.passthrough, { cwd: root, run })).toBe(0);
    }
    expect(calls[0].args).toEqual([script, "pi", "--help"]);
  });

  it("propagates the script's exit code", () => {
    const root = makeRepo();
    addScript(root, "gateway.sh");
    expect(runGateway(["status"], { cwd: root, run: makeRunner([{ status: 3 }]).run })).toBe(3);
  });

  it("errors naming the missing gateway.sh path without spawning", () => {
    const root = makeRepo();
    const { calls, run } = makeRunner();
    expect(() => runGateway(["pi"], { cwd: root, run })).toThrow(
      join(root, ".oh", "scripts", "gateway.sh"),
    );
    expect(calls).toEqual([]);
  });

  it("errors when not inside an equipped repo", () => {
    const bare = mkdtempSync(join(tmpdir(), "oh-lifecycle-bare-"));
    cleanups.push(bare);
    expect(() => runGateway(["pi"], { cwd: bare, run: makeRunner().run })).toThrow(
      "not an OpenHarness-equipped repo",
    );
  });
});


describe("parseSandboxArgs", () => {
  const base = {
    help: false,
    yes: false,
    image: false,
    noBuild: false,
    printArgv: false,
    json: false,
  };

  it("shows help for a bare `oh sandbox` and for the help flags", () => {
    expect(parseSandboxArgs([])).toEqual({ ok: true, args: { ...base, help: true } });
    for (const h of ["--help", "-h", "help"]) {
      expect(parseSandboxArgs([h])).toEqual({ ok: true, args: { ...base, help: true } });
    }
  });

  it("parses `install <runtime>` with every flag", () => {
    expect(
      parseSandboxArgs([
        "install",
        "docker",
        "--name",
        "box",
        "--repo",
        "/src/app",
        "--yes",
        "--image=ghcr.io/x/y:1",
        "--no-build",
        "--print-argv",
      ]),
    ).toEqual({
      ok: true,
      args: {
        ...base,
        subcommand: "install",
        runtime: "docker",
        name: "box",
        repo: "/src/app",
        yes: true,
        image: true,
        imageRef: "ghcr.io/x/y:1",
        noBuild: true,
        printArgv: true,
      },
    });
  });

  it("parses `list --json`", () => {
    expect(parseSandboxArgs(["list", "--json"])).toEqual({
      ok: true,
      args: { ...base, subcommand: "list", json: true },
    });
  });

  it("requires a runtime for install and rejects a second positional", () => {
    const missing = parseSandboxArgs(["install"]);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error).toContain("a runtime is required");

    const extra = parseSandboxArgs(["install", "docker", "extra"]);
    expect(extra.ok).toBe(false);
    if (!extra.ok) expect(extra.error).toContain('unexpected argument "extra"');
  });

  it("rejects an unknown subcommand, an empty --image= ref and a valueless --name", () => {
    const sub = parseSandboxArgs(["up"]);
    expect(sub.ok).toBe(false);
    if (!sub.ok) expect(sub.error).toContain('unknown subcommand "up"');

    const ref = parseSandboxArgs(["install", "docker", "--image="]);
    expect(ref.ok).toBe(false);
    if (!ref.ok) expect(ref.error).toContain("--image=<ref> requires a non-empty image ref");

    const name = parseSandboxArgs(["install", "docker", "--name"]);
    expect(name.ok).toBe(false);
    if (!name.ok) expect(name.error).toContain("--name requires a value");
  });
});

describe("parseShellArgs", () => {
  it("takes one optional positional sandbox name", () => {
    expect(parseShellArgs([])).toEqual({ ok: true, args: { help: false } });
    expect(parseShellArgs(["my-box"])).toEqual({
      ok: true,
      args: { help: false, name: "my-box" },
    });
  });

  it("recognizes help, rejects flags and extra positionals", () => {
    expect(parseShellArgs(["--help"])).toEqual({ ok: true, args: { help: true } });
    expect(parseShellArgs(["-h"])).toEqual({ ok: true, args: { help: true } });

    const flag = parseShellArgs(["--user"]);
    expect(flag.ok).toBe(false);
    if (!flag.ok) expect(flag.error).toBe('oh shell: unknown flag "--user"');

    const extra = parseShellArgs(["a", "b"]);
    expect(extra.ok).toBe(false);
    if (!extra.ok) expect(extra.error).toBe('oh shell: unexpected argument "b"');
  });
});

describe("parseGatewayArgs", () => {
  it("intercepts ONLY a leading --help/-h", () => {
    for (const h of ["--help", "-h"]) {
      expect(parseGatewayArgs([h])).toEqual({ ok: true, args: { help: true, passthrough: [] } });
    }
  });

  it("everything else passes through verbatim (including empty argv and later flags)", () => {
    expect(parseGatewayArgs([])).toEqual({ ok: true, args: { help: false, passthrough: [] } });
    expect(parseGatewayArgs(["pi", "--attach"])).toEqual({
      ok: true,
      args: { help: false, passthrough: ["pi", "--attach"] },
    });
    expect(parseGatewayArgs(["hermes", "--stop", "--help"])).toEqual({
      ok: true,
      args: { help: false, passthrough: ["hermes", "--stop", "--help"] },
    });
  });
});


describe("help surfaces", () => {
  it("oh --help lists all three lifecycle verbs", () => {
    const text = captureStdout(printOhHelp);
    expect(text).toContain("oh sandbox");
    expect(text).toContain("oh shell [name]");
    expect(text).toContain("oh gateway");
    expect(text).toContain("oh cloud <args...>");
  });

  it("per-verb --help output documents each verb's contract", () => {
    const sandbox = captureStdout(printSandboxHelp);
    expect(sandbox).toContain("oh sandbox install <runtime>");
    expect(sandbox).toContain("oh sandbox list");
    expect(sandbox).toContain("Next: oh shell <name>");

    const shell = captureStdout(printShellHelp);
    expect(shell).toContain("oh shell [name]");
    expect(shell).toContain("docker exec -it -u sandbox");
    expect(shell).toContain(DEFAULT_CONTAINER_NAME);

    const gateway = captureStdout(printGatewayHelp);
    expect(gateway).toContain("oh gateway <pi|hermes>");
    expect(gateway).toContain("gateway.sh");
    expect(gateway).toContain("OH_PROJECT_ROOT");
  });
});

describe("lifecycle inside the sandbox", () => {
  it("refuses to provision the sandbox from inside it", async () => {
    vi.stubEnv("OH_EXECUTION_TARGET", "local");
    const root = makeRepo();
    addScript(root, "docker-compose.sh");
    const { calls, run } = makeRunner();
    const { io, err } = makeIo();
    expect(await runSandbox({ cwd: root, run }, io)).toBe(1);
    expect(err.join("")).toContain("already inside the sandbox");
    expect(calls.length).toBe(0);
  });

  it("opens a shell locally instead of exec-ing into a container", () => {
    vi.stubEnv("OH_EXECUTION_TARGET", "local");
    const root = makeRepo();
    const { calls, run } = makeRunner();
    expect(runShell({ ...entry, run }, makeIo().io)).toBe(0);
    expect(calls[0].cmd).toBe("zsh");
  });
});
