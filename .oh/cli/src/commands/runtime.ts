import {
  ExecutionSpawnError,
  resolveExecutionTarget,
} from "../lib/execution/index.js";
import { spawnRunner, type LifecycleRunner } from "../lib/execution/runner.js";
import type { ExecutionTarget } from "../lib/execution/target.js";
import { sourceDocsUrl } from "../lib/docs.js";
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


export interface RuntimeIO {
  stdout: (s: string) => void;
  stderr: (s: string) => void;
}

export interface RuntimeOptions {
  cwd?: string;
  run?: LifecycleRunner;
  json?: boolean;
  env?: NodeJS.ProcessEnv;
}

export interface RuntimeInstallOptions extends RuntimeOptions {
  force?: boolean;
}

interface CheckResult {
  id: string;
  label: string;
  scope: "host" | "target";
  found: string;
  required: string;
  ok: boolean | null;
  remediation: string;
}

interface RuntimeRow {
  id: string;
  title: string;
  tier: string;
  state: string;
  supported: boolean | null;
  active: boolean;
  installed: boolean | null;
  installable: boolean;
  checks: CheckResult[];
  docs: string;
  tracking?: string;
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

function requiredOf(check: PreflightCheck): string {
  if (check.id === "glibc") return `>= ${check.minVersion}`;
  if (check.id === "device") return "present";
  return "exit 0";
}

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

async function runCheck(
  target: ExecutionTarget,
  check: PreflightCheck,
  run: LifecycleRunner,
  targetReachable: boolean,
  hostMeasurable: boolean,
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
    if (!hostMeasurable) return unmeasured(check);
    const argv = [...check.probeArgv];
    const r = run(argv[0], argv.slice(1), { stdio: "capture" });
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
    return { ...base, found: exitCode === 0 ? "present" : "absent", ok: exitCode === 0 };
  }

  const first = stdout.trim().split("\n")[0] ?? "";
  return {
    ...base,
    found: exitCode === 0 ? (first !== "" ? first : "ok") : "failed",
    ok: exitCode === 0,
  };
}

async function probeInstalled(
  target: ExecutionTarget,
  entry: RuntimeEntry,
): Promise<boolean | null> {
  if (entry.verifyArgv === undefined) return null;
  try {
    const r = await target.exec({
      argv: [...entry.verifyArgv],
      user: "sandbox",
      stdio: "capture",
    });
    return r.exitCode === 0;
  } catch (err) {
    if (err instanceof ExecutionSpawnError) return null;
    throw err;
  }
}

function verdict(checks: CheckResult[]): boolean | null {
  if (checks.length === 0) return null;
  if (checks.some((c) => c.ok === false)) return false;
  if (checks.some((c) => c.ok === null)) return null;
  return true;
}

async function collectRows(
  root: string,
  run: LifecycleRunner,
  env?: NodeJS.ProcessEnv,
  only?: RuntimeEntry,
): Promise<{ rows: RuntimeRow[]; insideSandbox: boolean }> {
  const entries = only ? [only] : [...RUNTIME_CATALOG];
  const target = targetFor(root, run, env);
  const hostMeasurable = target.kind !== "local";

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
      checks.push(await runCheck(target, check, run, reachable, hostMeasurable));
    }
    rows.push({
      id: entry.id,
      title: entry.title,
      tier: entry.tier,
      state: entry.state,
      supported: verdict(checks),
      active: entry.state === "active" && reachable,
      installed: reachable ? await probeInstalled(target, entry) : null,
      installable: entry.installable,
      checks,
      docs: sourceDocsUrl(entry.docsPath),
      ...(entry.tracking !== undefined ? { tracking: entry.tracking } : {}),
    });
  }
  return { rows, insideSandbox: !hostMeasurable };
}

function cell(value: boolean | null, absent: string): string {
  if (value === null) return absent;
  return value ? "yes" : "no";
}

function renderTable(rows: RuntimeRow[], io: RuntimeIO, insideSandbox: boolean): void {
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
      insideSandbox
        ? "\nSUPPORTED is `?` — a host requirement cannot be measured from inside the sandbox. Re-run on the host.\n"
        : "\nSUPPORTED is `?` — that requirement could not be measured. Start the sandbox with `oh sandbox`, then re-run.\n",
    );
  }
}

function renderDetail(rows: RuntimeRow[], io: RuntimeIO, insideSandbox: boolean): void {
  renderTable(rows, io, insideSandbox);
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

export async function runRuntimeList(
  opts: RuntimeOptions,
  io: RuntimeIO,
): Promise<number> {
  const run = opts.run ?? spawnRunner;
  const root = resolveProjectRoot(opts.cwd);
  const { rows, insideSandbox } = await collectRows(root, run, opts.env);
  if (opts.json) {
    io.stdout(`${JSON.stringify(rows, null, 2)}\n`);
  } else {
    renderTable(rows, io, insideSandbox);
  }
  return 0;
}

function unknownRuntime(name: string, io: RuntimeIO): number {
  io.stderr(`oh runtime: unknown runtime "${name}"\n\n`);
  io.stderr(`Known runtimes:\n${runtimeIds().map((r) => `  ${r}`).join("\n")}\n`);
  return 1;
}

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

  const { rows, insideSandbox } = await collectRows(root, run, opts.env, only);
  if (opts.json) {
    io.stdout(`${JSON.stringify(only ? rows[0] : rows, null, 2)}\n`);
  } else {
    renderDetail(rows, io, insideSandbox);
  }
  return 0;
}

export async function runRuntimeInstall(
  name: string,
  opts: RuntimeInstallOptions,
  io: RuntimeIO,
): Promise<number> {
  const run = opts.run ?? spawnRunner;
  const root = resolveProjectRoot(opts.cwd);

  const entry = findRuntime(name);
  if (!entry) return unknownRuntime(name, io);
  const docsUrl = sourceDocsUrl(entry.docsPath);

  if (!entry.installable) {
    io.stderr(`oh runtime: ${entry.id} cannot be installed by this command.\n\n`);
    io.stderr(`${entry.notInstallableReason ?? ""}\n`);
    io.stderr(
      entry.tracking !== undefined
        ? `Tracked in ${entry.tracking} — see ${docsUrl}\n`
        : `See ${docsUrl}\n`,
    );
    return 1;
  }

  const target = targetFor(root, run, opts.env);
  if (target.kind === "local") {
    io.stderr(
      "oh runtime install changes the sandbox\u2019s Docker configuration and must run on the host, at the project root.\n",
    );
    return 1;
  }

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

  const checks: CheckResult[] = [];
  for (const check of entry.preflight) {
    checks.push(await runCheck(target, check, run, true, true));
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

  io.stdout(`installing ${entry.title} into the sandbox…\n`);
  const r = await target.exec({
    argv: [...(entry.installArgv ?? [])],
    user: entry.installUser ?? "sandbox",
    stdio: "inherit",
  });
  if (r.exitCode !== 0) {
    io.stderr(`oh runtime: installing ${entry.id} failed (exit ${r.exitCode}).\n`);
    io.stderr(`See ${docsUrl}${entry.tracking !== undefined ? ` and ${entry.tracking}` : ""}.\n`);
    return r.exitCode;
  }

  if (entry.doctorArgv !== undefined) {
    const doctor = await target.exec({
      argv: [...entry.doctorArgv],
      user: entry.installUser ?? "sandbox",
      stdio: "capture",
    });
    if (doctor.exitCode !== 0) {
      io.stdout(
        `${entry.id}: installed, but \`${entry.doctorArgv.join(" ")}\` exited ${doctor.exitCode}.\n` +
          `See ${docsUrl} for the round-trip check.\n`,
      );
      return 0;
    }
  }

  io.stdout(`${entry.id}: installed — see ${docsUrl}\n`);
  return 0;
}
