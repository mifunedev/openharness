import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPO_ROOT = path.resolve(__dirname, "../..");
const SCRIPT = path.join(REPO_ROOT, "scripts", "ralph.sh");

interface RunResult {
  stdout: string;
  stderr: string;
  status: number;
}

// MUST invoke via `bash`, not `sh`: ralph.sh relies on [[ ]], BASH_SOURCE,
// arrays (POSITIONAL+=), and PIPESTATUS, none of which are POSIX sh.
function run(
  args: string[],
  opts: { env?: NodeJS.ProcessEnv; cwd?: string } = {},
): RunResult {
  const result = spawnSync("bash", [SCRIPT, ...args], {
    encoding: "utf-8",
    env: opts.env,
    cwd: opts.cwd,
  });
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    status: result.status ?? -1,
  };
}

// Strip the named keys from a copy of the current environment. Used to assert
// the `--harness` no-value path without RALPH_HARNESS masking the check.
function envWithout(...keys: string[]): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of keys) delete env[key];
  return env;
}

// Absolute path to bash, resolved once via the parent's PATH. The US-004 tests
// below launch bash by this absolute path (not a bare "bash") because they
// fully control the *child* env PATH to toggle `codex` visibility — and
// spawnSync resolves a bare command name against that stripped child PATH,
// which would ENOENT when the PATH is an empty fixture dir.
const BASH = (() => {
  const r = spawnSync("bash", ["-c", "command -v bash"], { encoding: "utf-8" });
  return (r.stdout ?? "").trim() || "/usr/bin/bash";
})();

// Source ralph.sh in a fresh subshell and run `snippet`. The US-003 source
// guard returns before the loop/normal-mode body, so sourcing only defines the
// functions — the snippet then invokes one in isolation. `set -euo pipefail`
// (ralph.sh:56) is scoped to this subshell, never the test runner.
function sourceCall(
  snippet: string,
  opts: { env?: NodeJS.ProcessEnv } = {},
): RunResult {
  const result = spawnSync(BASH, ["-c", `source '${SCRIPT}'\n${snippet}`], {
    encoding: "utf-8",
    env: opts.env,
  });
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    status: result.status ?? -1,
  };
}

// ---------------------------------------------------------------------------
// US-001 — argument validation (parse_args / normalize_harness)
//
// Every case here exits before ralph.sh:358 derives REPO_ROOT, so no temp cwd
// or fixture is required — the failures fire purely on argument shape.
// ---------------------------------------------------------------------------

describe("ralph.sh argument validation", () => {
  it("exits 2 on an unknown --harness=<value> (normalize_harness rejects it)", () => {
    const { status, stderr } = run(["--harness=foo", "some-task"]);
    expect(status).toBe(2);
    expect(stderr).toMatch(/unknown harness/);
  });

  it("exits 2 when --harness is given no value and RALPH_HARNESS is unset", () => {
    // RALPH_HARNESS only seeds the default HARNESS; the empty-value guard in the
    // `--harness` branch must still fire. Strip it so the check is unmasked.
    const { status, stderr } = run(["--harness"], {
      env: envWithout("RALPH_HARNESS"),
    });
    expect(status).toBe(2);
    expect(stderr).toMatch(/requires a value/);
  });

  it("exits 2 with usage on stderr when no positional taskdesc is given", () => {
    const { status, stderr } = run([], { env: envWithout("RALPH_HARNESS") });
    expect(status).toBe(2);
    expect(stderr).toMatch(/Usage:/);
  });

  it("exits 2 when more than one positional argument is given", () => {
    const { status, stderr } = run(["foo", "bar"], {
      env: envWithout("RALPH_HARNESS"),
    });
    expect(status).toBe(2);
    expect(stderr).toMatch(/Usage:/);
  });

  it("exits 2 when the taskdesc does not match ^[a-z0-9-]+$", () => {
    const { status, stderr } = run(["Bad_Name"], {
      env: envWithout("RALPH_HARNESS"),
    });
    expect(status).toBe(2);
    expect(stderr).toMatch(/must match/);
  });
});

// ---------------------------------------------------------------------------
// US-002 — four-file contract (task-dir + required-files enforcement)
//
// Hermeticity (load-bearing): the child is spawned with cwd set to a non-git
// temp dir. Normal mode re-derives REPO_ROOT at ralph.sh:358 via
// `git rev-parse --show-toplevel 2>/dev/null || pwd`, ignoring the env var, so
// it is the *cwd* — where git rev-parse fails and falls back to pwd — that
// points the task-dir lookup (:359) at the fixture. mkdtempSync(os.tmpdir())
// is non-git, so the real repo is never touched.
//
// No harness stub required: the task-dir check (ralph.sh:361) and four-file
// check (:369) both run BEFORE harness resolution (:375), so they fire even
// with no claude/codex binary reachable.
// ---------------------------------------------------------------------------

const FOUR_FILES = ["prd.md", "prd.json", "prompt.md", "progress.txt"];

describe("ralph.sh four-file contract", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(path.join(tmpdir(), "ralph-"));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  // Spawn with cwd = the non-git temp dir so REPO_ROOT re-derivation lands on
  // the fixture (see the block comment above). REPO_ROOT is also exported to
  // mirror the documented invocation, though normal mode ignores the env var.
  function runHermetic(args: string[]): RunResult {
    return run(args, { cwd: tmp, env: { ...process.env, REPO_ROOT: tmp } });
  }

  // Create tasks/<taskdesc>/ under the fixture with exactly `files` present.
  function scaffoldTask(taskdesc: string, files: string[]): void {
    const dir = path.join(tmp, "tasks", taskdesc);
    mkdirSync(dir, { recursive: true });
    for (const f of files) writeFileSync(path.join(dir, f), "");
  }

  it("exits 1 when the tasks/<desc> dir does not exist", () => {
    const { status, stderr } = runHermetic(["missing-task"]);
    expect(status).toBe(1);
    expect(stderr).toMatch(/does not exist/);
  });

  // One assertion per required file: scaffold the dir with the other three,
  // omit one in turn, and expect the contract check to name the omitted file.
  for (const omitted of FOUR_FILES) {
    it(`exits 1 when ${omitted} is missing from the task dir`, () => {
      const present = FOUR_FILES.filter((f) => f !== omitted);
      scaffoldTask("contract-task", present);
      const { status, stderr } = runHermetic(["contract-task"]);
      expect(status).toBe(1);
      expect(stderr).toMatch(/is missing/);
      expect(stderr).toContain(`${omitted} is missing`);
    });
  }
});

// ---------------------------------------------------------------------------
// US-004 — resilience-function unit tests (depends on the US-003 source guard)
//
// These source ralph.sh via `sourceCall` and invoke one resilience function in
// isolation. The functions covered run BEFORE any harness launches, so no
// real claude/codex/pi is needed: `codex` presence is faked with an executable
// stub on a controlled PATH, and `claude_limit_detected` reads a temp fixture.
// ---------------------------------------------------------------------------

describe("ralph.sh normalize_harness", () => {
  // Each supported harness echoes its own name unchanged (positive cases).
  for (const harness of ["claude", "pi", "codex", "opencode", "deepagents"]) {
    it(`echoes '${harness}' unchanged`, () => {
      const { status, stdout } = sourceCall(`normalize_harness ${harness}`);
      expect(status).toBe(0);
      expect(stdout.trim()).toBe(harness);
    });
  }

  it("exits 2 with /unknown harness/ on an invalid value (negative case)", () => {
    const { status, stderr } = sourceCall("normalize_harness bogus");
    expect(status).toBe(2);
    expect(stderr).toMatch(/unknown harness/);
  });
});

describe("ralph.sh fallback_after_harness", () => {
  let bin: string;

  beforeEach(() => {
    bin = mkdtempSync(path.join(tmpdir(), "ralph-bin-"));
  });

  afterEach(() => {
    rmSync(bin, { recursive: true, force: true });
  });

  // Drop an executable `codex` stub (#!/usr/bin/env bash + exit 0) into `bin`.
  function stubCodex(): void {
    const codex = path.join(bin, "codex");
    writeFileSync(codex, "#!/usr/bin/env bash\nexit 0\n");
    chmodSync(codex, 0o755);
  }

  // Child env whose PATH is exactly `bin`. fallback_after_harness uses only the
  // `command -v` builtin, so no real coreutils are needed — `bin` having (or
  // lacking) the codex stub is the entire fixture.
  const withBin = (): NodeJS.ProcessEnv => ({ ...process.env, PATH: bin });

  it("falls back claude -> codex when codex is on PATH (positive)", () => {
    stubCodex();
    const { status, stdout } = sourceCall("fallback_after_harness claude", {
      env: withBin(),
    });
    expect(status).toBe(0);
    expect(stdout.trim()).toBe("codex");
  });

  it("falls back pi -> codex when codex is on PATH (positive)", () => {
    stubCodex();
    const { status, stdout } = sourceCall("fallback_after_harness pi", {
      env: withBin(),
    });
    expect(status).toBe(0);
    expect(stdout.trim()).toBe("codex");
  });

  it("returns non-zero with /not on PATH/ when codex is absent (claude)", () => {
    // `bin` is empty — no codex stub written.
    const { status, stderr } = sourceCall("fallback_after_harness claude", {
      env: withBin(),
    });
    expect(status).not.toBe(0);
    expect(stderr).toMatch(/not on PATH/);
  });

  it("returns non-zero with /not on PATH/ when codex is absent (pi)", () => {
    const { status, stderr } = sourceCall("fallback_after_harness pi", {
      env: withBin(),
    });
    expect(status).not.toBe(0);
    expect(stderr).toMatch(/not on PATH/);
  });

  it("returns non-zero with /no fallback/ for an unsupported harness", () => {
    // codex present, to prove the rejection is by harness, not codex absence.
    stubCodex();
    const { status, stderr } = sourceCall("fallback_after_harness opencode", {
      env: withBin(),
    });
    expect(status).not.toBe(0);
    expect(stderr).toMatch(/no fallback/);
  });
});

describe("ralph.sh claude_limit_detected", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(path.join(tmpdir(), "ralph-"));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  // Write `contents` to a fixture file and return its path. claude_limit_detected
  // ANDs two greps (ralph.sh:182): 'hit (your |the )?limit' AND 'resets?'. Real
  // `grep` is required, so the parent PATH is left intact (env unset).
  function fixture(contents: string): string {
    const f = path.join(tmp, "out.log");
    writeFileSync(f, contents);
    return f;
  }

  it("exits 0 when BOTH the limit and reset phrases are present", () => {
    const f = fixture("You've hit your limit. It resets at 5pm.\n");
    const { status } = sourceCall(`claude_limit_detected '${f}'`);
    expect(status).toBe(0);
  });

  it("exits 1 when only the limit phrase is present (proves AND-logic)", () => {
    const f = fixture("You've hit your limit. Try again later.\n");
    const { status } = sourceCall(`claude_limit_detected '${f}'`);
    expect(status).toBe(1);
  });

  it("exits 1 when only the reset phrase is present (proves AND-logic)", () => {
    const f = fixture("Your quota resets at midnight.\n");
    const { status } = sourceCall(`claude_limit_detected '${f}'`);
    expect(status).toBe(1);
  });

  it("exits 1 on ordinary output with neither phrase", () => {
    const f = fixture("All good, iteration complete.\n");
    const { status } = sourceCall(`claude_limit_detected '${f}'`);
    expect(status).toBe(1);
  });
});
