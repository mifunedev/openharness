import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ExecutionExitError,
  ExecutionSpawnError,
  HostOnlyError,
  resolveExecutionTarget,
  runningInsideSandbox,
} from "../lib/execution/index.js";
import {
  assertSpawned,
  requireLifecycleScript,
  spawnRunner,
  type LifecycleRunner,
  type RunResult,
} from "../lib/execution/runner.js";
import { resolveProjectRoot } from "../lib/project.js";
import {
  envFilePath,
  readEnvValue,
  seedEnvFile,
  setEnvValue,
} from "../lib/env-file.js";
import * as prompt from "../lib/prompt.js";


export interface LifecycleIO {
  stdout: (s: string) => void;
  stderr: (s: string) => void;
  ask?: (q: string) => Promise<string>;
}

export type { LifecycleRunner, RunResult };

export interface LifecycleOptions {
  cwd?: string;
  run?: LifecycleRunner;
}

export interface ShellOptions extends LifecycleOptions {
  container?: string;
}

export interface SandboxOptions extends LifecycleOptions {
  /** `--image` was passed (run the prebuilt image; implies `--no-build`). */
  image?: boolean;
  /** Explicit ref from `--image=<ref>`; when set it wins over `.env`. */
  imageRef?: string;
  /** `--no-build` was passed (suppress the local build, reuse an existing image). */
  noBuild?: boolean;
}

export const DEFAULT_CONTAINER_NAME = "openharness";

export const DEFAULT_SANDBOX_IMAGE = "ghcr.io/mifunedev/openharness:latest";

function seedConfig(root: string, io: LifecycleIO): void {
  if (seedEnvFile(root)) {
    io.stdout("create .devcontainer/.env (from .devcontainer/.example.env)\n");
  }
}

function dockerSocketConfigured(root: string): boolean {
  const envFile = envFilePath(root);
  if (!existsSync(envFile)) return false;
  try {
    return /^\s*DOCKER_SOCKET=/m.test(readFileSync(envFile, "utf8"));
  } catch {
    return false;
  }
}

async function maybePromptDockerSocket(root: string, io: LifecycleIO): Promise<void> {
  if (dockerSocketConfigured(root)) return;
  const interactive = process.stdin.isTTY === true || io.ask !== undefined;
  if (!interactive) return;
  const envDir = join(root, ".devcontainer");
  if (!existsSync(envDir)) return;
  const askFn = io.ask ?? prompt.ask;
  const answer = (
    await askFn(
      "Mount host Docker socket into the sandbox? (effectively host root — enable only if the agent must drive Docker) [y/N]",
    )
  )
    .trim()
    .toLowerCase();
  const enabled = answer === "y" || answer === "yes";
  setEnvValue(root, "DOCKER_SOCKET", enabled ? "true" : "false");
  io.stdout(
    enabled
      ? "DOCKER_SOCKET=true — host Docker socket will be mounted\n"
      : "DOCKER_SOCKET=false — host Docker socket stays unmounted\n",
  );
}

function configuredImage(root: string): string | undefined {
  return readEnvValue(root, "OH_SANDBOX_IMAGE");
}

export async function runSandbox(opts: SandboxOptions, io: LifecycleIO): Promise<number> {
  const run = opts.run ?? spawnRunner;
  const root = resolveProjectRoot(opts.cwd);
  if (runningInsideSandbox()) {
    io.stderr(`${new HostOnlyError("`oh sandbox`").message}\n`);
    return 1;
  }
  seedConfig(root, io);
  await maybePromptDockerSocket(root, io);
  requireLifecycleScript(root, "docker-compose.sh");

  // `--image` implies `--no-build` (skipping the build is the whole point);
  // `--no-build` on its own suppresses the build without pinning an image.
  const useImage = opts.image === true || opts.imageRef !== undefined;
  const useNoBuild = useImage || opts.noBuild === true;

  let env: NodeJS.ProcessEnv | undefined;
  if (useImage) {
    const ref = opts.imageRef ?? configuredImage(root) ?? DEFAULT_SANDBOX_IMAGE;
    env = { ...process.env, OH_SANDBOX_IMAGE: ref };
    io.stdout(`image mode: ${ref} (skipping local build)\n`);
  } else if (useNoBuild) {
    io.stdout("no-build mode: reusing the existing image (skipping local build)\n");
  }

  const target = resolveExecutionTarget({
    projectRoot: root,
    run,
    build: !useNoBuild,
    ...(env ? { env } : {}),
  });
  try {
    await target.provision();
    return 0;
  } catch (err) {
    if (err instanceof ExecutionExitError) return err.exitCode;
    if (err instanceof HostOnlyError) {
      io.stderr(`${err.message}\n`);
      return 1;
    }
    throw err;
  }
}

export function configuredContainerName(root: string): string | undefined {
  return readEnvValue(root, "SANDBOX_NAME");
}

export function runShell(opts: ShellOptions, io: LifecycleIO): number {
  const run = opts.run ?? spawnRunner;
  const root = resolveProjectRoot(opts.cwd);
  const name = opts.container ?? configuredContainerName(root) ?? DEFAULT_CONTAINER_NAME;
  const target = resolveExecutionTarget({ projectRoot: root, container: name, run });
  let code: number;
  try {
    code = target.attach({ argv: ["zsh"], user: "sandbox" });
  } catch (err) {
    if (err instanceof ExecutionSpawnError && err.code === "ENOENT") {
      throw new Error("docker is required for `oh shell` but was not found on PATH");
    }
    throw err;
  }
  if (code !== 0) {
    io.stderr(`container \`${name}\` not running? start it with \`oh sandbox\`\n`);
  }
  return code;
}

const COMPOSE_VERBS = Object.freeze({
  stop: Object.freeze(["stop"]),
  restart: Object.freeze(["restart"]),
  logs: Object.freeze(["logs", "-f"]),
  ps: Object.freeze(["ps"]),
});

export type ComposeVerb = keyof typeof COMPOSE_VERBS;

export function composeVerbs(): ComposeVerb[] {
  return Object.keys(COMPOSE_VERBS) as ComposeVerb[];
}

export function runComposeVerb(
  verb: ComposeVerb,
  opts: LifecycleOptions,
  extra: string[] = [],
): number {
  const run = opts.run ?? spawnRunner;
  const root = resolveProjectRoot(opts.cwd);
  const script = requireLifecycleScript(root, "docker-compose.sh");
  const r = run("bash", [script, ...COMPOSE_VERBS[verb], ...extra], {
    stdio: "inherit",
  });
  assertSpawned(r, `bash ${script} ${verb}`);
  return r.status ?? 1;
}

export function runGateway(args: string[], opts: LifecycleOptions): number {
  const run = opts.run ?? spawnRunner;
  const root = resolveProjectRoot(opts.cwd);
  const script = requireLifecycleScript(root, "gateway.sh");
  const r = run("bash", [script, ...args], {
    stdio: "inherit",
    env: { ...process.env, OH_PROJECT_ROOT: root },
  });
  assertSpawned(r, `bash ${script}`);
  return r.status ?? 1;
}
