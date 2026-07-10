import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  runGateway,
  runSandbox,
  runShell,
  DEFAULT_CONTAINER_NAME,
  DEFAULT_SANDBOX_IMAGE,
  type LifecycleIO,
  type LifecycleRunner,
  type RunResult,
} from "../commands/lifecycle.js";

// cli.ts has a top-level side effect: main(process.argv.slice(2)).then(process.exit).
// Same guard as cli.property.test.ts: stub process.exit around the import so the
// module body's main() call cannot terminate the vitest worker.
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

// ---------------------------------------------------------------------------
// Test infrastructure — mkdtemp fixtures only, injected runners only. Never the
// real worktree root (its harness.yaml.example would fire the sandbox seed) and
// never a real docker/bash subprocess.
// ---------------------------------------------------------------------------

const cleanups: string[] = [];

afterEach(() => {
  while (cleanups.length > 0) {
    rmSync(cleanups.pop()!, { recursive: true, force: true });
  }
  vi.restoreAllMocks();
});

/** An equipped-repo fixture: a root containing `.oh/scripts/`. */
function makeRepo(): string {
  const d = mkdtempSync(join(tmpdir(), "oh-lifecycle-"));
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
  opts: { stdio: "inherit" | "capture"; env?: NodeJS.ProcessEnv };
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

function makeIo(): { out: string[]; err: string[]; io: LifecycleIO } {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, io: { stdout: (s) => out.push(s), stderr: (s) => err.push(s) } };
}

/** Capture a help printer's output without letting it hit the real terminal. */
function captureStdout(fn: () => void): string {
  const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  fn();
  const text = spy.mock.calls.map((c) => String(c[0])).join("");
  spy.mockRestore();
  return text;
}

// ---------------------------------------------------------------------------
// runSandbox
// ---------------------------------------------------------------------------

describe("runSandbox", () => {
  it("delegates the EXACT vendored argv with inherited stdio and returns the child's exit code", async () => {
    const root = makeRepo();
    const script = addScript(root, "docker-compose.sh");
    writeFileSync(join(root, "harness.yaml"), "sandbox:\n  name: x\n");
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
    // harness.yaml already existed → no seed, no operation-log line.
    // No io.ask injected + non-TTY → the Docker-socket prompt never fires.
    expect(out).toEqual([]);
  });

  it("propagates a non-zero exit code from docker-compose.sh", async () => {
    const root = makeRepo();
    addScript(root, "docker-compose.sh");
    const { run } = makeRunner([{ status: 17 }]);
    expect(await runSandbox({ cwd: root, run }, makeIo().io)).toBe(17);
  });

  it("seeds harness.yaml from harness.yaml.example with exactly one operation-log line", async () => {
    const root = makeRepo();
    addScript(root, "docker-compose.sh");
    writeFileSync(join(root, "harness.yaml.example"), "sandbox:\n  name: seeded\n");
    const { run } = makeRunner();
    const { out, io } = makeIo();

    expect(await runSandbox({ cwd: root, run }, io)).toBe(0);
    expect(readFileSync(join(root, "harness.yaml"), "utf8")).toBe("sandbox:\n  name: seeded\n");
    expect(out).toEqual(["create harness.yaml (from harness.yaml.example)\n"]);
  });

  it("seed is a no-op when harness.yaml already exists (never overwritten, no log line)", async () => {
    const root = makeRepo();
    addScript(root, "docker-compose.sh");
    writeFileSync(join(root, "harness.yaml"), "sandbox:\n  name: mine\n");
    writeFileSync(join(root, "harness.yaml.example"), "sandbox:\n  name: template\n");
    const { out, io } = makeIo();

    expect(await runSandbox({ cwd: root, run: makeRunner().run }, io)).toBe(0);
    expect(readFileSync(join(root, "harness.yaml"), "utf8")).toBe("sandbox:\n  name: mine\n");
    expect(out).toEqual([]);
  });

  it("seed is a no-op when no harness.yaml.example exists (oh init-equipped repos)", async () => {
    const root = makeRepo();
    addScript(root, "docker-compose.sh");
    const { calls, run } = makeRunner();
    const { out, io } = makeIo();

    expect(await runSandbox({ cwd: root, run }, io)).toBe(0);
    expect(existsSync(join(root, "harness.yaml"))).toBe(false);
    expect(out).toEqual([]);
    expect(calls).toHaveLength(1); // compose still runs
  });

  it("errors naming the missing docker-compose.sh path (no oh: prefix) without spawning", async () => {
    const root = makeRepo(); // .oh/scripts exists but the script does not
    const { calls, run } = makeRunner();
    const expected = join(root, ".oh", "scripts", "docker-compose.sh");

    // Now async → a thrown error surfaces as a rejected promise, not a sync throw.
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
      "not an OpenHarness-equipped repo — run `oh init` first",
    );
  });

  // ── Docker-socket opt-in (default OFF; prompt only when interactive) ──────
  it("prompts and writes DOCKER_SOCKET=true to .devcontainer/.env on yes", async () => {
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
    expect(readFileSync(join(root, ".devcontainer", ".env"), "utf8")).toContain("DOCKER_SOCKET=true");
  });

  it("records DOCKER_SOCKET=false on no (sticks the choice; no re-prompt later)", async () => {
    const root = makeRepo();
    addScript(root, "docker-compose.sh");
    mkdirSync(join(root, ".devcontainer"), { recursive: true });
    const { run } = makeRunner();
    const io: LifecycleIO = { stdout: () => {}, stderr: () => {}, ask: async () => "n" };

    expect(await runSandbox({ cwd: root, run }, io)).toBe(0);
    expect(readFileSync(join(root, ".devcontainer", ".env"), "utf8")).toContain("DOCKER_SOCKET=false");
  });

  it("does NOT re-prompt when DOCKER_SOCKET is already set in .devcontainer/.env", async () => {
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
        return "y";
      },
    };

    expect(await runSandbox({ cwd: root, run }, io)).toBe(0);
    expect(asked).toBe(0);
    // Standing choice untouched.
    expect(readFileSync(join(root, ".devcontainer", ".env"), "utf8")).toBe("DOCKER_SOCKET=false\n");
  });

  it("does NOT prompt when sandbox.docker_socket is set in harness.yaml", async () => {
    const root = makeRepo();
    const composeScript = addScript(root, "docker-compose.sh");
    addScript(root, "harness-config.sh");
    writeFileSync(join(root, "harness.yaml"), "sandbox:\n  docker_socket: true\n");
    // call 0 = harness-config get (returns "true"); call 1 = compose up.
    const { calls, run } = makeRunner([{ status: 0, stdout: "true\n" }, { status: 0 }]);
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
    expect(calls[0].args).toEqual([
      join(root, ".oh", "scripts", "harness-config.sh"),
      "get",
      "sandbox.docker_socket",
      join(root, "harness.yaml"),
    ]);
    expect(calls[1].args).toEqual([composeScript, "--repo-dir", root, "up", "-d", "--build"]);
  });

  // ── Prebuilt-image mode (--image / --no-build) ───────────────────────────
  it("--image (bare, no harness.yaml image) → up -d --no-build + OH_SANDBOX_IMAGE=<default>", async () => {
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

  it("--image=<ref> wins over harness.yaml sandbox.image (explicit ref → no image lookup)", async () => {
    const root = makeRepo();
    const composeScript = addScript(root, "docker-compose.sh");
    addScript(root, "harness-config.sh");
    writeFileSync(join(root, "harness.yaml"), "sandbox:\n  image: ghcr.io/x/y:pinned\n");
    // call 0 = the docker-socket opt-in lookup (fires whenever both files exist,
    // returns empty → unconfigured, non-TTY → no prompt); call 1 = compose up.
    // No sandbox.image lookup happens — the explicit ref short-circuits it.
    const { calls, run } = makeRunner([{ status: 0 }]);
    const ref = "ghcr.io/mifunedev/openharness:2026.7.5";

    expect(await runSandbox({ cwd: root, run, image: true, imageRef: ref }, makeIo().io)).toBe(0);
    expect(calls).toHaveLength(2);
    expect(calls.some((c) => c.args.includes("sandbox.image"))).toBe(false);
    expect(calls[1].args).toEqual([composeScript, "--repo-dir", root, "up", "-d", "--no-build"]);
    expect(calls[1].opts.env?.OH_SANDBOX_IMAGE).toBe(ref);
  });

  it("--image (bare) reads harness.yaml sandbox.image via the vendored parser", async () => {
    const root = makeRepo();
    const composeScript = addScript(root, "docker-compose.sh");
    const configScript = addScript(root, "harness-config.sh");
    writeFileSync(join(root, "harness.yaml"), "sandbox:\n  image: ghcr.io/x/y:configured\n");
    // call 0 = docker-socket opt-in lookup (empty → unconfigured); call 1 =
    // sandbox.image lookup → the configured ref; call 2 = compose up.
    const { calls, run } = makeRunner([
      { status: 0 },
      { status: 0, stdout: "ghcr.io/x/y:configured\n" },
      { status: 0 },
    ]);

    expect(await runSandbox({ cwd: root, run, image: true }, makeIo().io)).toBe(0);
    expect(calls[1]).toEqual({
      cmd: "sh",
      args: [configScript, "get", "sandbox.image", join(root, "harness.yaml")],
      opts: { stdio: "capture" },
    });
    expect(calls[2].args).toEqual([composeScript, "--repo-dir", root, "up", "-d", "--no-build"]);
    expect(calls[2].opts.env?.OH_SANDBOX_IMAGE).toBe("ghcr.io/x/y:configured");
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

// ---------------------------------------------------------------------------
// runShell
// ---------------------------------------------------------------------------

describe("runShell", () => {
  it("positional container wins — no harness-config lookup even when configured", () => {
    const root = makeRepo();
    addScript(root, "harness-config.sh");
    writeFileSync(join(root, "harness.yaml"), "sandbox:\n  name: configured\n");
    const { calls, run } = makeRunner([{ status: 0 }]);

    expect(runShell({ cwd: root, run, container: "custom-box" }, makeIo().io)).toBe(0);
    expect(calls).toEqual([
      {
        cmd: "docker",
        args: ["exec", "-it", "-u", "sandbox", "custom-box", "zsh"],
        opts: { stdio: "inherit" },
      },
    ]);
  });

  it("reads sandbox.name via harness-config.sh with the EXPLICIT <root>/harness.yaml path, from a nested cwd", () => {
    const root = makeRepo();
    const configScript = addScript(root, "harness-config.sh");
    writeFileSync(join(root, "harness.yaml"), "sandbox:\n  name: my-sandbox\n");
    const nested = join(root, "pkg", "web");
    mkdirSync(nested, { recursive: true });
    // Captured-stdout lookup first, then the inherit-stdio docker exec.
    const { calls, run } = makeRunner([
      { status: 0, stdout: "my-sandbox\n" },
      { status: 0 },
    ]);

    expect(runShell({ cwd: nested, run }, makeIo().io)).toBe(0);
    expect(calls[0]).toEqual({
      cmd: "sh",
      args: [configScript, "get", "sandbox.name", join(root, "harness.yaml")],
      opts: { stdio: "capture" },
    });
    expect(calls[1].cmd).toBe("docker");
    expect(calls[1].args).toEqual(["exec", "-it", "-u", "sandbox", "my-sandbox", "zsh"]);
  });

  it(`falls back to "${DEFAULT_CONTAINER_NAME}" when sandbox.name is unset (empty lookup output)`, () => {
    const root = makeRepo();
    addScript(root, "harness-config.sh");
    writeFileSync(join(root, "harness.yaml"), "git:\n  user_name: someone\n");
    const { calls, run } = makeRunner([{ status: 0, stdout: "" }, { status: 0 }]);

    expect(runShell({ cwd: root, run }, makeIo().io)).toBe(0);
    expect(calls[1].args[4]).toBe(DEFAULT_CONTAINER_NAME);
  });

  it(`skips the lookup entirely and uses "${DEFAULT_CONTAINER_NAME}" when harness.yaml is absent`, () => {
    const root = makeRepo();
    addScript(root, "harness-config.sh");
    const { calls, run } = makeRunner([{ status: 0 }]);

    expect(runShell({ cwd: root, run }, makeIo().io)).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0].cmd).toBe("docker");
    expect(calls[0].args[4]).toBe(DEFAULT_CONTAINER_NAME);
  });

  it("prints the `oh sandbox` hint (after docker's own error) and propagates a non-zero exit", () => {
    const root = makeRepo();
    const { run } = makeRunner([{ status: 126 }]);
    const { err, io } = makeIo();

    expect(runShell({ cwd: root, run, container: "openharness" }, io)).toBe(126);
    // docker's raw error already went to the INHERITED stderr; ours follows it.
    expect(err).toEqual(["container `openharness` not running? start it with `oh sandbox`\n"]);
  });

  it("no hint on a clean exit", () => {
    const root = makeRepo();
    const { err, io } = makeIo();
    expect(runShell({ cwd: root, run: makeRunner([{ status: 0 }]).run, container: "x" }, io)).toBe(0);
    expect(err).toEqual([]);
  });

  it("throws a clean error when docker is not on PATH (ENOENT)", () => {
    const root = makeRepo();
    const { run } = makeRunner([{ status: null, error: { code: "ENOENT" } }]);
    expect(() => runShell({ cwd: root, run, container: "x" }, makeIo().io)).toThrow(
      "docker is required for `oh shell` but was not found on PATH",
    );
  });

  it("errors when not inside an equipped repo", () => {
    const bare = mkdtempSync(join(tmpdir(), "oh-lifecycle-bare-"));
    cleanups.push(bare);
    expect(() => runShell({ cwd: bare, run: makeRunner().run }, makeIo().io)).toThrow(
      "not an OpenHarness-equipped repo",
    );
  });
});

// ---------------------------------------------------------------------------
// runGateway
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Arg parsing (the cli.ts parse<Cmd>Args convention)
// ---------------------------------------------------------------------------

describe("parseSandboxArgs", () => {
  it("accepts no arguments and recognizes the help flags", () => {
    expect(parseSandboxArgs([])).toEqual({
      ok: true,
      args: { help: false, image: false, noBuild: false },
    });
    for (const h of ["--help", "-h", "help"]) {
      expect(parseSandboxArgs([h])).toEqual({
        ok: true,
        args: { help: true, image: false, noBuild: false },
      });
    }
  });

  it("accepts --image (bare), --image=<ref>, and --no-build (alone or combined)", () => {
    expect(parseSandboxArgs(["--image"])).toEqual({
      ok: true,
      args: { help: false, image: true, noBuild: false },
    });
    expect(parseSandboxArgs(["--image=ghcr.io/mifunedev/openharness:2026.7.5"])).toEqual({
      ok: true,
      args: {
        help: false,
        image: true,
        imageRef: "ghcr.io/mifunedev/openharness:2026.7.5",
        noBuild: false,
      },
    });
    expect(parseSandboxArgs(["--no-build"])).toEqual({
      ok: true,
      args: { help: false, image: false, noBuild: true },
    });
    expect(parseSandboxArgs(["--image", "--no-build"])).toEqual({
      ok: true,
      args: { help: false, image: true, noBuild: true },
    });
  });

  it("rejects an empty --image= ref", () => {
    const r = parseSandboxArgs(["--image="]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("--image=<ref> requires a non-empty image ref");
  });

  it("rejects unknown flags and stray positionals", () => {
    for (const bad of ["--force", "--dry-run", "extra"]) {
      const r = parseSandboxArgs([bad]);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toContain(`oh sandbox: unexpected argument "${bad}"`);
    }
  });
});

describe("parseShellArgs", () => {
  it("takes one optional positional container name", () => {
    expect(parseShellArgs([])).toEqual({ ok: true, args: { help: false } });
    expect(parseShellArgs(["my-box"])).toEqual({
      ok: true,
      args: { help: false, container: "my-box" },
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

// ---------------------------------------------------------------------------
// Help surfaces
// ---------------------------------------------------------------------------

describe("help surfaces", () => {
  it("oh --help lists all three lifecycle verbs", () => {
    const text = captureStdout(printOhHelp);
    expect(text).toContain("oh sandbox");
    expect(text).toContain("oh shell [container]");
    expect(text).toContain("oh gateway");
    expect(text).toContain("oh cloud <args...>");
  });

  it("per-verb --help output documents each verb's contract", () => {
    const sandbox = captureStdout(printSandboxHelp);
    expect(sandbox).toContain("oh sandbox");
    expect(sandbox).toContain("docker-compose.sh --repo-dir <root> up -d --build");
    expect(sandbox).toContain("harness.yaml.example");

    const shell = captureStdout(printShellHelp);
    expect(shell).toContain("oh shell [container]");
    expect(shell).toContain("docker exec -it -u sandbox");
    expect(shell).toContain(DEFAULT_CONTAINER_NAME);

    const gateway = captureStdout(printGatewayHelp);
    expect(gateway).toContain("oh gateway <pi|hermes>");
    expect(gateway).toContain("gateway.sh");
    expect(gateway).toContain("OH_PROJECT_ROOT");
  });
});
