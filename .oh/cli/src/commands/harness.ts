import {
  ExecutionSpawnError,
  resolveExecutionTarget,
} from "../lib/execution/index.js";
import { sourceDocsUrl } from "../lib/docs.js";
import { runningInsideSandbox } from "../lib/execution/detect.js";
import { spawnRunner, type LifecycleRunner } from "../lib/execution/runner.js";
import type { ExecutionTarget } from "../lib/execution/target.js";
import { resolveProjectRoot } from "../lib/project.js";
import {
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
}

interface HarnessState {
  id: string;
  title: string;
  binary: string;
  kind: string;
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
  env?: Record<string, string>,
): Promise<boolean | null> {
  try {
    const r = await target.exec({
      argv: [...entry.verifyArgv],
      user: "sandbox",
      stdio: "capture",
      timeoutMs: PROBE_TIMEOUT_MS,
      ...(env ? { env } : {}),
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
  const header = ["HARNESS", "KIND", "INSTALLED"];
  const rows = states.map((s) => [s.id, s.kind, cell(s.installed, "?")]);
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
  const states = await collectStates(root, run, opts.env);
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

function hermesTargetRoot(target: ExecutionTarget): string {
  return target.kind === "docker-compose" ? "/home/sandbox/harness" : target.workspace.targetRoot;
}

async function reconcileHermes(target: ExecutionTarget, io: HarnessIO): Promise<number> {
  const root = hermesTargetRoot(target);
  const result = await target.exec({
    argv: ["bash", `${root}/.oh/scripts/link-providers.sh`, "--init", "--hermes-only"],
    env: { OH_PROJECT_ROOT: root },
    user: "sandbox",
    stdio: "inherit",
  });
  if (result.exitCode !== 0) {
    io.stderr(`oh harness: Hermes integration failed (exit ${result.exitCode}); no installation success reported.\n`);
  }
  return result.exitCode;
}

export async function runHarnessInstall(
  name: string,
  opts: HarnessOptions,
  io: HarnessIO,
): Promise<number> {
  const run = opts.run ?? spawnRunner;
  const env = opts.env ?? process.env;
  const root = resolveProjectRoot(
    name === "hermes" && runningInsideSandbox(env) && env.OH_PROJECT_ROOT
      ? env.OH_PROJECT_ROOT
      : opts.cwd,
  );

  const entry = findHarness(name);
  if (!entry) return unknownHarness(name, io);

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
    io.stderr(
      `oh harness: the sandbox is not running (${status}).\n` +
        "Start it with `oh sandbox`, then re-run this command.\n",
    );
    return 1;
  }

  const hermes = entry.id === "hermes";
  const installEnv = hermes ? {
    OH_PROJECT_ROOT: hermesTargetRoot(target),
    HERMES_HOME: `${hermesTargetRoot(target)}/.hermes`,
  } : undefined;
  if (hermes) {
    const code = await reconcileHermes(target, io);
    if (code !== 0) return code;
  }

  const already = await probeInstalled(target, entry, installEnv);
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
    ...(installEnv ? { env: installEnv } : {}),
  });
  if (r.exitCode !== 0) {
    io.stderr(`oh harness: installing ${entry.id} failed (exit ${r.exitCode}).\n`);
    return r.exitCode;
  }

  if (hermes) {
    if (await probeInstalled(target, entry, installEnv) !== true) {
      io.stderr("oh harness: Hermes installation finished but executable verification failed.\n");
      return 1;
    }
    const code = await reconcileHermes(target, io);
    if (code !== 0) return code;
  }

  io.stdout(`${entry.id}: installed — see ${sourceDocsUrl(entry.docsPath)} for authentication\n`);
  return 0;
}
