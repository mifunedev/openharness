/**
 * The provider-neutral execution contract (EPIC #731, issue #733).
 *
 * `ExecutionTarget` is the seam between the harness's brain (planning, memory,
 * scheduling) and its hands (whatever actually runs a process on its behalf).
 * Callers provision, inspect, and execute through this interface without
 * knowing which substrate is on the other side; capability discovery — not a
 * `kind` string check — is how a caller asks what an environment can do.
 *
 * Types and interface ONLY: no implementation, no runtime imports. The
 * boundary decisions this file encodes are recorded once, in
 * `.oh/docs/rfcs/rfc-brain-hands-boundary.md`. That RFC is the sole authority
 * for them and is cited here, never restated.
 *
 * THREE deliberate refinements to the sketch in issue #733:
 *
 * 1. `ExecRequest.argv: string[]`, not `command: string`. The codebase bans
 *    shell strings — every subprocess invocation is argv-array form. A
 *    `command: string` field would reintroduce shell-injection surface at the
 *    exact seam this file creates.
 *
 * 2. `ExecutionStatus` gains `"absent"`. The sketch's four states cannot
 *    express "this target has never been provisioned", which `status()` must
 *    be able to report before `provision()` has ever run.
 *
 * 3. `attach?()` is SYNCHRONOUS — `attach?(request: ExecRequest): number`, not
 *    `Promise<number>`. It wraps the existing synchronous process-runner seam
 *    (`../../commands/lifecycle.ts:49-53`, over `spawnSync` at `:59`) and is a
 *    blocking terminal handoff: it gives stdio to the child, blocks until the
 *    child exits, and returns its exit code. There is nothing to await. Every
 *    other method — `provision?()`, `status()`, `capabilities()`, `exec()`,
 *    `destroy?()` — is async; the asymmetry is deliberate.
 *
 *    MIGRATION PATH: this is a versioned decision, not a closed door. If a
 *    later substrate, or durable/remote sessions (#732), need a non-blocking
 *    attach, the contract bumps to `contractVersion: 2` with
 *    `attach(): Promise<number>` (or a sibling async method) and migrates its
 *    callers AND their assertions at that point, as a separately-reviewed
 *    change. Full rationale: `rfc-brain-hands-boundary.md` § 6.
 */

/**
 * Lifecycle state of an execution target, as reported by `status()`.
 *
 * `"absent"` is the pre-provision state — the target has never been created.
 * It is distinct from `"stopped"`, which means the target exists but is not
 * currently running.
 */
export type ExecutionStatus = "absent" | "starting" | "ready" | "stopped" | "failed";

/**
 * What an execution target can do. Callers branch on these, never on `kind`,
 * so a new substrate becomes usable without editing its callers.
 */
export type ExecutionCapability =
  /** Run one argv to completion inside the environment. */
  | "exec"
  /** Hand an interactive terminal to a child process. */
  | "pty"
  /** Move files in and out of the environment from the outside. */
  | "files"
  /** Publish or forward network ports out of the environment. */
  | "ports"
  /** A Docker daemon is reachable from inside the environment. */
  | "docker"
  /** Capture and restore environment state. Capability literal only — this contract declares no method for it. */
  | "snapshot";

/** One execution request. */
export type ExecRequest = {
  /** Program and arguments in argv-array form. Never a shell string. */
  argv: string[];
  /** Working directory inside the target. Omitted → the target's own default. */
  cwd?: string;
  /** Extra environment variables for the child process. */
  env?: Record<string, string>;
  /** Bounded wall-clock timeout in ms. Omitted → no timeout is imposed. */
  timeoutMs?: number;
  /**
   * `"inherit"` gives this process's stdio to the child (live output,
   * interactive sessions); `"capture"` collects stdout/stderr into the
   * `ExecResult`. Omitted → the implementation's documented default.
   */
  stdio?: "inherit" | "capture";
  /** User to run as inside the target. Omitted → the target's default user. */
  user?: string;
};

/** Outcome of one `exec()` call. */
export type ExecResult = {
  /** Child exit code. */
  exitCode: number;
  /**
   * Captured stdout. Empty for `stdio: "inherit"` runs — inherited output went
   * straight to the terminal and was never captured.
   */
  stdout: string;
  /** Captured stderr, under the same capture rule as `stdout`. Required. */
  stderr: string;
};

/**
 * A place the harness can run work. Implementations wrap a substrate; nothing
 * above this seam knows which one.
 */
export interface ExecutionTarget {
  /** Stable implementation identifier, e.g. for logs and `describe()`. */
  readonly kind: string;
  /** Contract version this implementation satisfies. */
  readonly contractVersion: 1;
  /**
   * The workspace mapping: where the project tree lives on the host, and the
   * path the same tree is reachable at inside the target. Phase-0 supports the
   * identical mapping (`hostRoot === targetRoot`) only, and the two-field shape
   * is explicitly speculative — see `rfc-brain-hands-boundary.md` § 5 / § 5.1.
   */
  readonly workspace: { hostRoot: string; targetRoot: string };

  /** Create/start the environment. Optional: some targets always exist. */
  provision?(): Promise<void>;

  /** Current lifecycle state. */
  status(): Promise<ExecutionStatus>;

  /** What this target can do, discovered at runtime. */
  capabilities(): Promise<ReadonlySet<ExecutionCapability>>;

  /** Run one argv to completion and report its outcome. */
  exec(request: ExecRequest): Promise<ExecResult>;

  /**
   * Give the terminal to an interactive child and return its exit code.
   * SYNCHRONOUS in `contractVersion: 1` — see refinement 3 in the file header.
   * Optional: only targets advertising `"pty"` implement it.
   */
  attach?(request: ExecRequest): number;

  /** Tear the environment down. Optional. */
  destroy?(): Promise<void>;

  /** One-line human-readable description, for logs and diagnostics. */
  describe(): string;
}
