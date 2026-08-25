import { existsSync } from "node:fs";
import {
  ExecutionSpawnError,
  resolveExecutionTarget,
} from "../lib/execution/index.js";
import { spawnRunner, type LifecycleRunner } from "../lib/execution/runner.js";
import type { ExecutionTarget } from "../lib/execution/target.js";
import { resolveProjectRoot } from "../lib/project.js";
import { confirm } from "../lib/prompt.js";
import {
  harnessYamlPath,
  isInstallFlagEnabled,
  seedHarnessYaml,
  setInstallFlag,
} from "../lib/harness-yaml.js";
import {
  findTool,
  installableToolIds,
  toolIds,
  TOOL_CATALOG,
  type ToolEntry,
} from "../lib/tools/catalog.js";
import { configuredContainerName, DEFAULT_CONTAINER_NAME } from "./lifecycle.js";

/**
 * `oh tool <list|install|status>` — the sandbox tooling that is neither an
 * agent CLI (`oh harness`) nor an isolation runtime (`oh runtime`).
 *
 * WHAT THIS SOLVES: `agent-browser` shares the `harness.yaml` `install:` section
 * with the optional harnesses but is not one, so `oh harness` deliberately
 * refuses it — leaving the only way to add it a hand-edit of `harness.yaml`
 * followed by a full container recreate, because the entrypoint installs it at
 * boot. And nothing could answer "is `gh` actually in this image, and what
 * version" without opening a shell.
 *
 * INSTALL IS PERSIST-FIRST, like `oh harness` and unlike `oh runtime`:
 *
 *   1. persist `install.agent_browser: true` in harness.yaml — cheap, always
 *      possible, and the reason the choice survives the next container recreate;
 *   2. install into the ALREADY-RUNNING container, so it is usable now.
 *
 * `oh runtime`'s refusal to persist anything is specific to the unmade #731
 * selector decision and does NOT transfer here: `install.agent_browser` already
 * exists in `harness-config.sh`'s envmap and in `harness.yaml.example`, so this
 * command writes a key the schema already defines and changes no schema.
 *
 * THE DOWNLOAD GATE. agent-browser pulls Chromium, roughly 1 GB. No harness
 * install downloads anything comparable, so this is the one place the CLI asks
 * before spending the operator's bandwidth. It FAILS CLOSED: a non-interactive
 * run without `--yes` installs nothing and says which flag it wanted. The
 * durable half still lands, so the next container recreate picks it up.
 *
 * WHAT THIS COMMAND NEVER DOES: rebuild or restart the sandbox. A stopped or
 * absent container is the normal "not started yet" case, so it persists the
 * flag, prints the hint, and exits 0.
 *
 * All container work goes through the `ExecutionTarget` contract — `status()`
 * and `exec()` — never a direct `docker exec` spawn, and never a `kind` check.
 */

/** Output channels, plus the injectable confirmation seam. */
export interface ToolIO {
  stdout: (s: string) => void;
  stderr: (s: string) => void;
  /**
   * Confirmation prompt. Tests inject a fake; production leaves it undefined
   * and the real `confirm()` is used behind an `isTTY` gate. Mirrors the
   * `io.ask` seam in `init.ts`.
   */
  confirm?: (question: string) => Promise<boolean>;
}

/** Options shared by every `oh tool` verb. */
export interface ToolOptions {
  cwd?: string;
  run?: LifecycleRunner;
  json?: boolean;
}

export interface ToolInstallOptions extends ToolOptions {
  /** Only set the harness.yaml flag; do no container work. */
  persistOnly?: boolean;
  /** Live-install only; leave harness.yaml untouched. */
  noPersist?: boolean;
  /** Skip the large-download confirmation. */
  yes?: boolean;
}

/** Per-tool state as reported by `list` / `status`. */
interface ToolRow {
  id: string;
  title: string;
  kind: string;
  /** `install.<key>` reads `true` in harness.yaml. `null` when it has no key. */
  enabled: boolean | null;
  /** Binary present in the container, or `null` when unreachable. */
  installed: boolean | null;
  /** First line of `versionArgv` output, or `null` when not declared/readable. */
  version: string | null;
  installable: boolean;
  docs: string;
}

function isReachable(status: string): boolean {
  return status === "ready" || status === "starting";
}

function targetFor(root: string, run: LifecycleRunner): ExecutionTarget {
  const name = configuredContainerName(root, run) ?? DEFAULT_CONTAINER_NAME;
  return resolveExecutionTarget({ projectRoot: root, container: name, run });
}

/** Run an argv in the container, returning `null` if it could not spawn. */
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

/** Is the tool's binary present? `null` when the probe could not run at all. */
async function probeInstalled(
  target: ExecutionTarget,
  entry: ToolEntry,
): Promise<boolean | null> {
  const r = await tryExec(target, entry.verifyArgv, entry.installUser ?? "sandbox");
  return r === null ? null : r.exitCode === 0;
}

/**
 * Read the tool's version, when it declares a probe.
 *
 * Returns `null` for a tool with no `versionArgv` — the catalog omits it rather
 * than guess an unverified flag — and `null` when the probe fails, because a
 * failed read is not a version.
 */
async function probeVersion(
  target: ExecutionTarget,
  entry: ToolEntry,
): Promise<string | null> {
  if (entry.versionArgv === undefined) return null;
  const r = await tryExec(target, entry.versionArgv, entry.installUser ?? "sandbox");
  if (r === null || r.exitCode !== 0) return null;
  const first = r.stdout.trim().split("\n")[0] ?? "";
  return first === "" ? null : first;
}

async function collectRows(
  root: string,
  run: LifecycleRunner,
  only?: ToolEntry,
): Promise<ToolRow[]> {
  const entries = only ? [only] : [...TOOL_CATALOG];
  const target = targetFor(root, run);

  let reachable = false;
  try {
    reachable = isReachable(await target.status());
  } catch (err) {
    if (!(err instanceof ExecutionSpawnError)) throw err;
  }

  const configured = existsSync(harnessYamlPath(root));
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
          : configured && isInstallFlagEnabled(root, entry.toolKey, run),
      installed,
      // Only ask a present binary for its version.
      version: reachable && installed === true ? await probeVersion(target, entry) : null,
      installable: entry.installArgv !== undefined,
      docs: entry.docsPath,
    });
  }
  return rows;
}

/** Render one cell: yes / no / n/a (no flag) / ? (container unreachable). */
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

/** `status` adds the version, where the catalog declares a probe for it. */
function renderDetail(rows: ToolRow[], io: ToolIO): void {
  renderTable(rows, io);
  for (const r of rows) {
    io.stdout(`\n${r.id} — ${r.title}\n`);
    // `—` distinguishes "no probe declared" from a failed read; the catalog
    // omits unverified flags rather than guessing them.
    io.stdout(`  version:    ${r.version ?? "—"}\n`);
    io.stdout(`  installable: ${r.installable ? "yes" : "no"}\n`);
    io.stdout(`  see ${r.docs}\n`);
  }
}

/** `oh tool list` — every known tool and its state. */
export async function runToolList(opts: ToolOptions, io: ToolIO): Promise<number> {
  const run = opts.run ?? spawnRunner;
  const root = resolveProjectRoot(opts.cwd);
  const rows = await collectRows(root, run);
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

/** `oh tool status [name]` — the same data as `list`, plus versions. */
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

  const rows = await collectRows(root, run, only);
  if (opts.json) {
    io.stdout(`${JSON.stringify(only ? rows[0] : rows, null, 2)}\n`);
  } else {
    renderDetail(rows, io);
  }
  return 0;
}

/**
 * Ask before a large download.
 *
 * Precedence: `--yes` wins; then an injected confirm (tests); then the real
 * prompt, but ONLY on a TTY. A non-interactive run with no `--yes` returns
 * false — fail closed. Silently proceeding would spend a gigabyte of someone's
 * bandwidth in CI.
 */
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

/**
 * `oh tool install <name>` — persist the flag, then install into the running
 * container.
 *
 * ORDER MATTERS: persist FIRST, exactly as `oh harness install` does. The write
 * is cheap and always possible, and it stays correct even when the download is
 * then declined or fails — the next container start picks the tool up either
 * way, and the message says so.
 */
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

  // ---- 1. persist -------------------------------------------------------
  if (!opts.noPersist && entry.toolKey !== undefined) {
    if (seedHarnessYaml(root)) {
      io.stdout("create harness.yaml (from harness.yaml.example)\n");
    }
    const outcome = setInstallFlag(root, entry.toolKey);
    io.stdout(
      outcome === "already-set"
        ? `harness.yaml: install.${entry.toolKey} already true\n`
        : `harness.yaml: set install.${entry.toolKey}: true (${outcome})\n`,
    );
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

  // The gate sits AFTER the persist and AFTER the already-installed check, so
  // declining costs nothing that was already done and nobody is asked to
  // approve a download that would not have happened.
  if (!(await confirmDownload(entry, opts, io))) {
    if (!opts.noPersist && entry.toolKey !== undefined) {
      io.stdout(
        `harness.yaml keeps install.${entry.toolKey}: true — the next container start will install it.\n`,
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
          ? `harness.yaml keeps install.${entry.toolKey}: true — the next container start will retry it.\n`
          : ""),
    );
    return r.exitCode;
  }

  io.stdout(`${entry.id}: installed — see ${entry.docsPath}\n`);
  return 0;
}
