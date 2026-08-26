import { spawnSync } from "node:child_process";


export const DEFAULT_REPO_URL = "https://github.com/mifunedev/openharness";
export const DEFAULT_CLONE_TIMEOUT_MS = 120_000;

export interface RunResult {
  status: number | null;
  error?: { code?: string; message?: string };
  stderr?: string;
}

export type RemoteRunner = (
  cmd: string,
  args: string[],
  opts: { env: NodeJS.ProcessEnv; timeoutMs: number },
) => RunResult;

export interface FetchRemoteSourceOptions {
  destDir: string;
  repoUrl?: string;
  ref?: string;
  timeoutMs?: number;
  run?: RemoteRunner;
}

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

function fallbackHint(): string {
  return "use --from <dir> to point at a local OpenHarness checkout instead";
}

export function fetchRemoteSource(opts: FetchRemoteSourceOptions): string {
  const repoUrl = opts.repoUrl ?? DEFAULT_REPO_URL;
  const ref = opts.ref;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_CLONE_TIMEOUT_MS;
  const run = opts.run ?? spawnRunner;

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
    const detail = (r.stderr ?? "").trim();
    throw new Error(
      `git clone of ${repoUrl} failed (exit ${r.status})` +
        `${detail ? `: ${detail}` : ""}; ${fallbackHint()}`,
    );
  }

  return opts.destDir;
}
