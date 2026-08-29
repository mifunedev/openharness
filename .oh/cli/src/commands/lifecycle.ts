import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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
import { renderComposeEnv } from "../lib/config-render.js";
import { getOhConfigValue, ohConfigPath, readOhConfig } from "../lib/oh-config.js";
import { resolveProjectRoot } from "../lib/project.js";
import { setEnvValue } from "../lib/env-file.js";
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

export const COMPOSE_ENV_DIR_PREFIX = "oh-compose-env-";

function composeEnvDir(): string {
  return mkdtempSync(join(tmpdir(), COMPOSE_ENV_DIR_PREFIX));
}

function writeComposeEnv(root: string, dir: string): string {
  const file = join(dir, "compose.env");
  writeFileSync(file, renderComposeEnv(readOhConfig(ohConfigPath(root))), {
    mode: 0o600,
    encoding: "utf8",
  });
  return file;
}

export function withComposeEnvFile<T>(root: string, fn: (extraArgs: string[]) => T): T {
  if (!existsSync(ohConfigPath(root))) return fn([]);
  const dir = composeEnvDir();
  try {
    return fn(["--extra-env-file", writeComposeEnv(root, dir)]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export async function withComposeEnvFileAsync<T>(
  root: string,
  fn: (extraArgs: string[]) => Promise<T>,
): Promise<T> {
  if (!existsSync(ohConfigPath(root))) return await fn([]);
  const dir = composeEnvDir();
  try {
    return await fn(["--extra-env-file", writeComposeEnv(root, dir)]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export interface SandboxOptions extends LifecycleOptions {
  /** `--image` was passed (run the prebuilt image; implies `--no-build`). */
  image?: boolean;
  /** Explicit ref from `--image=<ref>`; when set it wins over `oh.json`. */
  imageRef?: string;
  /** `--no-build` was passed (suppress the local build, reuse an existing image). */
  noBuild?: boolean;
  /** Print the docker compose argv instead of provisioning anything. */
  printArgv?: boolean;
}

export const DEFAULT_CONTAINER_NAME = "openharness";

export const DEFAULT_SANDBOX_IMAGE = "ghcr.io/mifunedev/openharness:latest";

function configuredField(root: string, path: string): unknown {
  const file = ohConfigPath(root);
  if (!existsSync(file)) return undefined;
  try {
    return getOhConfigValue(readOhConfig(file), path);
  } catch {
    return undefined;
  }
}

function configuredString(root: string, path: string): string | undefined {
  const value = configuredField(root, path);
  return typeof value === "string" && value !== "" ? value : undefined;
}

function fromProcessEnv(key: string): string | undefined {
  const value = process.env[key];
  return value !== undefined && value !== "" ? value : undefined;
}

function dockerSocketConfigured(root: string): boolean {
  return configuredField(root, "access.dockerSocket") !== undefined;
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

export function configuredImage(root: string): string | undefined {
  return fromProcessEnv("OH_SANDBOX_IMAGE") ?? configuredString(root, "image.ref");
}

export async function runSandbox(opts: SandboxOptions, io: LifecycleIO): Promise<number> {
  const run = opts.run ?? spawnRunner;
  const root = resolveProjectRoot(opts.cwd);

  // `--image` implies `--no-build` (skipping the build is the whole point);
  // `--no-build` on its own suppresses the build without pinning an image.
  const useImage = opts.image === true || opts.imageRef !== undefined;
  const useNoBuild = useImage || opts.noBuild === true;
  const imageRef = useImage
    ? (opts.imageRef ?? configuredImage(root) ?? DEFAULT_SANDBOX_IMAGE)
    : undefined;
  const env: NodeJS.ProcessEnv | undefined =
    imageRef === undefined ? undefined : { ...process.env, OH_SANDBOX_IMAGE: imageRef };

  if (opts.printArgv === true) {
    const script = requireLifecycleScript(root, "docker-compose.sh");
    return withComposeEnvFile(root, (extraArgs) => {
      const r = run(
        "bash",
        [
          script,
          "--repo-dir",
          root,
          ...extraArgs,
          "--print-argv",
          "up",
          "-d",
          useNoBuild ? "--no-build" : "--build",
        ],
        { stdio: "inherit", ...(env ? { env } : {}) },
      );
      assertSpawned(r, `bash ${script}`);
      return r.status ?? 1;
    });
  }

  if (runningInsideSandbox()) {
    io.stderr(`${new HostOnlyError("`oh sandbox`").message}\n`);
    return 1;
  }
  await maybePromptDockerSocket(root, io);
  requireLifecycleScript(root, "docker-compose.sh");

  if (imageRef !== undefined) {
    io.stdout(`image mode: ${imageRef} (skipping local build)\n`);
  } else if (useNoBuild) {
    io.stdout("no-build mode: reusing the existing image (skipping local build)\n");
  }

  try {
    await withComposeEnvFileAsync(root, async (extraArgs) => {
      const target = resolveExecutionTarget({
        projectRoot: root,
        run,
        build: !useNoBuild,
        ...(extraArgs.length > 0 ? { extraEnvFile: extraArgs[1] } : {}),
        ...(env ? { env } : {}),
      });
      await target.provision();
    });
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
  return fromProcessEnv("SANDBOX_NAME") ?? configuredString(root, "name");
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
  destroy: Object.freeze(["down", "-v"]),
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
  return withComposeEnvFile(root, (extraArgs) => {
    const r = run("bash", [script, ...extraArgs, ...COMPOSE_VERBS[verb], ...extra], {
      stdio: "inherit",
    });
    assertSpawned(r, `bash ${script} ${verb}`);
    return r.status ?? 1;
  });
}

export function runComposeConfig(opts: LifecycleOptions, extra: string[] = []): number {
  const run = opts.run ?? spawnRunner;
  const root = resolveProjectRoot(opts.cwd);
  const script = requireLifecycleScript(root, "docker-compose.sh");
  return withComposeEnvFile(root, (extraArgs) => {
    const r = run("bash", [script, ...extraArgs, "config", ...extra], { stdio: "inherit" });
    assertSpawned(r, `bash ${script} config`);
    return r.status ?? 1;
  });
}

export function namedVolumes(root: string): string[] {
  let text: string;
  try {
    text = readFileSync(join(root, ".devcontainer", "docker-compose.yml"), "utf8");
  } catch {
    return [];
  }
  const lines = text.split("\n");
  const start = lines.findIndex((line) => /^volumes:\s*$/.test(line));
  if (start === -1) return [];
  const names: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break;
    const match = /^ {2}([A-Za-z0-9][A-Za-z0-9_.-]*):\s*$/.exec(line);
    if (match) names.push(match[1]);
  }
  return names;
}

export interface DestroyOptions extends LifecycleOptions {
  yes?: boolean;
}

export function destroyConfirmationPhrase(root: string): string {
  return configuredContainerName(root) ?? DEFAULT_CONTAINER_NAME;
}

export async function runDestroy(opts: DestroyOptions, io: LifecycleIO): Promise<number> {
  const root = resolveProjectRoot(opts.cwd);
  const name = destroyConfirmationPhrase(root);

  if (opts.yes !== true) {
    const interactive = process.stdin.isTTY === true || io.ask !== undefined;
    if (!interactive) {
      io.stderr(
        `oh destroy: refusing to destroy \`${name}\` without a terminal — ` +
          "re-run with --yes to confirm non-interactively\n",
      );
      return 1;
    }

    const volumes = namedVolumes(root);
    io.stdout(`\n${prompt.bold(`oh destroy — ${name}`)}\n\n`);
    io.stdout("`docker compose down -v` removes the containers and deletes\n");
    io.stdout(
      volumes.length > 0
        ? `these named volumes with everything in them:\n\n  ${volumes.join("\n  ")}\n\n`
        : "every named volume this project owns, with everything in them.\n\n",
    );
    io.stdout(
      "That is the provider authentication those volumes hold — every agent CLI\n" +
        "login, the gh CLI token, and the SSH keys. Sign-in starts over.\n\n",
    );

    const askFn = io.ask ?? prompt.ask;
    const answer = (await askFn(`Type the sandbox name \`${name}\` to destroy it:`)).trim();
    if (answer !== name) {
      io.stderr("oh destroy: aborted — nothing was removed\n");
      return 1;
    }
  }

  return runComposeVerb("destroy", opts);
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
