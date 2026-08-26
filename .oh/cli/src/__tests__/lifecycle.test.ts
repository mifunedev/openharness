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
// real worktree root (its .devcontainer/.example.env would fire the sandbox
// seed) and never a real docker/bash subprocess.
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
    mkdirSync(join(root, ".devcontainer"), { recursive: true });
    writeFileSync(join(root, ".devcontainer", ".env"), "SANDBOX_NAME=x\nDOCKER_SOCKET=false\n");
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
    // .devcontainer/.env already existed → no seed, no operation-log line.
    // DOCKER_SOCKET already set → the Docker-socket prompt never fires either.
    expect(out).toEqual([]);
  });

  it("propagates a non-zero exit code from docker-compose.sh", async () => {
    const root = makeRepo();
    addScript(root, "docker-compose.sh");
    const { run } = makeRunner([{ status: 17 }]);
    expect(await runSandbox({ cwd: root, run }, makeIo().io)).toBe(17);
  });

  it("seeds .devcontainer/.env from .example.env with exactly one operation-log line", async () => {
    const root = makeRepo();
    addScript(root, "docker-compose.sh");
    mkdirSync(join(root, ".devcontainer"), { recursive: true });
    writeFileSync(join(root, ".devcontainer", ".example.env"), "SANDBOX_NAME=seeded\nDOCKER_SOCKET=false\n");
    const { run } = makeRunner();
    const { out, io } = makeIo();

    expect(await runSandbox({ cwd: root, run }, io)).toBe(0);
    expect(readFileSync(join(root, ".devcontainer", ".env"), "utf8")).toBe(
      "SANDBOX_NAME=seeded\nDOCKER_SOCKET=false\n",
    );
    expect(out).toEqual(["create .devcontainer/.env (from .devcontainer/.example.env)\n"]);
  });

  it("seed is a no-op when .devcontainer/.env already exists (never overwritten, no log line)", async () => {
    const root = makeRepo();
    addScript(root, "docker-compose.sh");
    mkdirSync(join(root, ".devcontainer"), { recursive: true });
    writeFileSync(join(root, ".devcontainer", ".env"), "SANDBOX_NAME=mine\nDOCKER_SOCKET=false\n");
    writeFileSync(join(root, ".devcontainer", ".example.env"), "SANDBOX_NAME=template\n");
    const { out, io } = makeIo();

    expect(await runSandbox({ cwd: root, run: makeRunner().run }, io)).toBe(0);
    expect(readFileSync(join(root, ".devcontainer", ".env"), "utf8")).toBe(
      "SANDBOX_NAME=mine\nDOCKER_SOCKET=false\n",
    );
    expect(out).toEqual([]);
  });

  it("seed is a no-op when no .example.env exists (nothing to copy from)", async () => {
    const root = makeRepo();
    addScript(root, "docker-compose.sh");
    const { calls, run } = makeRunner();
    const { out, io } = makeIo();

    expect(await runSandbox({ cwd: root, run }, io)).toBe(0);
    expect(existsSync(join(root, ".devcontainer", ".env"))).toBe(false);
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

  it("treats a COMMENTED template line as unconfigured and still prompts", async () => {
    // The seeded .env ships `# DOCKER_SOCKET=false`. A commented line is
    // documentation, not a standing choice — reading it as one would silence
    // the security prompt for every fresh install.
    const root = makeRepo();
    addScript(root, "docker-compose.sh");
    mkdirSync(join(root, ".devcontainer"), { recursive: true });
    writeFileSync(join(root, ".devcontainer", ".env"), "# DOCKER_SOCKET=false\n");
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
    // Uncommented IN PLACE, not appended: one line in, one line out.
    expect(readFileSync(join(root, ".devcontainer", ".env"), "utf8")).toBe("DOCKER_SOCKET=true\n");
  });

  it("reads config with ZERO subprocesses — only compose is spawned", async () => {
    // harness.yaml needed a vendored parser, so every config read was a
    // subprocess. `.env` is read in-process, so the ONLY spawn left is compose
    // itself. This is the assertion that the parser shell-out is gone.
    const root = makeRepo();
    const composeScript = addScript(root, "docker-compose.sh");
    mkdirSync(join(root, ".devcontainer"), { recursive: true });
    writeFileSync(
      join(root, ".devcontainer", ".env"),
      "DOCKER_SOCKET=true\nSANDBOX_NAME=configured\nOH_SANDBOX_IMAGE=ghcr.io/x/y:cfg\n",
    );
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
    expect(calls[0].args).toEqual([composeScript, "--repo-dir", root, "up", "-d", "--build"]);
  });

  // ── Prebuilt-image mode (--image / --no-build) ───────────────────────────
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

  it("--image=<ref> wins over .env OH_SANDBOX_IMAGE (explicit ref short-circuits the read)", async () => {
    const root = makeRepo();
    const composeScript = addScript(root, "docker-compose.sh");
    mkdirSync(join(root, ".devcontainer"), { recursive: true });
    writeFileSync(
      join(root, ".devcontainer", ".env"),
      "OH_SANDBOX_IMAGE=ghcr.io/x/y:pinned\nDOCKER_SOCKET=false\n",
    );
    const { calls, run } = makeRunner([{ status: 0 }]);
    const ref = "ghcr.io/mifunedev/openharness:2026.7.5";

    expect(await runSandbox({ cwd: root, run, image: true, imageRef: ref }, makeIo().io)).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0].args).toEqual([composeScript, "--repo-dir", root, "up", "-d", "--no-build"]);
    expect(calls[0].opts.env?.OH_SANDBOX_IMAGE).toBe(ref);
  });

  it("--image (bare) reads OH_SANDBOX_IMAGE from .devcontainer/.env", async () => {
    const root = makeRepo();
    const composeScript = addScript(root, "docker-compose.sh");
    mkdirSync(join(root, ".devcontainer"), { recursive: true });
    writeFileSync(
      join(root, ".devcontainer", ".env"),
      "OH_SANDBOX_IMAGE=ghcr.io/x/y:configured\nDOCKER_SOCKET=false\n",
    );
    const { calls, run } = makeRunner([{ status: 0 }]);

    expect(await runSandbox({ cwd: root, run, image: true }, makeIo().io)).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0].args).toEqual([composeScript, "--repo-dir", root, "up", "-d", "--no-build"]);
    expect(calls[0].opts.env?.OH_SANDBOX_IMAGE).toBe("ghcr.io/x/y:configured");
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
  it("positional container wins — the .env value is not consulted", () => {
    const root = makeRepo();
    mkdirSync(join(root, ".devcontainer"), { recursive: true });
    writeFileSync(join(root, ".devcontainer", ".env"), "SANDBOX_NAME=configured\n");
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

  it("reads SANDBOX_NAME from <root>/.devcontainer/.env, from a nested cwd", () => {
    // The read is anchored to the resolved project ROOT, never the caller's
    // CWD. A CWD-relative lookup would make every value look unset from a
    // subdirectory — the contract `readEnvValue` documents.
    const root = makeRepo();
    mkdirSync(join(root, ".devcontainer"), { recursive: true });
    writeFileSync(join(root, ".devcontainer", ".env"), "SANDBOX_NAME=my-sandbox\n");
    const nested = join(root, "pkg", "web");
    mkdirSync(nested, { recursive: true });
    const { calls, run } = makeRunner([{ status: 0 }]);

    expect(runShell({ cwd: nested, run }, makeIo().io)).toBe(0);
    // No parser subprocess: the docker exec is the ONLY call.
    expect(calls).toHaveLength(1);
    expect(calls[0].cmd).toBe("docker");
    expect(calls[0].args).toEqual(["exec", "-it", "-u", "sandbox", "my-sandbox", "zsh"]);
  });

  it(`falls back to "${DEFAULT_CONTAINER_NAME}" when SANDBOX_NAME is unset`, () => {
    const root = makeRepo();
    mkdirSync(join(root, ".devcontainer"), { recursive: true });
    writeFileSync(join(root, ".devcontainer", ".env"), "GIT_USER_NAME=someone\n");
    const { calls, run } = makeRunner([{ status: 0 }]);

    expect(runShell({ cwd: root, run }, makeIo().io)).toBe(0);
    expect(calls[0].args[4]).toBe(DEFAULT_CONTAINER_NAME);
  });

  it(`uses "${DEFAULT_CONTAINER_NAME}" when .devcontainer/.env is absent`, () => {
    const root = makeRepo();
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
    expect(sandbox).toContain(".devcontainer/.example.env");

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
