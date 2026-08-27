import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";


export interface RunResult {
  status: number | null;
  error?: { code?: string; message?: string };
  stdout?: string;
  stderr?: string;
}

export type LifecycleRunner = (
  cmd: string,
  args: string[],
  opts: {
    stdio: "inherit" | "capture";
    env?: NodeJS.ProcessEnv;
    cwd?: string;
    timeoutMs?: number;
  },
) => RunResult;

export const spawnRunner: LifecycleRunner = (cmd, args, opts) => {
  const common = {
    env: opts.env,
    ...(opts.cwd !== undefined ? { cwd: opts.cwd } : {}),
    ...(opts.timeoutMs !== undefined ? { timeout: opts.timeoutMs } : {}),
  };
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

export class ExecutionSpawnError extends Error {
  readonly code?: string;

  constructor(what: string, error?: { code?: string; message?: string }) {
    super(`failed to run ${what}${error?.message ? ` (${error.message})` : ""}`);
    this.name = "ExecutionSpawnError";
    this.code = error?.code;
  }
}

export class ExecutionExitError extends Error {
  readonly exitCode: number;

  constructor(what: string, exitCode: number) {
    super(`${what} exited ${exitCode}`);
    this.name = "ExecutionExitError";
    this.exitCode = exitCode;
  }
}

export function assertSpawned(r: RunResult, what: string): void {
  if (r.error) {
    throw new ExecutionSpawnError(what, r.error);
  }
}

export function requireLifecycleScript(root: string, rel: string): string {
  const script = join(root, ".oh", "scripts", rel);
  if (!existsSync(script)) {
    throw new Error(
      `missing lifecycle script ${script} — the vendored .oh/ payload looks incomplete; run \`oh update\` to re-vendor it`,
    );
  }
  return script;
}
