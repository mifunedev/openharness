import {
  ExecutionSpawnError,
  resolveExecutionTarget,
} from "../lib/execution/index.js";
import { spawnRunner, type LifecycleRunner } from "../lib/execution/runner.js";
import type { ExecutionTarget } from "../lib/execution/target.js";
import { resolveProjectRoot } from "../lib/project.js";
import {
  compareVersions,
  findSubstrate,
  parseGlibcVersion,
  substrateIds,
  SUBSTRATE_CATALOG,
  type PreflightCheck,
  type SubstrateEntry,
} from "../lib/substrates/catalog.js";
import { configuredContainerName, DEFAULT_CONTAINER_NAME } from "./lifecycle.js";

/**
 * `oh substrate <list|install|status>` — inspect host support for isolation
 * substrates and install MicroSandbox into the running sandbox.
 *
 * WHAT THIS SOLVES: the substrate work is spread across four issues, two draft
 * PRs, and a task folder. Finding out whether this machine can run MicroSandbox
 * meant reading #805, then checking `.devcontainer/Dockerfile`'s base for its
 * glibc, then checking `docker-compose.yml` for a `devices:` key. That is three
 * files and two issues to answer one yes/no question. `oh substrate status`
 * answers it by measuring, in one command.
 *
 * THIS COMMAND CHANGES NO RUNTIME. It installs a tool and reports readiness.
 * The sandbox keeps booting exactly as it does today — no substrate is
 * selected, no config key is written, and `resolveExecutionTarget` is untouched.
 * Selecting a substrate is EPIC #731's decision (#806 § B1 records the open
 * `sandbox.substrate` vs `sandbox.runtime` split); see the catalog's header for
 * why this command deliberately stays out of it.
 *
 * THE PREFLIGHT FAILS CLOSED. MicroSandbox has two measured blockers here and
 * has never produced a binary in this harness. Running the installer anyway
 * would spend a network round trip to reproduce an error #805 already
 * documents. So `install` measures first, reports both facts with their
 * remediation, and attempts nothing — unless `--force`, which is where the
 * operator's own decision lives.
 *
 * All container work goes through the `ExecutionTarget` contract — `status()`
 * and `exec()` — never a direct `docker exec` spawn, and never a `kind` check.
 */

/** Output channels — mirrors `HarnessIO` so tests capture the log and hints. */
export interface SubstrateIO {
  stdout: (s: string) => void;
  stderr: (s: string) => void;
}

/** Options shared by every `oh substrate` verb. */
export interface SubstrateOptions {
  /** Where the equipped-project-root walk starts (default: process.cwd()). */
  cwd?: string;
  /** Subprocess runner. Default: real `spawnSync`. Tests inject a fake. */
  run?: LifecycleRunner;
  /** Emit machine-readable JSON (list/status). */
  json?: boolean;
}

export interface SubstrateInstallOptions extends SubstrateOptions {
  /** Attempt the install even when the preflight says the host cannot run it. */
  force?: boolean;
}

/** One measured requirement. */
interface CheckResult {
  id: string;
  label: string;
  /** What was actually read, e.g. `2.36` or `absent`. */
  found: string;
  /** What the substrate needs, e.g. `>= 2.39`. */
  required: string;
  /** `null` when the probe could not run — unknown, NOT failed. */
  ok: boolean | null;
  remediation: string;
}

/** Per-substrate state as reported by `list` / `status`. */
interface SubstrateState {
  id: string;
  title: string;
  tier: string;
  state: string;
  /** All preflight checks pass. `null` when unmeasured (container unreachable). */
  supported: boolean | null;
  /** Binary present in the container, or `null` when unreachable/not installable. */
  installed: boolean | null;
  installable: boolean;
  checks: CheckResult[];
  docs: string;
  tracking: string;
}

/** The container-unreachable states — the ones that skip live work entirely. */
function isReachable(status: string): boolean {
  return status === "ready" || status === "starting";
}

/**
 * Resolve the sandbox `ExecutionTarget`, reusing `oh shell`'s container-name
 * precedence (harness.yaml `sandbox.name` > the default) instead of forking it.
 */
function targetFor(root: string, run: LifecycleRunner): ExecutionTarget {
  const name = configuredContainerName(root, run) ?? DEFAULT_CONTAINER_NAME;
  return resolveExecutionTarget({ projectRoot: root, container: name, run });
}

/**
 * Run one preflight check inside the container.
 *
 * Returns `ok: null` when the probe itself could not run, which the renderer
 * shows as `?`. Reporting "unsupported" because we failed to look would be a
 * false negative that sends the operator to fix a blocker they may not have.
 */
async function runCheck(
  target: ExecutionTarget,
  check: PreflightCheck,
): Promise<CheckResult> {
  const base = { id: check.id, label: check.label, remediation: check.remediation };

  let out: { exitCode: number; stdout: string };
  try {
    out = await target.exec({
      argv: [...check.probeArgv],
      user: "sandbox",
      stdio: "capture",
    });
  } catch (err) {
    if (err instanceof ExecutionSpawnError) {
      return { ...base, found: "?", required: requiredOf(check), ok: null };
    }
    throw err;
  }

  if (check.id === "glibc") {
    const version = out.exitCode === 0 ? parseGlibcVersion(out.stdout) : undefined;
    if (version === undefined) {
      return { ...base, found: "?", required: `>= ${check.minVersion}`, ok: null };
    }
    return {
      ...base,
      found: version,
      required: `>= ${check.minVersion}`,
      ok: compareVersions(version, check.minVersion) >= 0,
    };
  }

  // `device`: the probe is `test -e <path>`, so the exit code IS the answer.
  return {
    ...base,
    found: out.exitCode === 0 ? "present" : "absent",
    required: "present",
    ok: out.exitCode === 0,
  };
}

function requiredOf(check: PreflightCheck): string {
  return check.id === "glibc" ? `>= ${check.minVersion}` : "present";
}

/** Is the substrate's binary present inside the container? */
async function probeInstalled(
  target: ExecutionTarget,
  entry: SubstrateEntry,
): Promise<boolean | null> {
  if (entry.verifyArgv === undefined) return null;
  try {
    const r = await target.exec({
      argv: [...entry.verifyArgv],
      user: entry.installUser ?? "sandbox",
      stdio: "capture",
    });
    return r.exitCode === 0;
  } catch (err) {
    if (err instanceof ExecutionSpawnError) return null;
    throw err;
  }
}

/**
 * Roll the individual checks into one verdict.
 *
 * An unknown check makes the whole verdict unknown. Any failing check makes it
 * false. A substrate with no checks (because it is not installable from here)
 * is `null` — "not applicable", never a bare `true`.
 */
function verdict(checks: CheckResult[]): boolean | null {
  if (checks.length === 0) return null;
  if (checks.some((c) => c.ok === false)) return false;
  if (checks.some((c) => c.ok === null)) return null;
  return true;
}

/** Gather the state of every catalog entry (or one, when `only` is given). */
async function collectStates(
  root: string,
  run: LifecycleRunner,
  only?: SubstrateEntry,
): Promise<SubstrateState[]> {
  const entries = only ? [only] : [...SUBSTRATE_CATALOG];
  const target = targetFor(root, run);

  let reachable = false;
  try {
    reachable = isReachable(await target.status());
  } catch (err) {
    if (!(err instanceof ExecutionSpawnError)) throw err;
  }

  const states: SubstrateState[] = [];
  for (const entry of entries) {
    const checks: CheckResult[] = [];
    if (reachable) {
      for (const check of entry.preflight) {
        checks.push(await runCheck(target, check));
      }
    } else {
      for (const check of entry.preflight) {
        checks.push({
          id: check.id,
          label: check.label,
          found: "?",
          required: requiredOf(check),
          ok: null,
          remediation: check.remediation,
        });
      }
    }
    states.push({
      id: entry.id,
      title: entry.title,
      tier: entry.tier,
      state: entry.state,
      supported: verdict(checks),
      installed: reachable ? await probeInstalled(target, entry) : null,
      installable: entry.installable,
      checks,
      docs: entry.docsPath,
      tracking: entry.tracking,
    });
  }
  return states;
}

/** Render one state cell: yes / no / n/a / ? (unmeasured). */
function cell(value: boolean | null, absent: string): string {
  if (value === null) return absent;
  return value ? "yes" : "no";
}

function renderTable(states: SubstrateState[], io: SubstrateIO): void {
  const header = ["SUBSTRATE", "TIER", "STATE", "SUPPORTED", "INSTALLED"];
  const rows = states.map((s) => [
    s.id,
    s.tier,
    s.state,
    s.installable ? cell(s.supported, "?") : "n/a",
    s.installable ? cell(s.installed, "?") : "n/a",
  ]);
  const widths = header.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => r[i].length)),
  );
  const line = (cols: string[]): string =>
    cols.map((c, i) => c.padEnd(widths[i])).join("  ").trimEnd() + "\n";
  io.stdout(line(header));
  for (const row of rows) io.stdout(line(row));
  if (states.some((s) => s.installable && s.supported === null)) {
    io.stdout(
      "\nSUPPORTED is `?` — nothing was measured. Start the sandbox with `oh sandbox`, then re-run.\n",
    );
  }
}

/** `status` adds the measured detail behind each verdict. */
function renderDetail(states: SubstrateState[], io: SubstrateIO): void {
  renderTable(states, io);
  for (const s of states) {
    if (s.checks.length === 0) continue;
    io.stdout(`\n${s.id} — host requirements:\n`);
    for (const c of s.checks) {
      const mark = c.ok === null ? "?" : c.ok ? "OK" : "FAIL";
      io.stdout(`  ${c.label.padEnd(10)} ${c.found.padEnd(8)} requires ${c.required.padEnd(9)} ${mark}\n`);
      if (c.ok === false) io.stdout(`             ${c.remediation}\n`);
    }
    io.stdout(`  tracked in ${s.tracking} — see ${s.docs}\n`);
  }
}

/** `oh substrate list` — every known substrate and its state. */
export async function runSubstrateList(
  opts: SubstrateOptions,
  io: SubstrateIO,
): Promise<number> {
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

/** The unknown-name error, shaped like `oh harness`'s. */
function unknownSubstrate(name: string, io: SubstrateIO): number {
  io.stderr(`oh substrate: unknown substrate "${name}"\n\n`);
  io.stderr(`Known substrates:\n${substrateIds().map((s) => `  ${s}`).join("\n")}\n`);
  return 1;
}

/** `oh substrate status [name]` — the same data as `list`, plus the measurements. */
export async function runSubstrateStatus(
  name: string | undefined,
  opts: SubstrateOptions,
  io: SubstrateIO,
): Promise<number> {
  const run = opts.run ?? spawnRunner;
  const root = resolveProjectRoot(opts.cwd);

  let only: SubstrateEntry | undefined;
  if (name !== undefined) {
    only = findSubstrate(name);
    if (!only) return unknownSubstrate(name, io);
  }

  const states = await collectStates(root, run, only);
  if (opts.json) {
    io.stdout(`${JSON.stringify(only ? states[0] : states, null, 2)}\n`);
  } else {
    renderDetail(states, io);
  }
  return 0;
}

/**
 * `oh substrate install [name]` — preflight, then install into the running
 * container.
 *
 * ORDER MATTERS, and it is the OPPOSITE of `oh harness install`. That command
 * persists a flag first because the flag is cheap and survives failure. This
 * one has no flag to persist (see the catalog header), so the first action is
 * the measurement — and the measurement is a gate, not a warning.
 */
export async function runSubstrateInstall(
  name: string,
  opts: SubstrateInstallOptions,
  io: SubstrateIO,
): Promise<number> {
  const run = opts.run ?? spawnRunner;
  const root = resolveProjectRoot(opts.cwd);

  const entry = findSubstrate(name);
  if (!entry) return unknownSubstrate(name, io);

  if (!entry.installable) {
    io.stderr(`oh substrate: ${entry.id} cannot be installed by this command.\n\n`);
    io.stderr(`${entry.notInstallableReason ?? ""}\n`);
    io.stderr(`Tracked in ${entry.tracking} — see ${entry.docsPath}\n`);
    return 1;
  }

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
    // Nothing durable to write, so there is genuinely nothing to do — but this
    // is the normal "not started yet" case, not an error the user caused.
    io.stdout(
      `sandbox not running (${status}) — nothing was installed.\n` +
        "Start it with `oh sandbox`, then re-run this command.\n",
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

  // ---- preflight --------------------------------------------------------
  const checks: CheckResult[] = [];
  for (const check of entry.preflight) checks.push(await runCheck(target, check));
  const supported = verdict(checks);

  if (supported !== true) {
    const failed = checks.filter((c) => c.ok !== true);
    io.stderr(`${entry.id}: not supported on this host — nothing was installed.\n\n`);
    for (const c of failed) {
      io.stderr(`  ${c.label.padEnd(10)} ${c.found.padEnd(8)} requires ${c.required}\n`);
      io.stderr(`             ${c.remediation}\n`);
    }
    io.stderr(`\nTracked in ${entry.tracking}. Re-run after the blockers clear,\n`);
    io.stderr("or pass --force to attempt the install anyway.\n");
    if (!opts.force) return 1;
    io.stderr("\n--force given — attempting the install despite the preflight.\n");
  }

  // ---- install ----------------------------------------------------------
  io.stdout(`installing ${entry.title} into the sandbox…\n`);
  const r = await target.exec({
    argv: [...(entry.installArgv ?? [])],
    user: entry.installUser ?? "sandbox",
    stdio: "inherit",
  });
  if (r.exitCode !== 0) {
    io.stderr(`oh substrate: installing ${entry.id} failed (exit ${r.exitCode}).\n`);
    io.stderr(`See ${entry.docsPath} and ${entry.tracking}.\n`);
    return r.exitCode;
  }

  // The doctor DIAGNOSES; it does not gate. The install already succeeded, and
  // a failing doctor on a host that only just cleared its blockers is
  // information, not a reason to report the install as failed.
  if (entry.doctorArgv !== undefined) {
    const doctor = await target.exec({
      argv: [...entry.doctorArgv],
      user: entry.installUser ?? "sandbox",
      stdio: "capture",
    });
    if (doctor.exitCode !== 0) {
      io.stdout(
        `${entry.id}: installed, but \`${entry.doctorArgv.join(" ")}\` exited ${doctor.exitCode}.\n` +
          `See ${entry.docsPath} for the round-trip check.\n`,
      );
      return 0;
    }
  }

  io.stdout(`${entry.id}: installed — see ${entry.docsPath}\n`);
  return 0;
}
