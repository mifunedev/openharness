import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
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
