
export type ExecutionStatus = "absent" | "starting" | "ready" | "stopped" | "failed";

export type ExecutionCapability =
  | "exec"
  | "pty"
  | "files"
  | "ports"
  | "docker"
  | "snapshot";

export type ExecRequest = {
  argv: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  stdio?: "inherit" | "capture";
  user?: string;
};

export type ExecResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export interface ExecutionTarget {
  readonly kind: string;
  readonly contractVersion: 1;
  readonly workspace: { hostRoot: string; targetRoot: string };

  provision?(): Promise<void>;

  status(): Promise<ExecutionStatus>;

  capabilities(): Promise<ReadonlySet<ExecutionCapability>>;

  exec(request: ExecRequest): Promise<ExecResult>;

  attach?(request: ExecRequest): number;

  destroy?(): Promise<void>;

  describe(): string;
}
