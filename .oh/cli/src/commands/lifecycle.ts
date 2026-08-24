import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ExecutionExitError,
  ExecutionSpawnError,
  resolveExecutionTarget,
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
  assertInRoot,
  readConfigValue,
  seedHarnessYaml as seedHarnessYamlFile,
} from "../lib/harness-yaml.js";
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
 *
 * Since issue #733 the two HANDS-side verbs reach their environment through the
 * provider-neutral `ExecutionTarget` contract (`../lib/execution/`) instead of
 * naming a substrate themselves: `oh sandbox` calls `provision()`, `oh shell`
 * calls `attach()`. The brain-side decisions stay here — the harness.yaml seed,
 * the Docker-socket opt-in prompt, image-ref resolution, and container-name
 * precedence — so the contract is told what to run and never decides policy.
 * `.oh/docs/rfcs/rfc-brain-hands-boundary.md` is the authority for that split;
 * it is cited here, not restated.
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
 * The subprocess seam lives in `lib/execution/runner.ts` (issue #733) so the
 * lifecycle verbs and the execution targets share one runner. Re-exported here
 * for back-compat: `LifecycleRunner`/`RunResult` keep resolving from this
 * module's original import path.
 */
export type { LifecycleRunner, RunResult };

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
 * Defensive config seed (FR-11's one writer): copy `harness.yaml.example` →
 * `harness.yaml` when the example exists and the target is missing — parity
 * with `make harness-config` for source-repo-style checkouts. `oh init`-equipped
 * repos already have harness.yaml, so this is a no-op there. Reports exactly
 * one operation-log line when (and only when) it writes.
 *
 * The copy itself, and the `assertInRoot` path-escape invariant that guards it,
 * now live in `../lib/harness-yaml.ts` so `oh harness` shares them instead of
 * forking them. This wrapper keeps the IO side (the one log line) here.
 */
function seedHarnessYaml(root: string, io: LifecycleIO): void {
  if (seedHarnessYamlFile(root)) {
    io.stdout("create harness.yaml (from harness.yaml.example)\n");
  }
}

/**
 * Whether the DOCKER_SOCKET toggle already has an explicit value — set either
 * in `<root>/harness.yaml` (`sandbox.docker_socket`, the source of truth
 * docker-compose.sh reads first) or `.devcontainer/.env` (a `DOCKER_SOCKET=`
 * line). When configured, `oh sandbox` respects the standing choice and does
 * NOT re-prompt.
 */
function dockerSocketConfigured(root: string, run: LifecycleRunner): boolean {
  if (readConfigValue(root, "sandbox.docker_socket", run) !== undefined) return true;
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
  return readConfigValue(root, "sandbox.image", run);
}

/**
 * `oh sandbox` — provision and start the sandbox: seed harness.yaml if needed,
 * prompt once for the (default-off) Docker-socket opt-in, then hand ONE
 * provisioning call to the execution target (`provision()`), which delegates to
 * the vendored wrapper that owns ALL compose-argv building.
 *
 * Prebuilt-image mode (`--image[=<ref>]` / `--no-build`) suppresses the local
 * build and — when an image is requested — threads the resolved ref through
 * `OH_SANDBOX_IMAGE` in the child env (the compose file interpolates it at
 * `image:`). The ref resolves last-wins: `--image=<ref>` > harness.yaml
 * `sandbox.image` > DEFAULT_SANDBOX_IMAGE. Resolving it is a brain-side policy
 * decision and stays HERE; the ref travels to the target as child env, so this
 * remains a thin pass-through with no compose-argv building in TS.
 *
 * Runs with inherited stdio (live build/pull output) and returns the child's exit code.
 */
export async function runSandbox(opts: SandboxOptions, io: LifecycleIO): Promise<number> {
  const run = opts.run ?? spawnRunner;
  const root = resolveProjectRoot(opts.cwd);
  seedHarnessYaml(root, io);
  await maybePromptDockerSocket(root, io, run);
  // Preflight the vendored payload BEFORE the image-mode log line, so an
  // incomplete `.oh/` still fails with the same message in the same order as it
  // did before this verb routed through the target. `provision()` re-checks it
  // internally; the check is idempotent and spawns nothing.
  requireLifecycleScript(root, "docker-compose.sh");

  // `--image` implies `--no-build` (skipping the build is the whole point);
  // `--no-build` on its own suppresses the build without pinning an image.
  const useImage = opts.image === true || opts.imageRef !== undefined;
  const useNoBuild = useImage || opts.noBuild === true;

  let env: NodeJS.ProcessEnv | undefined;
  if (useImage) {
    const ref = opts.imageRef ?? configuredImage(root, run) ?? DEFAULT_SANDBOX_IMAGE;
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
    // `provision(): Promise<void>` has nowhere to return a child's exit status,
    // so the target throws it; propagating it here reproduces the previous
    // `return r.status ?? 1` exactly. Spawn-level failures still throw.
    if (err instanceof ExecutionExitError) return err.exitCode;
    throw err;
  }
}

/**
 * `sandbox.name` from `<root>/harness.yaml` via the vendored parser, or
 * undefined when unconfigured. The mandatory-explicit-path contract that makes
 * this correct from a nested cwd now lives on `readConfigValue` in
 * `../lib/harness-yaml.ts` — see its doc comment.
 *
 * Exported so `oh harness` resolves the container the same way `oh shell` does
 * rather than forking the precedence rule.
 */
export function configuredContainerName(
  root: string,
  run: LifecycleRunner,
): string | undefined {
  return readConfigValue(root, "sandbox.name", run);
}

/**
 * `oh shell [container]` — open an interactive `zsh` as the `sandbox` user in
 * the already-running environment by handing the terminal to the execution
 * target's `attach()`. The target owns the substrate argv; this verb names no
 * engine. Container-name precedence stays a brain-side decision made HERE:
 * positional arg > `sandbox.name` in `<root>/harness.yaml` > "openharness".
 *
 * Stays SYNCHRONOUS: `attach()` is `(request) => number` in `contractVersion: 1`
 * (see `../lib/execution/target.ts` and `rfc-brain-hands-boundary.md` § 6), so
 * this signature is unchanged. On a non-zero exit it prints an actionable hint
 * AFTER the child's own (inherited) error output, then propagates the code. A
 * missing engine binary surfaces as a spawn-level `ENOENT`, re-thrown here with
 * the same operator-facing message as before.
 */
export function runShell(opts: ShellOptions, io: LifecycleIO): number {
  const run = opts.run ?? spawnRunner;
  const root = resolveProjectRoot(opts.cwd);
  const name = opts.container ?? configuredContainerName(root, run) ?? DEFAULT_CONTAINER_NAME;
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

/**
 * `oh gateway <args…>` — pass every argument through VERBATIM to the vendored
 * `bash .oh/scripts/gateway.sh <args…>` with `OH_PROJECT_ROOT` set to the
 * resolved project root (gateway.sh:29 reads it) and inherited stdio; returns
 * the child's exit code. A leading `--help`/`-h` is intercepted in cli.ts
 * BEFORE this runs — nothing else is interpreted here.
 *
 * DELIBERATELY NOT routed through an `ExecutionTarget` (issue #733): the gateway
 * is BRAIN-side — orchestration and policy that runs on the host beside the
 * agent, not work executed inside a provisioned environment. Routing it through
 * the execution contract would put a brain responsibility on the hands side of
 * the boundary. See `.oh/docs/rfcs/rfc-brain-hands-boundary.md`.
 */
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
