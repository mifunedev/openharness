import { existsSync } from "node:fs";
import {
  ExecutionSpawnError,
  resolveExecutionTarget,
} from "../lib/execution/index.js";
import { spawnRunner, type LifecycleRunner } from "../lib/execution/runner.js";
import type { ExecutionTarget } from "../lib/execution/target.js";
import { resolveProjectRoot } from "../lib/project.js";
import {
  envFilePath,
  installEnvKey,
  isInstallFlagEnabled,
  seedEnvFile,
  setInstallFlag,
} from "../lib/env-file.js";
import {
  findHarness,
  harnessIds,
  HARNESS_CATALOG,
  type HarnessEntry,
} from "../lib/harnesses/catalog.js";
import { configuredContainerName, DEFAULT_CONTAINER_NAME } from "./lifecycle.js";

/**
 * `oh harness <list|install|status>` — install and inspect agent CLI harnesses.
 *
 * THE PROBLEM THIS SOLVES: adding an optional harness used to mean knowing that
 * `.devcontainer/.env` carries `INSTALL_*` keys, knowing the key is
 * `INSTALL_GROK_BUILD` while the doc slug is `grok-build`, uncommenting a line
 * by hand in a gitignored file, and then running
 * `make destroy && make sandbox` — a full image rebuild that throws the container
 * away for what is a one-package operation.
 *
 * THE INSTALL IS BOTH HALVES, deliberately (PRD decision D2):
 *
 *   1. persist `INSTALL_<KEY>=true` in `.devcontainer/.env` — cheap, always possible,
 *      and the reason the choice survives the next rebuild;
 *   2. install into the ALREADY-RUNNING container, so it is usable now.
 *
 * Live-only would be a trap: a container recreate silently loses the CLI.
 * Flag-only is exactly the rebuild pain being removed. `--persist-only` and
 * `--no-persist` are the escape hatches, and they conflict with each other.
 *
 * WHAT THIS COMMAND NEVER DOES: rebuild or restart the sandbox. A stopped or
 * absent container is the normal "not started yet" case, so it persists the flag,
 * prints the `oh sandbox` hint, and exits 0 rather than punishing the user for it.
 *
 * All container work goes through the `ExecutionTarget` contract — `status()` and
 * `exec()` — never a direct `docker exec` spawn, and never a `kind` check. See
 * `../lib/execution/target.ts` and `.oh/docs/rfcs/rfc-brain-hands-boundary.md`.
 */

/** Output channels — mirrors `LifecycleIO` so tests capture the log and hints. */
export interface HarnessIO {
  stdout: (s: string) => void;
  stderr: (s: string) => void;
}

/** Options shared by every `oh harness` verb. */
export interface HarnessOptions {
  /** Where the equipped-project-root walk starts (default: process.cwd()). */
  cwd?: string;
  /** Subprocess runner. Default: real `spawnSync`. Tests inject a fake. */
  run?: LifecycleRunner;
  /** Emit machine-readable JSON (list/status). */
  json?: boolean;
}

export interface HarnessInstallOptions extends HarnessOptions {
  /** Only set the `.devcontainer/.env` flag; do no container work. */
  persistOnly?: boolean;
  /** Live-install only; leave `.devcontainer/.env` untouched. */
  noPersist?: boolean;
}

/** Per-harness state as reported by `list` / `status`. */
interface HarnessState {
  id: string;
  title: string;
  kind: string;
  /** `INSTALL_<KEY>` reads `true` in `.devcontainer/.env`. `null` when it has no key. */
  enabled: boolean | null;
  /** Binary present in the container, or `null` when the container is unreachable. */
  installed: boolean | null;
  docs: string;
}

/** The container-unreachable states — the ones that skip live work entirely. */
function isReachable(status: string): boolean {
  return status === "ready" || status === "starting";
}

/**
 * Resolve the sandbox `ExecutionTarget`, reusing `oh shell`'s container-name
 * precedence (`.env` `SANDBOX_NAME` > the default) instead of forking it.
 */
function targetFor(root: string, run: LifecycleRunner): ExecutionTarget {
  const name = configuredContainerName(root) ?? DEFAULT_CONTAINER_NAME;
  return resolveExecutionTarget({ projectRoot: root, container: name, run });
}

/**
 * Is the harness's binary present inside the container? `verifyArgv` exiting 0
 * is the oracle. Captured stdio — this is a probe, not user-facing output.
 *
 * Returns `null` when the probe could not run at all (no docker binary), which
 * the callers render as "unknown" rather than "not installed" — claiming a
 * harness is missing because we could not look is worse than saying so.
 */
async function probeInstalled(
  target: ExecutionTarget,
  entry: HarnessEntry,
): Promise<boolean | null> {
  try {
    const r = await target.exec({
      argv: [...entry.verifyArgv],
      user: entry.installUser,
      stdio: "capture",
    });
    return r.exitCode === 0;
  } catch (err) {
    if (err instanceof ExecutionSpawnError) return null;
    throw err;
  }
}

/** Gather the state of every catalog entry (or one, when `only` is given). */
async function collectStates(
  root: string,
  run: LifecycleRunner,
  only?: HarnessEntry,
): Promise<HarnessState[]> {
  const entries = only ? [only] : [...HARNESS_CATALOG];
  const target = targetFor(root, run);

  let reachable = false;
  try {
    reachable = isReachable(await target.status());
  } catch (err) {
    if (!(err instanceof ExecutionSpawnError)) throw err;
  }

  const configured = existsSync(envFilePath(root));
  const states: HarnessState[] = [];
  for (const entry of entries) {
    states.push({
      id: entry.id,
      title: entry.title,
      kind: entry.kind,
      enabled:
        entry.harnessKey === undefined
          ? null
          : configured && isInstallFlagEnabled(root, entry.harnessKey),
      installed: reachable ? await probeInstalled(target, entry) : null,
      docs: entry.docsPath,
    });
  }
  return states;
}

/** Render one state cell: yes / no / n/a (no flag) / ? (container unreachable). */
function cell(value: boolean | null, absent: string): string {
  if (value === null) return absent;
  return value ? "yes" : "no";
}

function renderTable(states: HarnessState[], io: HarnessIO): void {
  const header = ["HARNESS", "KIND", "ENABLED", "INSTALLED"];
  const rows = states.map((s) => [
    s.id,
    s.kind,
    cell(s.enabled, "n/a"),
    cell(s.installed, "?"),
  ]);
  const widths = header.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => r[i].length)),
  );
  const line = (cols: string[]): string =>
    cols.map((c, i) => c.padEnd(widths[i])).join("  ").trimEnd() + "\n";
  io.stdout(line(header));
  for (const row of rows) io.stdout(line(row));
  if (states.some((s) => s.installed === null)) {
    io.stdout("\nINSTALLED is `?` — the sandbox is not running. Start it with `oh sandbox`.\n");
  }
}

/** `oh harness list` — every known harness and its state. */
export async function runHarnessList(opts: HarnessOptions, io: HarnessIO): Promise<number> {
  const run = opts.run ?? spawnRunner;
  const root = resolveProjectRoot(opts.cwd);
  const states = await collectStates(root, run);
  if (opts.json) {
    io.stdout(`${JSON.stringify(states, null, 2)}\n`);
  } else {
    renderTable(states, io);
  }
  return 0;
}

/** The unknown-name error, shaped like `oh config`'s unknown-integration path. */
function unknownHarness(name: string, io: HarnessIO): number {
  io.stderr(`oh harness: unknown harness "${name}"\n\n`);
  io.stderr(`Known harnesses:\n${harnessIds().map((h) => `  ${h}`).join("\n")}\n`);
  return 1;
}

/** `oh harness status [name]` — the same data as `list`, optionally for one. */
export async function runHarnessStatus(
  name: string | undefined,
  opts: HarnessOptions,
  io: HarnessIO,
): Promise<number> {
  const run = opts.run ?? spawnRunner;
  const root = resolveProjectRoot(opts.cwd);

  let only: HarnessEntry | undefined;
  if (name !== undefined) {
    only = findHarness(name);
    if (!only) return unknownHarness(name, io);
  }

  const states = await collectStates(root, run, only);
  if (opts.json) {
    io.stdout(`${JSON.stringify(only ? states[0] : states, null, 2)}\n`);
  } else {
    renderTable(states, io);
  }
  return 0;
}

/**
 * `oh harness install <name>` — persist the flag, then install into the running
 * container.
 *
 * ORDER MATTERS: persist FIRST. The write is cheap and always possible, and it
 * stays correct even when the live install then fails — the next rebuild will
 * pick the harness up either way, and the failure message says so. Doing it the
 * other way round would lose the durable half whenever the network did.
 */
export async function runHarnessInstall(
  name: string,
  opts: HarnessInstallOptions,
  io: HarnessIO,
): Promise<number> {
  const run = opts.run ?? spawnRunner;
  const root = resolveProjectRoot(opts.cwd);

  const entry = findHarness(name);
  if (!entry) return unknownHarness(name, io);

  // ---- 1. persist -------------------------------------------------------
  if (!opts.noPersist) {
    if (entry.harnessKey === undefined) {
      // `default` and `on-demand` harnesses have no `INSTALL_*` key. Say so
      // rather than inventing one — a fabricated key would be interpolated by
      // nothing in docker-compose.yml and mislead the next reader.
      io.stdout(
        `${entry.id}: ${entry.kind} harness — no .devcontainer/.env install key, nothing to persist\n`,
      );
    } else {
      if (seedEnvFile(root)) {
        io.stdout("create .devcontainer/.env (from .devcontainer/.example.env)\n");
      }
      const key = installEnvKey(entry.harnessKey);
      const outcome = setInstallFlag(root, entry.harnessKey);
      io.stdout(
        outcome === "already-set"
          ? `.devcontainer/.env: ${key} already true\n`
          : `.devcontainer/.env: set ${key}=true (${outcome})\n`,
      );
    }
  }

  if (opts.persistOnly) return 0;

  // ---- 2. live install --------------------------------------------------
  const target = targetFor(root, run);
  let status: string;
  try {
    status = await target.status();
  } catch (err) {
    if (err instanceof ExecutionSpawnError && err.code === "ENOENT") {
      io.stderr("docker is required to install into the running sandbox but was not found on PATH\n");
      return 1;
    }
    throw err;
  }

  if (!isReachable(status)) {
    // The normal "not started yet" case. The durable half already landed, so
    // this is success, not failure.
    io.stdout(
      `sandbox not running (${status}) — skipping the live install.\n` +
        "Start it with `oh sandbox`, then re-run this command; or the next build picks it up.\n",
    );
    return 0;
  }

  const already = await probeInstalled(target, entry);
  if (already === true) {
    io.stdout(`${entry.id}: already installed (${entry.binary})\n`);
    return 0;
  }
  if (already === null) {
    io.stderr("docker is required to install into the running sandbox but was not found on PATH\n");
    return 1;
  }

  io.stdout(`installing ${entry.title} into the sandbox…\n`);
  const r = await target.exec({
    argv: [...entry.installArgv],
    user: entry.installUser,
    stdio: "inherit",
  });
  if (r.exitCode !== 0) {
    io.stderr(
      `oh harness: installing ${entry.id} failed (exit ${r.exitCode}).\n` +
        (entry.harnessKey !== undefined && !opts.noPersist
          ? `.devcontainer/.env keeps ${installEnvKey(entry.harnessKey)}=true — the next image build will install it.\n`
          : ""),
    );
    return r.exitCode;
  }

  io.stdout(`${entry.id}: installed — see ${entry.docsPath} for authentication\n`);
  return 0;
}
