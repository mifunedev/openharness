import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * The subprocess seam shared by the lifecycle verbs and the execution targets
 * (EPIC #731, issue #733).
 *
 * Extracted out of `../../commands/lifecycle.ts` so an `ExecutionTarget`
 * implementation and the CLI verbs run through the SAME injectable runner —
 * one process boundary, one fake in tests. `commands/lifecycle.ts` re-exports
 * `LifecycleRunner` and `RunResult`, so every existing import path still
 * resolves.
 *
 * All subprocess invocations stay argv-array form (never a shell string).
 */

/**
 * Outcome of one subprocess run — the shape a fake runner returns in tests.
 * Mirrors the useful subset of `spawnSync`'s return value; fakes branch on
 * `error.code` ("ENOENT") vs a non-zero `status`, never a real subprocess.
 */
export interface RunResult {
  /** Exit status; null when the process never ran. */
  status: number | null;
  /** Spawn-level failure, e.g. `code: "ENOENT"` (binary not on PATH). */
  error?: { code?: string; message?: string };
  /** Captured stdout — only populated by `stdio: "capture"` runs. */
  stdout?: string;
  /**
   * Captured stderr — only populated by `stdio: "capture"` runs, under exactly
   * the same rule as `stdout`. `"inherit"` runs send stderr straight to the
   * terminal, so there is nothing to capture. Optional so pre-existing fake
   * runners that only set `status`/`stdout` keep typechecking.
   */
  stderr?: string;
}

/** Injectable subprocess runner (DI seam in the style of `RemoteRunner`). */
export type LifecycleRunner = (
  cmd: string,
  args: string[],
  opts: {
    stdio: "inherit" | "capture";
    env?: NodeJS.ProcessEnv;
    /** Bounded wall-clock timeout; omitted → no timeout is imposed. */
    timeoutMs?: number;
  },
) => RunResult;

/**
 * Real runner. `"inherit"` hands the terminal to the child (live docker build
 * output, interactive shells); `"capture"` collects stdout and stderr for
 * config lookups and `exec()` results.
 */
export const spawnRunner: LifecycleRunner = (cmd, args, opts) => {
  const common = { env: opts.env, ...(opts.timeoutMs !== undefined ? { timeout: opts.timeoutMs } : {}) };
  const r =
    opts.stdio === "capture"
      ? spawnSync(cmd, args, { ...common, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" })
      : spawnSync(cmd, args, { ...common, stdio: "inherit" });
  const err = r.error as (Error & { code?: string }) | undefined;
  return {
    status: r.status,
    error: err ? { code: err.code, message: err.message } : undefined,
    stdout: typeof r.stdout === "string" ? r.stdout : undefined,
    stderr: typeof r.stderr === "string" ? r.stderr : undefined,
  };
};

/** The child never ran at all — a spawn-level failure, not a bad exit code. */
export class ExecutionSpawnError extends Error {
  /** `spawnSync`'s error code, e.g. "ENOENT" (binary not on PATH). */
  readonly code?: string;

  constructor(what: string, error?: { code?: string; message?: string }) {
    super(`failed to run ${what}${error?.message ? ` (${error.message})` : ""}`);
    this.name = "ExecutionSpawnError";
    this.code = error?.code;
  }
}

/**
 * The child ran and exited non-zero. Thrown only by operations whose contract
 * return type has nowhere to put an exit code (`provision(): Promise<void>`);
 * `attach()` and `exec()` return the code instead of throwing. Callers that
 * propagate a child's exit status translate this back into their own exit code.
 */
export class ExecutionExitError extends Error {
  readonly exitCode: number;

  constructor(what: string, exitCode: number) {
    super(`${what} exited ${exitCode}`);
    this.name = "ExecutionExitError";
    this.exitCode = exitCode;
  }
}

/** Throw when the child never ran at all (spawn-level failure, not a bad exit). */
export function assertSpawned(r: RunResult, what: string): void {
  if (r.error) {
    throw new ExecutionSpawnError(what, r.error);
  }
}

/** A vendored lifecycle script the caller is about to delegate to must exist. */
export function requireLifecycleScript(root: string, rel: string): string {
  const script = join(root, ".oh", "scripts", rel);
  if (!existsSync(script)) {
    throw new Error(
      `missing lifecycle script ${script} — the vendored .oh/ payload looks incomplete; run \`oh update\` to re-vendor it`,
    );
  }
  return script;
}
