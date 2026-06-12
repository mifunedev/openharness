import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
