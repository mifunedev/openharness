import {
  ExecutionSpawnError,
  resolveExecutionTarget,
} from "../lib/execution/index.js";
import { spawnRunner, type LifecycleRunner } from "../lib/execution/runner.js";
import type { ExecutionTarget } from "../lib/execution/target.js";
import { resolveProjectRoot } from "../lib/project.js";
import {
  compareVersions,
  findRuntime,
  parseGlibcVersion,
  runtimeIds,
  RUNTIME_CATALOG,
  type PreflightCheck,
  type RuntimeEntry,
} from "../lib/runtimes/catalog.js";
import { configuredContainerName, DEFAULT_CONTAINER_NAME } from "./lifecycle.js";

/**
 * `oh runtime <list|install|status>` — report which isolation runtime the
 * sandbox is on, measure what the others would need, and install MicroSandbox.
 *
 * WHAT THIS SOLVES: the runtime work is spread across four issues, two draft
 * PRs, and a task folder. Finding out whether this machine can run MicroSandbox
 * meant reading #805, then checking `.devcontainer/Dockerfile`'s base for its
 * glibc, then checking `docker-compose.yml` for a `devices:` key — three files
 * and two issues to answer one yes/no question. And nothing at all reported the
 * runtime you are *currently* on. `oh runtime status` answers both by
 * measuring, in one command.
 *
 * THIS COMMAND CHANGES NO RUNTIME. It reports, and it installs a tool. The
 * sandbox keeps booting exactly as it does today — nothing is selected, no
 * config key is written, and `resolveExecutionTarget` is untouched. Selecting a
 * runtime is EPIC #731's decision (#806 § B1 records the open
 * `sandbox.substrate` vs `sandbox.runtime` split); see the catalog's header for
 * why this command deliberately stays out of it, and why naming the command
 * `runtime` does not decide the key.
 *
 * THE PREFLIGHT FAILS CLOSED. MicroSandbox has two measured blockers here and
 * has never produced a binary in this harness. Running the installer anyway
 * would spend a network round trip to reproduce an error #805 already
 * documents. So `install` measures first, reports both facts with their
 * remediation, and attempts nothing — unless `--force`, which is where the
 * operator's own decision lives.
 *
 * Container work goes through the `ExecutionTarget` contract — `status()` and
 * `exec()` — never a direct `docker exec` spawn, and never a `kind` check. The
 * one deliberate exception is a `scope: "host"` preflight check, which asks the
 * machine holding the `oh` binary rather than the sandbox; that is the whole
 * point of the scope field, and `ExecutionTarget` cannot answer it.
 */

/** Output channels — mirrors `HarnessIO` so tests capture the log and hints. */
export interface RuntimeIO {
  stdout: (s: string) => void;
  stderr: (s: string) => void;
}

/** Options shared by every `oh runtime` verb. */
export interface RuntimeOptions {
  /** Where the equipped-project-root walk starts (default: process.cwd()). */
  cwd?: string;
  /** Subprocess runner. Default: real `spawnSync`. Tests inject a fake. */
  run?: LifecycleRunner;
  /** Emit machine-readable JSON (list/status). */
  json?: boolean;
}

export interface RuntimeInstallOptions extends RuntimeOptions {
  /** Attempt the install even when the preflight says the host cannot run it. */
  force?: boolean;
}

/** One measured requirement. */
interface CheckResult {
  id: string;
  label: string;
  /** Where it was measured — the sandbox, or the machine running `oh`. */
  scope: "host" | "target";
  /** What was actually read, e.g. `2.36`, `absent`, or a daemon version. */
  found: string;
  /** What the runtime needs, e.g. `>= 2.39`. */
  required: string;
  /** `null` when the probe could not run — unknown, NOT failed. */
  ok: boolean | null;
  remediation: string;
}

/** Per-runtime state as reported by `list` / `status`. */
interface RuntimeRow {
  id: string;
  title: string;
  tier: string;
  state: string;
  /** All preflight checks pass. `null` when unmeasured or when there are none. */
  supported: boolean | null;
  /** Is the sandbox running on this runtime right now? */
  active: boolean;
  /** Binary present in the container. `null` for non-installable runtimes. */
  installed: boolean | null;
  installable: boolean;
  checks: CheckResult[];
  docs: string;
  tracking?: string;
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

function requiredOf(check: PreflightCheck): string {
  if (check.id === "glibc") return `>= ${check.minVersion}`;
  if (check.id === "device") return "present";
  return "exit 0";
}

/** An unmeasured check — rendered `?`, never as a failure. */
function unmeasured(check: PreflightCheck): CheckResult {
  return {
    id: check.id,
    label: check.label,
    scope: check.scope,
    found: "?",
    required: requiredOf(check),
    ok: null,
    remediation: check.remediation,
  };
}

/**
 * Run one preflight check.
 *
 * `scope: "host"` runs on the machine holding the `oh` binary, via the injected
 * runner. `scope: "target"` runs inside the sandbox, through `ExecutionTarget`.
 * They are different machines and the distinction is load-bearing: asking the
 * container about the Docker daemon would answer about the wrong kernel.
 *
 * Returns `ok: null` when the probe itself could not run, which renders as `?`.
 * Reporting "unsupported" because we failed to look would be a false negative
 * that sends the operator to fix a blocker they may not have.
 */
async function runCheck(
  target: ExecutionTarget,
  check: PreflightCheck,
  run: LifecycleRunner,
  targetReachable: boolean,
): Promise<CheckResult> {
  const base = {
    id: check.id,
    label: check.label,
    scope: check.scope,
    remediation: check.remediation,
    required: requiredOf(check),
  };

  let exitCode: number;
  let stdout: string;

  if (check.scope === "host") {
    const argv = [...check.probeArgv];
    const r = run(argv[0], argv.slice(1), { stdio: "capture" });
    // A runner that could not spawn reports a null status; that is "unknown".
    if (r.status === null || r.status === undefined) return { ...base, found: "?", ok: null };
    exitCode = r.status;
    stdout = r.stdout ?? "";
  } else {
    if (!targetReachable) return unmeasured(check);
    try {
      const r = await target.exec({
        argv: [...check.probeArgv],
        user: "sandbox",
        stdio: "capture",
      });
      exitCode = r.exitCode;
      stdout = r.stdout;
    } catch (err) {
      if (err instanceof ExecutionSpawnError) return { ...base, found: "?", ok: null };
      throw err;
    }
  }

  if (check.id === "glibc") {
    const version = exitCode === 0 ? parseGlibcVersion(stdout) : undefined;
    if (version === undefined) return { ...base, found: "?", ok: null };
    return {
      ...base,
      found: version,
      ok: compareVersions(version, check.minVersion) >= 0,
    };
  }

  if (check.id === "device") {
    // The probe is `test -e <path>`, so the exit code IS the answer.
    return { ...base, found: exitCode === 0 ? "present" : "absent", ok: exitCode === 0 };
  }

  // `command`: report the first line of stdout, which for a version probe is
  // the version itself — more useful than a bare "ok".
  const first = stdout.trim().split("\n")[0] ?? "";
  return {
    ...base,
    found: exitCode === 0 ? (first !== "" ? first : "ok") : "failed",
    ok: exitCode === 0,
  };
}

/** Is the runtime's binary present inside the container? */
async function probeInstalled(
  target: ExecutionTarget,
  entry: RuntimeEntry,
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
 * false. A runtime with no checks is `null` — "not applicable", never a bare
 * `true`.
 */
function verdict(checks: CheckResult[]): boolean | null {
  if (checks.length === 0) return null;
  if (checks.some((c) => c.ok === false)) return false;
  if (checks.some((c) => c.ok === null)) return null;
  return true;
}

/** Gather the state of every catalog entry (or one, when `only` is given). */
async function collectRows(
  root: string,
  run: LifecycleRunner,
  only?: RuntimeEntry,
): Promise<RuntimeRow[]> {
  const entries = only ? [only] : [...RUNTIME_CATALOG];
  const target = targetFor(root, run);

  let reachable = false;
  try {
    reachable = isReachable(await target.status());
  } catch (err) {
    if (!(err instanceof ExecutionSpawnError)) throw err;
  }

  const rows: RuntimeRow[] = [];
  for (const entry of entries) {
    const checks: CheckResult[] = [];
    for (const check of entry.preflight) {
      checks.push(await runCheck(target, check, run, reachable));
    }
    rows.push({
      id: entry.id,
      title: entry.title,
      tier: entry.tier,
      state: entry.state,
      supported: verdict(checks),
      // The sandbox runs on exactly one runtime, and today that is always the
      // container one. This is a FACT about the running sandbox, not a config
      // read — there is no selector to read (#806 B1), so deriving it from
      // `state: "active"` plus a live container is the honest answer.
      active: entry.state === "active" && reachable,
      installed: reachable ? await probeInstalled(target, entry) : null,
      installable: entry.installable,
      checks,
      docs: entry.docsPath,
      ...(entry.tracking !== undefined ? { tracking: entry.tracking } : {}),
    });
  }
  return rows;
}

/** Render one cell: yes / no / n/a / ? (unmeasured). */
function cell(value: boolean | null, absent: string): string {
  if (value === null) return absent;
  return value ? "yes" : "no";
}

function renderTable(rows: RuntimeRow[], io: RuntimeIO): void {
  const header = ["RUNTIME", "TIER", "STATE", "SUPPORTED", "IN USE"];
  const body = rows.map((r) => [
    r.id,
    r.tier,
    r.state,
    r.checks.length === 0 ? "n/a" : cell(r.supported, "?"),
    r.active ? "yes" : "no",
  ]);
  const widths = header.map((h, i) =>
    Math.max(h.length, ...body.map((b) => b[i].length)),
  );
  const line = (cols: string[]): string =>
    cols.map((c, i) => c.padEnd(widths[i])).join("  ").trimEnd() + "\n";
  io.stdout(line(header));
  for (const row of body) io.stdout(line(row));
  if (rows.some((r) => r.checks.length > 0 && r.supported === null)) {
    io.stdout(
      "\nSUPPORTED is `?` — that requirement could not be measured. Start the sandbox with `oh sandbox`, then re-run.\n",
    );
  }
}

/** `status` adds the measured detail behind each verdict. */
function renderDetail(rows: RuntimeRow[], io: RuntimeIO): void {
  renderTable(rows, io);
  for (const r of rows) {
    if (r.checks.length === 0) continue;
    io.stdout(`\n${r.id} — requirements:\n`);
    for (const c of r.checks) {
      const mark = c.ok === null ? "?" : c.ok ? "OK" : "FAIL";
      io.stdout(
        `  ${c.label.padEnd(10)} ${c.found.padEnd(10)} requires ${c.required.padEnd(9)} [${c.scope}] ${mark}\n`,
      );
      if (c.ok === false) io.stdout(`             ${c.remediation}\n`);
    }
    if (r.installable) io.stdout(`  installed: ${cell(r.installed, "?")}\n`);
    if (r.tracking !== undefined) io.stdout(`  tracked in ${r.tracking} — see ${r.docs}\n`);
    else io.stdout(`  see ${r.docs}\n`);
  }
}

/** `oh runtime list` — every known runtime and its state. */
export async function runRuntimeList(
  opts: RuntimeOptions,
  io: RuntimeIO,
): Promise<number> {
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

/** The unknown-name error, shaped like `oh harness`'s. */
function unknownRuntime(name: string, io: RuntimeIO): number {
  io.stderr(`oh runtime: unknown runtime "${name}"\n\n`);
  io.stderr(`Known runtimes:\n${runtimeIds().map((r) => `  ${r}`).join("\n")}\n`);
  return 1;
}

/** `oh runtime status [name]` — the same data as `list`, plus the measurements. */
export async function runRuntimeStatus(
  name: string | undefined,
  opts: RuntimeOptions,
  io: RuntimeIO,
): Promise<number> {
  const run = opts.run ?? spawnRunner;
  const root = resolveProjectRoot(opts.cwd);

  let only: RuntimeEntry | undefined;
  if (name !== undefined) {
    only = findRuntime(name);
    if (!only) return unknownRuntime(name, io);
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
 * `oh runtime install [name]` — preflight, then install into the running
 * container.
 *
 * ORDER MATTERS, and it is the OPPOSITE of `oh harness install`. That command
 * persists a flag first because the flag is cheap and survives failure. This
 * one has no flag to persist (see the catalog header), so the first action is
 * the measurement — and the measurement is a gate, not a warning.
 */
export async function runRuntimeInstall(
  name: string,
  opts: RuntimeInstallOptions,
  io: RuntimeIO,
): Promise<number> {
  const run = opts.run ?? spawnRunner;
  const root = resolveProjectRoot(opts.cwd);

  const entry = findRuntime(name);
  if (!entry) return unknownRuntime(name, io);

  if (!entry.installable) {
    io.stderr(`oh runtime: ${entry.id} cannot be installed by this command.\n\n`);
    io.stderr(`${entry.notInstallableReason ?? ""}\n`);
    io.stderr(
      entry.tracking !== undefined
        ? `Tracked in ${entry.tracking} — see ${entry.docsPath}\n`
        : `See ${entry.docsPath}\n`,
    );
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
  for (const check of entry.preflight) {
    checks.push(await runCheck(target, check, run, true));
  }
  const supported = verdict(checks);

  if (supported !== true) {
    const failed = checks.filter((c) => c.ok !== true);
    io.stderr(`${entry.id}: not supported on this host — nothing was installed.\n\n`);
    for (const c of failed) {
      io.stderr(`  ${c.label.padEnd(10)} ${c.found.padEnd(10)} requires ${c.required}\n`);
      io.stderr(`             ${c.remediation}\n`);
    }
    if (entry.tracking !== undefined) {
      io.stderr(`\nTracked in ${entry.tracking}. Re-run after the blockers clear,\n`);
      io.stderr("or pass --force to attempt the install anyway.\n");
    } else {
      io.stderr("\nRe-run after the blockers clear, or pass --force to attempt the install anyway.\n");
    }
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
    io.stderr(`oh runtime: installing ${entry.id} failed (exit ${r.exitCode}).\n`);
    io.stderr(`See ${entry.docsPath}${entry.tracking !== undefined ? ` and ${entry.tracking}` : ""}.\n`);
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
