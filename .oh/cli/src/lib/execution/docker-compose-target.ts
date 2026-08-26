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

/**
 * The Docker Compose execution target — the first `ExecutionTarget`
 * implementation (EPIC #731, issue #733).
 *
 * It WRAPS the proven lifecycle machinery instead of reimplementing it: every
 * compose operation delegates to `.oh/scripts/docker-compose.sh`, which stays
 * the single source of truth for env-file wiring, compose overrides,
 * the docker-socket opt-in, the SSH overlay and its port-collision preflight,
 * the Hermes overlay, sandbox naming, and project-root behavior. No compose
 * `-f <overlay>` argv is assembled here, so today's behavior is preserved by
 * construction rather than by luck.
 *
 * Brain-side decisions stay brain-side: the `.env` seed, the interactive
 * Docker-socket opt-in prompt, sandbox image resolution, and container-name
 * precedence all remain in `../../commands/lifecycle.ts`. This adapter is told
 * what to run; it does not decide policy.
 *
 * FAILURE SEMANTICS (the callers depend on these, so they are contract, not
 * detail):
 *   - a child that never ran         → throws `ExecutionSpawnError` (all ops)
 *   - `attach()` / `exec()` non-zero → returned as the exit code, never thrown
 *   - `provision()` non-zero         → throws `ExecutionExitError` carrying the
 *     exit code, because `provision(): Promise<void>` has nowhere to return it.
 *     A CLI verb that propagates the child's status catches it and returns
 *     `err.exitCode`, which is exactly today's `return r.status ?? 1`.
 */

/** The overlay file the script appends when the socket opt-in is truthy. */
const DOCKER_SOCK_OVERLAY = "docker-compose.docker-sock.yml";

export interface DockerComposeTargetOptions {
  /** Equipped-project root — `--repo-dir` for the script, and the workspace root. */
  projectRoot: string;
  /**
   * Container name for `attach()`, `exec()`, and `status()`. Resolution
   * (positional arg > `.env` `SANDBOX_NAME` > the default) is a
   * brain-side decision and stays with the caller; this adapter never guesses.
   */
  container?: string;
  /** Subprocess runner. Default: the real `spawnRunner`. Tests inject a fake. */
  run?: LifecycleRunner;
  /** `false` → `provision()` passes `--no-build`. Default: `true` (`--build`). */
  build?: boolean;
  /**
   * Host-side child env for compose runs (e.g. `OH_SANDBOX_IMAGE`, which the
   * compose file interpolates). Distinct from `ExecRequest.env`, which sets
   * variables INSIDE the target.
   */
  env?: NodeJS.ProcessEnv;
}

export class DockerComposeExecutionTarget implements ExecutionTarget {
  readonly kind = "docker-compose";
  readonly contractVersion = 1;
  /**
   * Phase-0 supports the identical mapping only (`hostRoot === targetRoot`):
   * nothing above this seam translates paths, so one resolved project root
   * serves both file reads and delegation. See
   * `.oh/docs/rfcs/rfc-brain-hands-boundary.md` § 5 / § 5.1 — that RFC is the
   * authority for the stance and it is cited here, not restated.
   */
  readonly workspace: { hostRoot: string; targetRoot: string };

  private readonly projectRoot: string;
  private readonly container?: string;
  private readonly run: LifecycleRunner;
  private readonly build: boolean;
  private readonly env?: NodeJS.ProcessEnv;

  constructor(opts: DockerComposeTargetOptions) {
    this.projectRoot = opts.projectRoot;
    this.container = opts.container;
    this.run = opts.run ?? spawnRunner;
    this.build = opts.build ?? true;
    this.env = opts.env;
    this.workspace = { hostRoot: opts.projectRoot, targetRoot: opts.projectRoot };
  }

  /**
   * Bring the environment up: `bash <script> --repo-dir <root> up -d
   * --build|--no-build` with inherited stdio (live build/pull output). Exactly
   * one child process — the script owns everything else.
   */
  async provision(): Promise<void> {
    const script = this.composeScript();
    const argv = [script, "--repo-dir", this.projectRoot, "up", "-d", this.build ? "--build" : "--no-build"];
    const r = this.run("bash", argv, { stdio: "inherit", ...(this.env ? { env: this.env } : {}) });
    assertSpawned(r, `bash ${script}`);
    const code = r.status ?? 1;
    if (code !== 0) {
      throw new ExecutionExitError(`bash ${script}`, code);
    }
  }

  /**
   * Lifecycle state, read from the container itself. `docker inspect` exits
   * non-zero when no such container exists — that is the `"absent"` case, not
   * an error.
   */
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
        // "dead", and anything a future engine reports that we do not model.
        return "failed";
    }
  }

  /**
   * Capabilities, discovered at runtime rather than assumed.
   *
   * `"exec"` and `"pty"` are unconditional — this target always runs argv and
   * always hands over a terminal. `"docker"` is conditional on the host-socket
   * opt-in, whose truthiness logic lives entirely in the script. Rather than
   * reimplement it, this asks the script's own non-executing oracle:
   * `--print-argv` emits the compose argv it WOULD run, one entry per line, and
   * the socket overlay is present in the `-f` list exactly when the opt-in is
   * on. No `truthy()` port, no env-file parsing, no `DOCKER_SOCKET` read.
   *
   * `"files"` and `"ports"` are deliberately NOT advertised: this contract
   * declares no method for moving files or forwarding ports, so claiming them
   * would be a capability a caller cannot use.
   */
  async capabilities(): Promise<ReadonlySet<ExecutionCapability>> {
    const caps = new Set<ExecutionCapability>(["exec", "pty"]);
    const script = this.composeScript();
    const r = this.run("bash", [script, "--repo-dir", this.projectRoot, "--print-argv", "config"], {
      stdio: "capture",
    });
    assertSpawned(r, `bash ${script}`);
    if (r.status === 0 && composeFileList(r.stdout ?? "").some((f) => f.endsWith(DOCKER_SOCK_OVERLAY))) {
      caps.add("docker");
    }
    return caps;
  }

  /**
   * Run one argv to completion inside the environment. Defaults to
   * `stdio: "capture"` — the caller asked for a result, not a terminal.
   *
   * A non-zero exit is data, not an exception: it comes back as `exitCode`.
   * `stdout`/`stderr` carry the REAL captured streams; they are `""` only for
   * `stdio: "inherit"` runs, where both streams went straight to the terminal
   * and were never captured.
   */
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

  /**
   * Hand the terminal to an interactive child and return its exit code.
   * Synchronous in `contractVersion: 1` — see `target.ts`'s header and
   * `rfc-brain-hands-boundary.md` § 6. Always inherits stdio (that is what
   * attaching means), so `request.stdio` is not consulted.
   */
  attach(request: ExecRequest): number {
    const name = this.requireContainer();
    const r = this.run("docker", this.execArgv(request, true), { stdio: "inherit" });
    assertSpawned(r, `docker exec ${name}`);
    return r.status ?? 1;
  }

  describe(): string {
    return `docker compose target at ${this.projectRoot}${this.container ? ` (container ${this.container})` : ""}`;
  }

  /** `docker exec [-it] [-u user] [-w cwd] [-e K=V …] <container> <argv…>`. */
  private execArgv(request: ExecRequest, interactive: boolean): string[] {
    const argv = ["exec"];
    if (interactive) argv.push("-it");
    if (request.user !== undefined) argv.push("-u", request.user);
    if (request.cwd !== undefined) argv.push("-w", request.cwd);
    for (const [k, v] of Object.entries(request.env ?? {})) argv.push("-e", `${k}=${v}`);
    argv.push(this.requireContainer(), ...request.argv);
    return argv;
  }

  /** The vendored compose wrapper every compose operation delegates to. */
  private composeScript(): string {
    return requireLifecycleScript(this.projectRoot, "docker-compose.sh");
  }

  /** Operations that address the running environment need its name. */
  private requireContainer(): string {
    if (this.container === undefined || this.container === "") {
      throw new Error("no container name was supplied to the execution target");
    }
    return this.container;
  }
}

/**
 * The `-f <file>` pairs out of a `--print-argv` dump (one argv entry per line).
 * Reads the value that FOLLOWS each `-f`, so a filename can never be mistaken
 * for a flag or vice versa.
 */
function composeFileList(printed: string): string[] {
  const lines = printed.split("\n");
  const files: string[] = [];
  for (let i = 0; i + 1 < lines.length; i++) {
    if (lines[i].trim() === "-f") files.push(lines[i + 1].trim());
  }
  return files;
}
