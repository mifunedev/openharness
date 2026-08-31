import {
  ExecutionSpawnError,
  resolveExecutionTarget,
} from "../lib/execution/index.js";
import { sourceDocsUrl } from "../lib/docs.js";
import { spawnRunner, type LifecycleRunner } from "../lib/execution/runner.js";
import type { ExecutionTarget } from "../lib/execution/target.js";
import { resolveProjectRoot } from "../lib/project.js";
import {
  installFieldPath,
  isInstallFlagEnabled,
  setInstallFlag,
} from "../lib/env-file.js";
import {
  defaultHarnesses,
  findHarness,
  harnessIds,
  HARNESS_CATALOG,
  type HarnessEntry,
} from "../lib/harnesses/catalog.js";
import { configuredContainerName, DEFAULT_CONTAINER_NAME } from "./lifecycle.js";


export interface HarnessIO {
  stdout: (s: string) => void;
  stderr: (s: string) => void;
}

export interface HarnessOptions {
  cwd?: string;
  run?: LifecycleRunner;
  json?: boolean;
  env?: NodeJS.ProcessEnv;
  defaultsOnly?: boolean;
}

export interface HarnessInstallOptions extends HarnessOptions {
  persistOnly?: boolean;
  noPersist?: boolean;
}

interface HarnessState {
  id: string;
  title: string;
  binary: string;
  kind: string;
  enabled: boolean | null;
  installed: boolean | null;
  docs: string;
}

export const PROBE_TIMEOUT_MS = 15_000;

function isReachable(status: string): boolean {
  return status === "ready" || status === "starting";
}

function targetFor(
  root: string,
  run: LifecycleRunner,
  env?: NodeJS.ProcessEnv,
): ExecutionTarget {
  const name = configuredContainerName(root) ?? DEFAULT_CONTAINER_NAME;
  return resolveExecutionTarget({
    projectRoot: root,
    container: name,
    run,
    ...(env ? { env } : {}),
  });
}

async function probeInstalled(
  target: ExecutionTarget,
  entry: HarnessEntry,
): Promise<boolean | null> {
  try {
    const r = await target.exec({
      argv: [...entry.verifyArgv],
      user: "sandbox",
      stdio: "capture",
      timeoutMs: PROBE_TIMEOUT_MS,
    });
    return r.exitCode === 0;
  } catch (err) {
    if (err instanceof ExecutionSpawnError) return null;
    throw err;
  }
}

async function collectStates(
  root: string,
  run: LifecycleRunner,
  env?: NodeJS.ProcessEnv,
  only?: readonly HarnessEntry[],
): Promise<HarnessState[]> {
  const entries = only ? [...only] : [...HARNESS_CATALOG];
  const target = targetFor(root, run, env);

  let reachable = false;
  try {
    reachable = isReachable(await target.status());
  } catch (err) {
    if (!(err instanceof ExecutionSpawnError)) throw err;
  }

  const states: HarnessState[] = [];
  for (const entry of entries) {
    states.push({
      id: entry.id,
      title: entry.title,
      binary: entry.binary,
      kind: entry.kind,
      enabled:
        entry.harnessKey === undefined ? null : isInstallFlagEnabled(root, entry.harnessKey),
      installed: reachable ? await probeInstalled(target, entry) : null,
      docs: sourceDocsUrl(entry.docsPath),
    });
  }
  return states;
}

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

export async function runHarnessList(opts: HarnessOptions, io: HarnessIO): Promise<number> {
  const run = opts.run ?? spawnRunner;
  const root = resolveProjectRoot(opts.cwd);
  const states = await collectStates(
    root,
    run,
    opts.env,
    opts.defaultsOnly === true ? defaultHarnesses() : undefined,
  );
  if (opts.json) {
    io.stdout(`${JSON.stringify(states, null, 2)}\n`);
  } else {
    renderTable(states, io);
  }
  return 0;
}

function unknownHarness(name: string, io: HarnessIO): number {
  io.stderr(`oh harness: unknown harness "${name}"\n\n`);
  io.stderr(`Known harnesses:\n${harnessIds().map((h) => `  ${h}`).join("\n")}\n`);
  return 1;
}

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

  const states = await collectStates(root, run, opts.env, only ? [only] : undefined);
  if (opts.json) {
    io.stdout(`${JSON.stringify(only ? states[0] : states, null, 2)}\n`);
  } else {
    renderTable(states, io);
  }
  return 0;
}

export async function runHarnessInstall(
  name: string,
  opts: HarnessInstallOptions,
  io: HarnessIO,
): Promise<number> {
  const run = opts.run ?? spawnRunner;
  const root = resolveProjectRoot(opts.cwd);

  const entry = findHarness(name);
  if (!entry) return unknownHarness(name, io);

  if (!opts.noPersist) {
    if (entry.harnessKey === undefined) {
      io.stdout(
        `${entry.id}: ${entry.kind} harness — no oh.json install field, nothing to persist\n`,
      );
    } else {
      const field = installFieldPath(entry.harnessKey);
      const outcome = setInstallFlag(root, entry.harnessKey);
      io.stdout(
        outcome === "already-set"
          ? `oh.json: ${field} already true\n`
          : `oh.json: set ${field}=true (${outcome})\n`,
      );
    }
  }

  if (opts.persistOnly) return 0;

  const target = targetFor(root, run, opts.env);
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
          ? `oh.json keeps ${installFieldPath(entry.harnessKey)}=true — the next image build will install it.\n`
          : ""),
    );
    return r.exitCode;
  }

  io.stdout(`${entry.id}: installed — see ${sourceDocsUrl(entry.docsPath)} for authentication\n`);
  return 0;
}
