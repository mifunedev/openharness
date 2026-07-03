import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { resolveProjectRoot } from "../lib/project.js";

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

/** The fallback container name (parity with the Makefile's SANDBOX_NAME). */
export const DEFAULT_CONTAINER_NAME = "openharness";

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
 * `oh sandbox` — provision and start the sandbox: seed harness.yaml if needed,
 * then delegate to the vendored compose wrapper (which owns ALL compose-argv
 * building): `bash .oh/scripts/docker-compose.sh --repo-dir <root> up -d --build`.
 * Runs with inherited stdio (live build output) and returns the child's exit code.
 */
export function runSandbox(opts: LifecycleOptions, io: LifecycleIO): number {
  const run = opts.run ?? spawnRunner;
  const root = resolveProjectRoot(opts.cwd);
  seedHarnessYaml(root, io);
  const script = requireScript(root, "docker-compose.sh");
  const r = run("bash", [script, "--repo-dir", root, "up", "-d", "--build"], {
    stdio: "inherit",
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
