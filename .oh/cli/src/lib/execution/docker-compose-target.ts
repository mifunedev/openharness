import {
  assertSpawned,
  ExecutionExitError,
  requireLifecycleScript,
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


const DOCKER_SOCK_OVERLAY = "docker-compose.docker-sock.yml";

export interface DockerComposeTargetOptions {
  projectRoot: string;
  container?: string;
  run?: LifecycleRunner;
  build?: boolean;
  env?: NodeJS.ProcessEnv;
  extraEnvFile?: string;
}

export class DockerComposeExecutionTarget implements ExecutionTarget {
  readonly kind = "docker-compose";
  readonly contractVersion = 1;
  readonly workspace: { hostRoot: string; targetRoot: string };

  private readonly projectRoot: string;
  private readonly container?: string;
  private readonly run: LifecycleRunner;
  private readonly build: boolean;
  private readonly env?: NodeJS.ProcessEnv;
  private readonly extraEnvFile?: string;

  constructor(opts: DockerComposeTargetOptions) {
    this.projectRoot = opts.projectRoot;
    this.container = opts.container;
    this.run = opts.run ?? spawnRunner;
    this.build = opts.build ?? true;
    this.env = opts.env;
    this.extraEnvFile = opts.extraEnvFile;
    this.workspace = { hostRoot: opts.projectRoot, targetRoot: opts.projectRoot };
  }

  async provision(): Promise<void> {
    const script = this.composeScript();
    const argv = [
      script,
      "--repo-dir",
      this.projectRoot,
      ...this.extraEnvFileArgs(),
      "up",
      "-d",
      this.build ? "--build" : "--no-build",
    ];
    const r = this.run("bash", argv, { stdio: "inherit", ...(this.env ? { env: this.env } : {}) });
    assertSpawned(r, `bash ${script}`);
    const code = r.status ?? 1;
    if (code !== 0) {
      throw new ExecutionExitError(`bash ${script}`, code);
    }
  }

  async status(): Promise<ExecutionStatus> {
    const name = this.requireContainer();
    const r = this.run("docker", ["inspect", "-f", "{{.State.Status}}", name], { stdio: "capture" });
    assertSpawned(r, `docker inspect ${name}`);
    if (r.status !== 0) return "absent";
    switch ((r.stdout ?? "").trim()) {
      case "running":
        return "ready";
      case "created":
      case "restarting":
        return "starting";
      case "paused":
      case "removing":
      case "exited":
        return "stopped";
      default:
        return "failed";
    }
  }

  async capabilities(): Promise<ReadonlySet<ExecutionCapability>> {
    const caps = new Set<ExecutionCapability>(["exec", "pty"]);
    const script = this.composeScript();
    const r = this.run("bash", [script, "--repo-dir", this.projectRoot, ...this.extraEnvFileArgs(), "--print-argv", "config"], {
      stdio: "capture",
    });
    assertSpawned(r, `bash ${script}`);
    if (r.status === 0 && composeFileList(r.stdout ?? "").some((f) => f.endsWith(DOCKER_SOCK_OVERLAY))) {
      caps.add("docker");
    }
    return caps;
  }

  async exec(request: ExecRequest): Promise<ExecResult> {
    const name = this.requireContainer();
    const inherit = request.stdio === "inherit";
    const r = this.run("docker", this.execArgv(request, false), {
      stdio: inherit ? "inherit" : "capture",
      ...(request.timeoutMs !== undefined ? { timeoutMs: request.timeoutMs } : {}),
    });
    assertSpawned(r, `docker exec ${name}`);
    return {
      exitCode: r.status ?? 1,
      stdout: r.stdout ?? "",
      stderr: r.stderr ?? "",
    };
  }

  attach(request: ExecRequest): number {
    const name = this.requireContainer();
    const r = this.run("docker", this.execArgv(request, true), { stdio: "inherit" });
    assertSpawned(r, `docker exec ${name}`);
    return r.status ?? 1;
  }

  describe(): string {
    return `docker compose target at ${this.projectRoot}${this.container ? ` (container ${this.container})` : ""}`;
  }

  private execArgv(request: ExecRequest, interactive: boolean): string[] {
    const argv = ["exec"];
    if (interactive) argv.push("-it");
    if (request.user !== undefined) argv.push("-u", request.user);
    if (request.cwd !== undefined) argv.push("-w", request.cwd);
    for (const [k, v] of Object.entries(request.env ?? {})) argv.push("-e", `${k}=${v}`);
    argv.push(this.requireContainer(), ...request.argv);
    return argv;
  }

  private extraEnvFileArgs(): string[] {
    return this.extraEnvFile === undefined ? [] : ["--extra-env-file", this.extraEnvFile];
  }

  private composeScript(): string {
    return requireLifecycleScript(this.projectRoot, "docker-compose.sh");
  }

  private requireContainer(): string {
    if (this.container === undefined || this.container === "") {
      throw new Error("no container name was supplied to the execution target");
    }
    return this.container;
  }
}

function composeFileList(printed: string): string[] {
  const lines = printed.split("\n");
  const files: string[] = [];
  for (let i = 0; i + 1 < lines.length; i++) {
    if (lines[i].trim() === "-f") files.push(lines[i + 1].trim());
  }
  return files;
}
