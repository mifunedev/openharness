import { existsSync } from "node:fs";
import {
  ExecutionSpawnError,
  resolveExecutionTarget,
} from "../lib/execution/index.js";
import { spawnRunner, type LifecycleRunner } from "../lib/execution/runner.js";
import type { ExecutionTarget } from "../lib/execution/target.js";
import { sourceDocsUrl } from "../lib/docs.js";
import { resolveProjectRoot } from "../lib/project.js";
import { confirm } from "../lib/prompt.js";
import {
  envFilePath,
  installEnvKey,
  isInstallFlagEnabled,
  seedEnvFile,
  setInstallFlag,
} from "../lib/env-file.js";
import {
  findTool,
  installableToolIds,
  toolIds,
  TOOL_CATALOG,
  type ToolEntry,
} from "../lib/tools/catalog.js";
import { configuredContainerName, DEFAULT_CONTAINER_NAME } from "./lifecycle.js";


export interface ToolIO {
  stdout: (s: string) => void;
  stderr: (s: string) => void;
  confirm?: (question: string) => Promise<boolean>;
}

export interface ToolOptions {
  cwd?: string;
  run?: LifecycleRunner;
  json?: boolean;
  env?: NodeJS.ProcessEnv;
}

export interface ToolInstallOptions extends ToolOptions {
  persistOnly?: boolean;
  noPersist?: boolean;
  yes?: boolean;
}

interface ToolRow {
  id: string;
  title: string;
  kind: string;
  enabled: boolean | null;
  installed: boolean | null;
  version: string | null;
  installable: boolean;
  docs: string;
}

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

async function tryExec(
  target: ExecutionTarget,
  argv: readonly string[],
  user: "root" | "sandbox",
): Promise<{ exitCode: number; stdout: string } | null> {
  try {
    const r = await target.exec({ argv: [...argv], user, stdio: "capture" });
    return { exitCode: r.exitCode, stdout: r.stdout };
  } catch (err) {
    if (err instanceof ExecutionSpawnError) return null;
    throw err;
  }
}

async function probeInstalled(
  target: ExecutionTarget,
  entry: ToolEntry,
): Promise<boolean | null> {
  const r = await tryExec(target, entry.verifyArgv, "sandbox");
  return r === null ? null : r.exitCode === 0;
}

async function probeVersion(
  target: ExecutionTarget,
  entry: ToolEntry,
): Promise<string | null> {
  if (entry.versionArgv === undefined) return null;
  const r = await tryExec(target, entry.versionArgv, "sandbox");
  if (r === null || r.exitCode !== 0) return null;
  const first = r.stdout.trim().split("\n")[0] ?? "";
  return first === "" ? null : first;
}

async function collectRows(
  root: string,
  run: LifecycleRunner,
  env?: NodeJS.ProcessEnv,
  only?: ToolEntry,
): Promise<ToolRow[]> {
  const entries = only ? [only] : [...TOOL_CATALOG];
  const target = targetFor(root, run, env);

  let reachable = false;
  try {
    reachable = isReachable(await target.status());
  } catch (err) {
    if (!(err instanceof ExecutionSpawnError)) throw err;
  }

  const configured = existsSync(envFilePath(root));
  const rows: ToolRow[] = [];
  for (const entry of entries) {
    const installed = reachable ? await probeInstalled(target, entry) : null;
    rows.push({
      id: entry.id,
      title: entry.title,
      kind: entry.kind,
      enabled:
        entry.toolKey === undefined
          ? null
          : configured && isInstallFlagEnabled(root, entry.toolKey),
      installed,
      version: reachable && installed === true ? await probeVersion(target, entry) : null,
      installable: entry.installArgv !== undefined,
      docs: sourceDocsUrl(entry.docsPath),
    });
  }
  return rows;
}

function cell(value: boolean | null, absent: string): string {
  if (value === null) return absent;
  return value ? "yes" : "no";
}

function renderTable(rows: ToolRow[], io: ToolIO): void {
  const header = ["TOOL", "KIND", "ENABLED", "INSTALLED"];
  const body = rows.map((r) => [
    r.id,
    r.kind,
    cell(r.enabled, "n/a"),
    cell(r.installed, "?"),
  ]);
  const widths = header.map((h, i) =>
    Math.max(h.length, ...body.map((b) => b[i].length)),
  );
  const line = (cols: string[]): string =>
    cols.map((c, i) => c.padEnd(widths[i])).join("  ").trimEnd() + "\n";
  io.stdout(line(header));
  for (const row of body) io.stdout(line(row));
  if (rows.some((r) => r.installed === null)) {
    io.stdout("\nINSTALLED is `?` — the sandbox is not running. Start it with `oh sandbox`.\n");
  }
}

function renderDetail(rows: ToolRow[], io: ToolIO): void {
  renderTable(rows, io);
  for (const r of rows) {
    io.stdout(`\n${r.id} — ${r.title}\n`);
    io.stdout(`  version:    ${r.version ?? "—"}\n`);
    io.stdout(`  installable: ${r.installable ? "yes" : "no"}\n`);
    io.stdout(`  see ${r.docs}\n`);
  }
}

export async function runToolList(opts: ToolOptions, io: ToolIO): Promise<number> {
  const run = opts.run ?? spawnRunner;
  const root = resolveProjectRoot(opts.cwd);
  const rows = await collectRows(root, run, opts.env);
  if (opts.json) {
    io.stdout(`${JSON.stringify(rows, null, 2)}\n`);
  } else {
    renderTable(rows, io);
  }
  return 0;
}

function unknownTool(name: string, io: ToolIO): number {
  io.stderr(`oh tool: unknown tool "${name}"\n\n`);
  io.stderr(`Known tools:\n${toolIds().map((t) => `  ${t}`).join("\n")}\n`);
  return 1;
}

export async function runToolStatus(
  name: string | undefined,
  opts: ToolOptions,
  io: ToolIO,
): Promise<number> {
  const run = opts.run ?? spawnRunner;
  const root = resolveProjectRoot(opts.cwd);

  let only: ToolEntry | undefined;
  if (name !== undefined) {
    only = findTool(name);
    if (!only) return unknownTool(name, io);
  }

  const rows = await collectRows(root, run, opts.env, only);
  if (opts.json) {
    io.stdout(`${JSON.stringify(only ? rows[0] : rows, null, 2)}\n`);
  } else {
    renderDetail(rows, io);
  }
  return 0;
}

async function confirmDownload(
  entry: ToolEntry,
  opts: ToolInstallOptions,
  io: ToolIO,
): Promise<boolean> {
  if (entry.downloadSize === undefined) return true;
  if (opts.yes === true) return true;

  const question = `${entry.id} downloads ${entry.downloadSize}. Continue?`;
  if (io.confirm !== undefined) return io.confirm(question);
  if (process.stdin.isTTY === true) return confirm(question, false);

  io.stderr(
    `${entry.id} downloads ${entry.downloadSize} and this is not an interactive terminal.\n` +
      "Re-run with --yes to accept the download, or --persist-only to set the flag\n" +
      "and let the next container start install it.\n",
  );
  return false;
}

export async function runToolInstall(
  name: string,
  opts: ToolInstallOptions,
  io: ToolIO,
): Promise<number> {
  const run = opts.run ?? spawnRunner;
  const root = resolveProjectRoot(opts.cwd);

  const entry = findTool(name);
  if (!entry) return unknownTool(name, io);

  if (entry.installArgv === undefined) {
    io.stderr(`oh tool: ${entry.id} cannot be installed by this command.\n\n`);
    io.stderr(`${entry.notInstallableReason ?? ""}\n\n`);
    io.stderr(`Installable tools:\n${installableToolIds().map((t) => `  ${t}`).join("\n")}\n`);
    return 1;
  }

  if (!opts.noPersist && entry.toolKey !== undefined) {
    if (seedEnvFile(root)) {
      io.stdout("create .devcontainer/.env (from .devcontainer/.example.env)\n");
    }
    const key = installEnvKey(entry.toolKey);
    const outcome = setInstallFlag(root, entry.toolKey);
    io.stdout(
      outcome === "already-set"
        ? `.devcontainer/.env: ${key} already true\n`
        : `.devcontainer/.env: set ${key}=true (${outcome})\n`,
    );
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
        "Start it with `oh sandbox`, then re-run this command; or the next container start picks it up.\n",
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

  if (!(await confirmDownload(entry, opts, io))) {
    if (!opts.noPersist && entry.toolKey !== undefined) {
      io.stdout(
        `.devcontainer/.env keeps ${installEnvKey(entry.toolKey)}=true — the next container start will install it.\n`,
      );
    }
    return 1;
  }

  io.stdout(`installing ${entry.title} into the sandbox…\n`);
  const r = await target.exec({
    argv: [...entry.installArgv],
    user: entry.installUser ?? "sandbox",
    stdio: "inherit",
  });
  if (r.exitCode !== 0) {
    io.stderr(
      `oh tool: installing ${entry.id} failed (exit ${r.exitCode}).\n` +
        (entry.toolKey !== undefined && !opts.noPersist
          ? `.devcontainer/.env keeps ${installEnvKey(entry.toolKey)}=true — the next container start will retry it.\n`
          : ""),
    );
    return r.exitCode;
  }

  io.stdout(`${entry.id}: installed — see ${sourceDocsUrl(entry.docsPath)}\n`);
  return 0;
}
