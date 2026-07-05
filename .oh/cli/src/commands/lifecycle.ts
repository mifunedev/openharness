import { spawnSync } from "node:child_process";
import { appendFileSync, copyFileSync, existsSync, readFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { resolveProjectRoot } from "../lib/project.js";
import * as prompt from "../lib/prompt.js";

/**
 * Lifecycle verbs for equipped repos (issue #564): `oh sandbox`, `oh shell`,
 * `oh gateway`.
 *
 * These are deliberately THIN wrappers over the vendored `.oh/scripts/`
 * lifecycle scripts (the same ones the source repo's Makefile drives) — no
 * compose-argv building or harness.yaml parsing is re-implemented in
 * TypeScript. All subprocess invocations use argv-array form (never a shell
 * string, mirroring lib/tmux.ts) behind an injectable runner (DI seam in the
 * style of lib/remote.ts's RemoteRunner) so unit tests never spawn real
 * docker/bash. Thrown errors carry no `oh:` prefix — cli.ts's main() adds it
 * and maps throws to exit code 2.
 */

/** Output channels (mirrors InitIO) — injectable so tests capture the log/hints. */
export interface LifecycleIO {
  stdout: (s: string) => void;
  stderr: (s: string) => void;
  /**
   * Reader for the one interactive prompt (`oh sandbox`'s Docker-socket
   * opt-in). Defaults to `prompt.ask` (real stdin). Injecting it also FORCES
   * the prompt on in tests regardless of isTTY — mirrors init.ts's `io.ask`
   * gate. Production cli.ts never injects it → pure isTTY gate.
   */
  ask?: (q: string) => Promise<string>;
}

/**
 * Outcome of one subprocess run — the shape a fake runner returns in tests.
 * Mirrors the useful subset of `spawnSync`'s return value; fakes branch on
 * `error.code` ("ENOENT") vs a non-zero `status`, never a real subprocess.
 */
export interface RunResult {
  /** Exit status; null when the process never ran. */
  status: number | null;
  /** Spawn-level failure, e.g. `code: "ENOENT"` (binary not on PATH). */
  error?: { code?: string; message?: string };
  /** Captured stdout — only populated by `stdio: "capture"` runs. */
  stdout?: string;
}

/** Injectable subprocess runner (DI seam in the style of `RemoteRunner`). */
export type LifecycleRunner = (
  cmd: string,
  args: string[],
  opts: { stdio: "inherit" | "capture"; env?: NodeJS.ProcessEnv },
) => RunResult;

/**
 * Real runner. `"inherit"` hands the terminal to the child (live docker build
 * output, interactive shells); `"capture"` collects stdout for config lookups.
 */
const spawnRunner: LifecycleRunner = (cmd, args, opts) => {
  const r =
    opts.stdio === "capture"
      ? spawnSync(cmd, args, { env: opts.env, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" })
      : spawnSync(cmd, args, { env: opts.env, stdio: "inherit" });
  const err = r.error as (Error & { code?: string }) | undefined;
  return {
    status: r.status,
    error: err ? { code: err.code, message: err.message } : undefined,
    stdout: typeof r.stdout === "string" ? r.stdout : undefined,
  };
};

/** Options shared by every lifecycle verb. */
export interface LifecycleOptions {
  /** Where the equipped-project-root walk starts (default: process.cwd()). */
  cwd?: string;
  /** Subprocess runner. Default: real `spawnSync`. Tests inject a fake. */
  run?: LifecycleRunner;
}

export interface ShellOptions extends LifecycleOptions {
  /** Positional container-name argument — highest precedence when set. */
  container?: string;
}

/** `oh sandbox` options — the prebuilt-image / no-build knobs on top of the base. */
export interface SandboxOptions extends LifecycleOptions {
  /** `--image` was passed (run the prebuilt image; implies `--no-build`). */
  image?: boolean;
  /** Explicit ref from `--image=<ref>`; when set it wins over harness.yaml. */
  imageRef?: string;
  /** `--no-build` was passed (suppress the local build, reuse an existing image). */
  noBuild?: boolean;
}

/** The fallback container name (parity with the Makefile's SANDBOX_NAME). */
export const DEFAULT_CONTAINER_NAME = "openharness";

/**
 * The image `oh sandbox --image` (bare, no ref) resolves to when harness.yaml
 * carries no `sandbox.image`. `latest` is safe because the bind-mounted repo
 * shadows the image's baked `.oh/` — the image supplies only the toolchain, so
 * its version is a toolchain concern, not a correctness one. Override precedence
 * (last wins): this default -> harness.yaml `sandbox.image` -> `--image=<ref>`.
 */
export const DEFAULT_SANDBOX_IMAGE = "ghcr.io/mifunedev/openharness:latest";

/**
 * Path-escape guard for the one writer in this module (the harness.yaml seed):
 * the resolved dest MUST be inside the project root. Mirrors init.ts's
 * `assertInTarget` invariant.
 */
function assertInRoot(dest: string, root: string): void {
  if (!(dest === root || dest.startsWith(root + sep))) {
    throw new Error(`refusing to write outside the project root: ${dest}`);
  }
}

/** A vendored lifecycle script the verb is about to delegate to must exist. */
function requireScript(root: string, rel: string): string {
  const script = join(root, ".oh", "scripts", rel);
  if (!existsSync(script)) {
    throw new Error(
      `missing lifecycle script ${script} — the vendored .oh/ payload looks incomplete; run \`oh update\` to re-vendor it`,
    );
  }
  return script;
}

/** Throw when the child never ran at all (spawn-level failure, not a bad exit). */
function assertSpawned(r: RunResult, what: string): void {
  if (r.error) {
    throw new Error(`failed to run ${what}${r.error.message ? ` (${r.error.message})` : ""}`);
  }
}

/**
 * Defensive config seed (FR-11's one writer): copy `harness.yaml.example` →
 * `harness.yaml` when the example exists and the target is missing — parity
 * with `make harness-config` for source-repo-style checkouts. `oh init`-equipped
 * repos already have harness.yaml, so this is a no-op there. Reports exactly
 * one operation-log line when (and only when) it writes.
 */
function seedHarnessYaml(root: string, io: LifecycleIO): void {
  const dest = resolve(root, "harness.yaml");
  const example = resolve(root, "harness.yaml.example");
  assertInRoot(dest, root);
  if (existsSync(dest) || !existsSync(example)) return;
  copyFileSync(example, dest);
  io.stdout("create harness.yaml (from harness.yaml.example)\n");
}

/**
 * Whether the DOCKER_SOCKET toggle already has an explicit value — set either
 * in `<root>/harness.yaml` (`sandbox.docker_socket`, the source of truth
 * docker-compose.sh reads first) or `.devcontainer/.env` (a `DOCKER_SOCKET=`
 * line). When configured, `oh sandbox` respects the standing choice and does
 * NOT re-prompt.
 */
function dockerSocketConfigured(root: string, run: LifecycleRunner): boolean {
  const script = join(root, ".oh", "scripts", "harness-config.sh");
  const harnessYaml = join(root, "harness.yaml");
  if (existsSync(script) && existsSync(harnessYaml)) {
    const r = run("sh", [script, "get", "sandbox.docker_socket", harnessYaml], { stdio: "capture" });
    if (!r.error && r.status === 0 && (r.stdout ?? "").trim() !== "") return true;
  }
  const envFile = join(root, ".devcontainer", ".env");
  if (existsSync(envFile)) {
    try {
      if (/^\s*DOCKER_SOCKET=/m.test(readFileSync(envFile, "utf8"))) return true;
    } catch {
      /* unreadable .env → treat as unconfigured */
    }
  }
  return false;
}

/**
 * The Docker-socket opt-in for `oh sandbox` (the get-oh.sh / CLI provisioning
 * path). Mounting /var/run/docker.sock is effectively HOST ROOT, so it is OFF
 * by default: we only prompt on a TTY (or when a test injects `io.ask`) and
 * only when no standing choice exists. The answer is persisted to
 * `.devcontainer/.env` (`DOCKER_SOCKET=true|false`) so the choice sticks and
 * docker-compose.sh applies the docker-compose.docker-sock.yml overlay when true.
 */
async function maybePromptDockerSocket(root: string, io: LifecycleIO, run: LifecycleRunner): Promise<void> {
  if (dockerSocketConfigured(root, run)) return;
  const interactive = process.stdin.isTTY === true || io.ask !== undefined;
  if (!interactive) return; // non-TTY → leave it OFF, don't persist
  const envDir = join(root, ".devcontainer");
  if (!existsSync(envDir)) return; // nowhere durable to record the choice
  const askFn = io.ask ?? prompt.ask;
  const answer = (
    await askFn(
      "Mount host Docker socket into the sandbox? (effectively host root — enable only if the agent must drive Docker) [y/N]",
    )
  )
    .trim()
    .toLowerCase();
  const enabled = answer === "y" || answer === "yes";
  const envFile = join(envDir, ".env");
  assertInRoot(envFile, root);
  appendFileSync(envFile, `DOCKER_SOCKET=${enabled ? "true" : "false"}\n`);
  io.stdout(
    enabled
      ? "DOCKER_SOCKET=true — host Docker socket will be mounted\n"
      : "DOCKER_SOCKET=false — host Docker socket stays unmounted\n",
  );
}

/**
 * `sandbox.image` from `<root>/harness.yaml` via the vendored parser, or
 * undefined when unconfigured — the middle layer of the `--image` ref
 * resolution (below the `--image=<ref>` flag, above DEFAULT_SANDBOX_IMAGE). Same
 * mandatory-explicit-path contract as `configuredContainerName`.
 */
function configuredImage(root: string, run: LifecycleRunner): string | undefined {
  const script = join(root, ".oh", "scripts", "harness-config.sh");
  const harnessYaml = join(root, "harness.yaml");
  if (!existsSync(script) || !existsSync(harnessYaml)) return undefined;
  const r = run("sh", [script, "get", "sandbox.image", harnessYaml], { stdio: "capture" });
  if (r.error || r.status !== 0) return undefined;
  const name = (r.stdout ?? "").trim();
  return name === "" ? undefined : name;
}

/**
 * `oh sandbox` — provision and start the sandbox: seed harness.yaml if needed,
 * prompt once for the (default-off) Docker-socket opt-in, then delegate to the
 * vendored compose wrapper (which owns ALL compose-argv building):
 * `bash .oh/scripts/docker-compose.sh --repo-dir <root> up -d --build`.
 *
 * Prebuilt-image mode (`--image[=<ref>]` / `--no-build`) swaps the trailing
 * `--build` for `--no-build` so no local image is built, and — when an image is
 * requested — threads the resolved ref through `OH_SANDBOX_IMAGE` in the child
 * env (the compose file interpolates it at `image:`). The ref resolves last-wins:
 * `--image=<ref>` > harness.yaml `sandbox.image` > DEFAULT_SANDBOX_IMAGE. The
 * ref itself still travels via the env into the wrapper — this stays a thin
 * pass-through, no compose-argv building in TS.
 *
 * Runs with inherited stdio (live build/pull output) and returns the child's exit code.
 */
export async function runSandbox(opts: SandboxOptions, io: LifecycleIO): Promise<number> {
  const run = opts.run ?? spawnRunner;
  const root = resolveProjectRoot(opts.cwd);
  seedHarnessYaml(root, io);
  await maybePromptDockerSocket(root, io, run);
  const script = requireScript(root, "docker-compose.sh");

  // `--image` implies `--no-build` (skipping the build is the whole point);
  // `--no-build` on its own suppresses the build without pinning an image.
  const useImage = opts.image === true || opts.imageRef !== undefined;
  const useNoBuild = useImage || opts.noBuild === true;
  const buildFlag = useNoBuild ? "--no-build" : "--build";

  let env: NodeJS.ProcessEnv | undefined;
  if (useImage) {
    const ref = opts.imageRef ?? configuredImage(root, run) ?? DEFAULT_SANDBOX_IMAGE;
    env = { ...process.env, OH_SANDBOX_IMAGE: ref };
    io.stdout(`image mode: ${ref} (skipping local build)\n`);
  } else if (useNoBuild) {
    io.stdout("no-build mode: reusing the existing image (skipping local build)\n");
  }

  const r = run("bash", [script, "--repo-dir", root, "up", "-d", buildFlag], {
    stdio: "inherit",
    ...(env ? { env } : {}),
  });
  assertSpawned(r, `bash ${script}`);
  return r.status ?? 1;
}

/**
 * `sandbox.name` from `<root>/harness.yaml` via the vendored parser, or
 * undefined when unconfigured. The harness.yaml path argument is MANDATORY and
 * explicit: `harness-config.sh get` defaults to a cwd-relative `harness.yaml`
 * and silently exits 0 with no output when that file is absent
 * (harness-config.sh:36,57) — from a nested cwd the name would wrongly
 * collapse to the default. This is the one captured-stdout lookup; the verbs
 * themselves run with inherited stdio.
 */
function configuredContainerName(root: string, run: LifecycleRunner): string | undefined {
  const script = join(root, ".oh", "scripts", "harness-config.sh");
  const harnessYaml = join(root, "harness.yaml");
  if (!existsSync(script) || !existsSync(harnessYaml)) return undefined;
  const r = run("sh", [script, "get", "sandbox.name", harnessYaml], { stdio: "capture" });
  if (r.error || r.status !== 0) return undefined;
  const name = (r.stdout ?? "").trim();
  return name === "" ? undefined : name;
}

/**
 * `oh shell [container]` — open zsh in the running sandbox container:
 * `docker exec -it -u sandbox <name> zsh` with inherited stdio. Container-name
 * precedence: positional arg > `sandbox.name` in `<root>/harness.yaml` >
 * "openharness". On a non-zero docker exit, prints an actionable hint AFTER
 * docker's own (inherited) error output, then propagates the exit code.
 */
export function runShell(opts: ShellOptions, io: LifecycleIO): number {
  const run = opts.run ?? spawnRunner;
  const root = resolveProjectRoot(opts.cwd);
  const name = opts.container ?? configuredContainerName(root, run) ?? DEFAULT_CONTAINER_NAME;
  const r = run("docker", ["exec", "-it", "-u", "sandbox", name, "zsh"], { stdio: "inherit" });
  if (r.error?.code === "ENOENT") {
    throw new Error("docker is required for `oh shell` but was not found on PATH");
  }
  assertSpawned(r, `docker exec ${name}`);
  const code = r.status ?? 1;
  if (code !== 0) {
    io.stderr(`container \`${name}\` not running? start it with \`oh sandbox\`\n`);
  }
  return code;
}

/**
 * `oh gateway <args…>` — pass every argument through VERBATIM to the vendored
 * `bash .oh/scripts/gateway.sh <args…>` with `OH_PROJECT_ROOT` set to the
 * resolved project root (gateway.sh:29 reads it) and inherited stdio; returns
 * the child's exit code. A leading `--help`/`-h` is intercepted in cli.ts
 * BEFORE this runs — nothing else is interpreted here.
 */
export function runGateway(args: string[], opts: LifecycleOptions): number {
  const run = opts.run ?? spawnRunner;
  const root = resolveProjectRoot(opts.cwd);
  const script = requireScript(root, "gateway.sh");
  const r = run("bash", [script, ...args], {
    stdio: "inherit",
    env: { ...process.env, OH_PROJECT_ROOT: root },
  });
  assertSpawned(r, `bash ${script}`);
  return r.status ?? 1;
}
