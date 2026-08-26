import {
  DockerComposeExecutionTarget,
  type DockerComposeTargetOptions,
} from "./docker-compose-target.js";
import type { ExecutionTarget } from "./target.js";

/**
 * The execution-target entry point (EPIC #731, issue #733).
 *
 * `resolveExecutionTarget()` is INTERNAL: it is the CLI's own seam, not a user
 * surface. There is deliberately no `.env` key, CLI flag, or env var that
 * selects a target — Docker Compose is the only implementation in Phase-0, and
 * a selector would be configuration for a choice that does not exist yet. The
 * next substrate arrives by adding an implementation here, not by asking the
 * operator to pick one.
 */

/** Options for the resolved target (currently the compose target's options). */
export type ResolveExecutionTargetOptions = DockerComposeTargetOptions;

/**
 * An `ExecutionTarget` whose optional `provision()`/`attach()` members are
 * known to be present. Callers get the interface's guarantees without an
 * `attach?.()` optional-call dance, and still never name a concrete class.
 */
export type ResolvedExecutionTarget = ExecutionTarget &
  Required<Pick<ExecutionTarget, "provision" | "attach">>;

/** The execution target for this harness. Always the Docker Compose target. */
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
