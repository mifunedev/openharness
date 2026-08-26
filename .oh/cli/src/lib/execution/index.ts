import {
  DockerComposeExecutionTarget,
  type DockerComposeTargetOptions,
} from "./docker-compose-target.js";
import type { ExecutionTarget } from "./target.js";


export type ResolveExecutionTargetOptions = DockerComposeTargetOptions;

export type ResolvedExecutionTarget = ExecutionTarget &
  Required<Pick<ExecutionTarget, "provision" | "attach">>;

export function resolveExecutionTarget(
  opts: ResolveExecutionTargetOptions,
): ResolvedExecutionTarget {
  return new DockerComposeExecutionTarget(opts);
}

export { DockerComposeExecutionTarget, type DockerComposeTargetOptions };
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
