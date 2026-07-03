import { spawnSync } from "node:child_process";

/**
 * Remote payload sourcing for `oh init` / `oh update` (issue #564).
 *
 * Materializes a pristine OpenHarness checkout by shallow-cloning the public
 * repo into a caller-supplied temp directory. The caller owns the directory's
 * lifecycle (mkdtemp before, rm in a try/finally after) — this module only
 * fills it. All subprocess invocations use argv-array form (never a shell
 * string, mirroring lib/tmux.ts) and the CLI stays dependency-free.
 */

export const DEFAULT_REPO_URL = "https://github.com/mifunedev/openharness";
export const DEFAULT_CLONE_TIMEOUT_MS = 120_000;

/**
 * Outcome of one subprocess run — the shape a fake runner returns in tests.
 * Mirrors the useful subset of `spawnSync`'s return value.
 */
export interface RunResult {
  /** Exit status; null when the process never ran or was killed (timeout). */
  status: number | null;
  /**
   * Spawn-level failure, e.g. `code: "ENOENT"` (git not on PATH) or
   * `code: "ETIMEDOUT"` (bounded timeout exceeded).
   */
  error?: { code?: string; message?: string };
  /** Captured stderr — surfaces git's own failure reason in thrown errors. */
  stderr?: string;
}

/** Injectable subprocess runner (DI seam in the style of `InitIO`). */
export type RemoteRunner = (
  cmd: string,
  args: string[],
  opts: { env: NodeJS.ProcessEnv; timeoutMs: number },
) => RunResult;

export interface FetchRemoteSourceOptions {
  /**
   * Caller-supplied temp directory to clone into (empty or nonexistent;
   * `git clone` refuses a non-empty one). Returned on success.
   */
  destDir: string;
  /** Clone URL. Default: the public OpenHarness repo. Tests use `file://` fixtures. */
  repoUrl?: string;
  /** Branch/tag to clone (`--branch <ref>`). Omitted → the clone's default branch. */
  ref?: string;
  /** Bounded clone timeout in ms. Default 120000; overridable for tests. */
  timeoutMs?: number;
  /** Subprocess runner. Default: real `spawnSync`. Tests inject a fake. */
  run?: RemoteRunner;
}

/** Real runner: argv-array spawnSync, stderr captured for error surfacing. */
const spawnRunner: RemoteRunner = (cmd, args, opts) => {
  const r = spawnSync(cmd, args, {
    env: opts.env,
    timeout: opts.timeoutMs,
    stdio: ["ignore", "ignore", "pipe"],
    encoding: "utf8",
  });
  const err = r.error as (Error & { code?: string }) | undefined;
  return {
    status: r.status,
    error: err ? { code: err.code, message: err.message } : undefined,
    stderr: r.stderr ?? "",
  };
};

/** The offline-fallback suffix every fetch failure suggests. */
function fallbackHint(): string {
  return "use --from <dir> to point at a local OpenHarness checkout instead";
}

/**
 * Shallow-clone the OpenHarness repo into `opts.destDir` and return that path.
 *
 * Runs `git clone --depth 1 [--branch <ref>] -- <repoUrl> <destDir>` with
 * `GIT_TERMINAL_PROMPT=0` (auth failures fail fast instead of blocking on a
 * credential prompt) and a bounded timeout. Every failure throws a plain
 * `Error` naming the URL tried and suggesting the `--from <dir>` offline
 * fallback; cli.ts's main() maps thrown errors to exit code 2.
 */
export function fetchRemoteSource(opts: FetchRemoteSourceOptions): string {
  const repoUrl = opts.repoUrl ?? DEFAULT_REPO_URL;
  const ref = opts.ref;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_CLONE_TIMEOUT_MS;
  const run = opts.run ?? spawnRunner;

  // Flag-injection guard: user-supplied values must never be parseable as
  // git options. Rejected BEFORE any spawn (the `--` separator below is
  // defense-in-depth, not the primary guard).
  if (repoUrl.startsWith("-")) {
    throw new Error(`invalid repo URL "${repoUrl}" (must not start with "-")`);
  }
  if (ref !== undefined && ref.startsWith("-")) {
    throw new Error(`invalid ref "${ref}" (must not start with "-")`);
  }

  const args = ["clone", "--depth", "1"];
  if (ref !== undefined) args.push("--branch", ref);
  args.push("--", repoUrl, opts.destDir);

  const r = run("git", args, {
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    timeoutMs,
  });

  if (r.error?.code === "ENOENT") {
    throw new Error(
      `git is required to fetch ${repoUrl} but was not found on PATH; ` +
        `install git, or ${fallbackHint()}`,
    );
  }
  if (r.error?.code === "ETIMEDOUT") {
    throw new Error(
      `git clone of ${repoUrl} timed out after ${timeoutMs}ms; ` +
        `check network access, or ${fallbackHint()}`,
    );
  }
  if (r.error) {
    throw new Error(
      `git clone of ${repoUrl} failed to start` +
        `${r.error.message ? ` (${r.error.message})` : ""}; ${fallbackHint()}`,
    );
  }
  if (r.status !== 0) {
    // Covers auth failures too: with GIT_TERMINAL_PROMPT=0 git exits non-zero
    // ("terminal prompts disabled") instead of hanging on a credential prompt.
    const detail = (r.stderr ?? "").trim();
    throw new Error(
      `git clone of ${repoUrl} failed (exit ${r.status})` +
        `${detail ? `: ${detail}` : ""}; ${fallbackHint()}`,
    );
  }

  return opts.destDir;
}
