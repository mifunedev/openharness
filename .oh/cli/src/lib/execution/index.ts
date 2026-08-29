import { runningInsideSandbox } from "./detect.js";
import {
  DockerComposeExecutionTarget,
  type DockerComposeTargetOptions,
} from "./docker-compose-target.js";
import { LocalExecutionTarget } from "./local-target.js";
import type { ExecutionTarget } from "./target.js";


export type ResolveExecutionTargetOptions = DockerComposeTargetOptions;

export type ResolvedExecutionTarget = ExecutionTarget &
  Required<Pick<ExecutionTarget, "provision" | "attach">>;

export function resolveExecutionTarget(
  opts: ResolveExecutionTargetOptions,
): ResolvedExecutionTarget {
  if (runningInsideSandbox(opts.env ?? process.env)) {
    return new LocalExecutionTarget({
      projectRoot: opts.projectRoot,
      ...(opts.run ? { run: opts.run } : {}),
      ...(opts.env ? { env: opts.env } : {}),
    });
  }
  return new DockerComposeExecutionTarget(opts);
}

export { DockerComposeExecutionTarget, type DockerComposeTargetOptions };
export {
  EXECUTION_TARGET_ENV,
  runningInsideSandbox,
  SANDBOX_MARKER_FILE,
} from "./detect.js";
export {
  HostOnlyError,
  LocalExecutionTarget,
  type LocalTargetOptions,
} from "./local-target.js";
export {
  ExecutionExitError,
  ExecutionSpawnError,
  type LifecycleRunner,
  type RunResult,
} from "./runner.js";
export type {
  ExecRequest,
  ExecResult,
  ExecutionCapability,
  ExecutionStatus,
  ExecutionTarget,
} from "./target.js";
