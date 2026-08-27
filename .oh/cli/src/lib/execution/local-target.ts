import { userInfo } from "node:os";
import {
  assertSpawned,
  spawnRunner,
  type LifecycleRunner,
} from "./runner.js";
import type {
  ExecRequest,
  ExecResult,
  ExecutionCapability,
  ExecutionStatus,
  ExecutionTarget,
} from "./target.js";


export class HostOnlyError extends Error {
  constructor(what: string) {
    super(
      `${what} manages the sandbox container from the host — you are already inside the sandbox. Run it on the host, at the project root.`,
    );
    this.name = "HostOnlyError";
  }
}

export interface LocalIdentity {
  name: string;
  uid: number;
}

export interface LocalTargetOptions {
  projectRoot: string;
  run?: LifecycleRunner;
  env?: NodeJS.ProcessEnv;
  identity?: () => LocalIdentity;
}

export class LocalExecutionTarget implements ExecutionTarget {
  readonly kind = "local";
  readonly contractVersion = 1;
  readonly workspace: { hostRoot: string; targetRoot: string };

  private readonly projectRoot: string;
  private readonly run: LifecycleRunner;
  private readonly env?: NodeJS.ProcessEnv;
  private readonly identity: () => LocalIdentity;

  constructor(opts: LocalTargetOptions) {
    this.projectRoot = opts.projectRoot;
    this.run = opts.run ?? spawnRunner;
    this.env = opts.env;
    this.identity = opts.identity ?? defaultIdentity;
    this.workspace = { hostRoot: opts.projectRoot, targetRoot: opts.projectRoot };
  }

  async provision(): Promise<void> {
    throw new HostOnlyError("`oh sandbox`");
  }

  async destroy(): Promise<void> {
    throw new HostOnlyError("`oh destroy`");
  }

  async status(): Promise<ExecutionStatus> {
    return "ready";
  }

  async capabilities(): Promise<ReadonlySet<ExecutionCapability>> {
    return new Set<ExecutionCapability>(["exec", "pty", "files"]);
  }

  async exec(request: ExecRequest): Promise<ExecResult> {
    const inherit = request.stdio === "inherit";
    const [cmd, ...args] = this.argvFor(request, inherit);
    const r = this.run(cmd, args, {
      stdio: inherit ? "inherit" : "capture",
      env: this.childEnv(request),
      ...(request.cwd !== undefined ? { cwd: request.cwd } : {}),
      ...(request.timeoutMs !== undefined ? { timeoutMs: request.timeoutMs } : {}),
    });
    if (r.error?.code === "ENOENT") {
      return { exitCode: 127, stdout: "", stderr: `${cmd}: command not found\n` };
    }
    assertSpawned(r, cmd);
    return {
      exitCode: r.status ?? 1,
      stdout: r.stdout ?? "",
      stderr: r.stderr ?? "",
    };
  }

  attach(request: ExecRequest): number {
    const [cmd, ...args] = this.argvFor(request, true);
    const r = this.run(cmd, args, {
      stdio: "inherit",
      env: this.childEnv(request),
      ...(request.cwd !== undefined ? { cwd: request.cwd } : {}),
    });
    assertSpawned(r, cmd);
    return r.status ?? 1;
  }

  describe(): string {
    return `local target inside the sandbox at ${this.projectRoot}`;
  }

  private argvFor(request: ExecRequest, interactive: boolean): string[] {
    const argv = [...request.argv];
    const user = request.user;
    if (user === undefined) return argv;

    const me = this.identity();
    if (user === me.name) return argv;
    if (user === "root" && me.uid === 0) return argv;
    if (user === "root") {
      return interactive ? ["sudo", "--", ...argv] : ["sudo", "-n", "--", ...argv];
    }
    if (me.uid === 0) return ["gosu", user, ...argv];

    throw new Error(
      `cannot run as user "${user}" from user "${me.name}" inside the sandbox`,
    );
  }

  private childEnv(request: ExecRequest): NodeJS.ProcessEnv {
    return { ...(this.env ?? process.env), ...(request.env ?? {}) };
  }
}

function defaultIdentity(): LocalIdentity {
  const info = userInfo();
  return { name: info.username, uid: info.uid };
}
