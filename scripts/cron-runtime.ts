// scripts/cron-runtime.ts — minimal cron runtime per SPEC v0.7 §"Croner runtime".
// Reads crons/*.md frontmatter, schedules with croner, runs body as agent prompt.
import { Cron } from "croner";
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

export interface CronEntry {
  id: string;
  schedule: string;
  timezone?: string;
  enabled: boolean;
  overlap: boolean;
  catchup: boolean;
  tmux: boolean;
  body: string;
  filePath: string;
}

const CRONS_DIR = path.resolve(process.env.CRONS_DIR || "crons");
const PID_FILE = path.join(CRONS_DIR, ".pid");
const LOG_FILE = path.join(CRONS_DIR, ".cron.log");
const AGENT_BIN = process.env.CRON_AGENT_BIN || "claude";

export function parseCronFile(content: string, file: string): CronEntry | null {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---\s*\r?\n?([\s\S]*)$/);
  if (!m) return null;
  const fm: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    if (/^\s*#/.test(line) || line.trim() === "") continue;
    const i = line.indexOf(":");
    if (i === -1) continue;
    fm[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  if (!fm.schedule) return null;
  return {
    id: fm.id ?? path.basename(file, ".md"),
    schedule: fm.schedule,
    timezone: fm.timezone || undefined,
    enabled: fm.enabled !== "false",
    overlap: fm.overlap === "true",
    catchup: fm.catchup === "true",
    tmux: fm.tmux === "true",
    body: m[2],
    filePath: file,
  };
}

// Side-effect-free probe: does `schedule` parse as a valid cron expression?
// croner v9.1.0 exposes no static Cron.validate, so we construct a Cron with
// NO callback function and NO `name` option. croner only arms the internal
// setTimeout when a function is passed, and only pushes to its module-level
// named-jobs array when `name` is set — so this probe schedules nothing and
// registers nothing. The constructor parses the pattern and throws
// synchronously on an invalid one; we catch that and return false. `.stop()`
// in the finally is defensive cleanup. Never throws for any string input.
export function isValidSchedule(schedule: string): boolean {
  let probe: Cron | undefined;
  try {
    probe = new Cron(schedule);
    return true;
  } catch {
    return false;
  } finally {
    probe?.stop();
  }
}

// `logFn` defaults to the module-private `log` and exists ONLY for test
// injection (mirrors onJobError(id, err, logFn = log)); it carries no
// external-stability guarantee. Existing loadCrons(dir) call sites stay valid.
export function loadCrons(dir: string = CRONS_DIR, logFn = log): CronEntry[] {
  if (!fs.existsSync(dir)) return [];
  const out: CronEntry[] = [];
  for (const f of fs.readdirSync(dir).filter((n: string) => n.endsWith(".md")).sort()) {
    let entry: CronEntry | null;
    try {
      entry = parseCronFile(fs.readFileSync(path.join(dir, f), "utf-8"), path.join(dir, f));
    } catch {
      /* skip unreadable — silent, distinct from the invalid-schedule path below */
      continue;
    }
    if (!entry || !entry.enabled) continue;
    // Invalid-schedule skip is a DISTINCT path from the silent unreadable-file
    // catch above: it runs after a non-null entry and OUTSIDE that try/catch, and
    // it logs SCHED_INVALID so the misconfiguration surfaces in crons/.cron.log
    // instead of poisoning the entries list and crashing main()'s new Cron() loop.
    if (!isValidSchedule(entry.schedule)) {
      logFn(entry.id, "SCHED_INVALID", `invalid schedule: ${entry.schedule}`);
      continue;
    }
    out.push(entry);
  }
  return out;
}

export function acquireLock(pidFile: string = PID_FILE): boolean {
  if (fs.existsSync(pidFile)) {
    const existing = parseInt(fs.readFileSync(pidFile, "utf-8").trim(), 10);
    if (!isNaN(existing) && existing !== process.pid) {
      try {
        process.kill(existing, 0);
        return false;
      } catch {
        /* stale — fall through */
      }
    }
  }
  fs.mkdirSync(path.dirname(pidFile), { recursive: true });
  fs.writeFileSync(pidFile, String(process.pid));
  return true;
}

export function reloadBody(entry: CronEntry): string {
  let fresh: string | undefined;
  try {
    const parsed = parseCronFile(
      fs.readFileSync(entry.filePath, "utf-8"),
      path.basename(entry.filePath),
    );
    fresh = parsed?.body;
    if (fresh == null) throw new Error("parseCronFile returned no body");
  } catch (e) {
    log(entry.id, "BODY_RELOAD_ERR", `${path.basename(entry.filePath)}: ${String(e)}`);
    return entry.body;
  }
  if (fresh !== entry.body) log(entry.id, "BODY_RELOADED", path.basename(entry.filePath));
  return fresh;
}

function log(id: string, status: string, msg = ""): void {
  const line = `${new Date().toISOString()}\t${id}\t${status}\t${msg.replace(/\s+/g, " ").slice(0, 200)}\n`;
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.appendFileSync(LOG_FILE, line);
  } catch {
    /* best-effort */
  }
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function cronLogCommand(id: string, status: string, msgExpr: string): string {
  return (
    `mkdir -p ${shellQuote(path.dirname(LOG_FILE))}; ` +
    `printf '%s\\t%s\\t%s\\t%s\\n' ` +
    `"$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)" ` +
    `${shellQuote(id)} ${shellQuote(status)} ${msgExpr} >> ${shellQuote(LOG_FILE)}; `
  );
}

// Best-effort tail of a job's tee'd log, used by fire()'s exit handler to
// enrich an EXIT_<code> liveness line with the failing job's trailing output.
// Returns the last `maxChars` characters of the file, or "" when the file is
// missing, empty, or unreadable — it never throws, so log()'s msg.replace()
// can never throw on its result. The 200 default matches log()'s own slice
// cap; the parameter exists for direct test injection (cf. onJobError's logFn)
// and carries no external-stability guarantee.
export function readFailureTail(logFile: string, maxChars = 200): string {
  try {
    return fs.readFileSync(logFile, "utf-8").slice(-maxChars);
  } catch {
    return "";
  }
}

// Croner's `catch` handler for a scheduled job: records a synchronous
// job-callback throw as an ERR_JOB line instead of swallowing it silently.
// `logFn` defaults to the module-private `log` and exists ONLY for test
// injection — onJobError carries no external-stability guarantee.
export function onJobError(id: string, err: unknown, logFn = log): void {
  logFn(id, "ERR_JOB", String(err));
}

export function tmuxSessionName(id: string, now: Date): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  const mm = pad(now.getMonth() + 1);
  const dd = pad(now.getDate());
  const hh = pad(now.getHours());
  const min = pad(now.getMinutes());
  return `cron-${id}-${mm}${dd}-${hh}${min}`;
}

export function buildTmuxWrapper(opts: {
  session: string;
  id: string;
  agentBin: string;
  promptFile: string;
}): string {
  const { session, id, agentBin, promptFile } = opts;
  return (
    `echo $$ > /tmp/cron-${id}.pid; ` +
    `export CRON_TMUX_SESSION=${session} CRON_KEEP_MARKER=/tmp/${session}.keep; ` +
    buildCronAgentCommand({
      id,
      agentBin,
      promptFile,
      logFile: `/tmp/${session}.log`,
      resumeFile: `/tmp/${session}.agent`,
      exitOnComplete: false,
    }) +
    `; ` +
    `rm -f /tmp/cron-${id}.pid; ` +
    // Kept session: resume the run's own conversation as a live, attachable
    // agent (idle until driven); fall back to a shell if that exits.
    `[ -f /tmp/${session}.keep ] && { ` +
    `if [ "$(cat /tmp/${session}.agent 2>/dev/null || echo ${agentBin})" = codex ]; then codex; else ${agentBin} --continue; fi; ` +
    `exec bash; }; ` +
    `exit $status`
  );
}

export function buildCronAgentCommand(opts: {
  id?: string;
  agentBin: string;
  promptFile: string;
  logFile: string;
  resumeFile?: string;
  exitOnComplete?: boolean;
}): string {
  const {
    id = "cron",
    agentBin,
    promptFile,
    logFile,
    resumeFile,
    exitOnComplete = true,
  } = opts;
  const exitOrReturn = exitOnComplete ? `exit $status` : `true`;
  const resumeInit = resumeFile ? `printf '%s' ${agentBin} > ${resumeFile}; ` : "";
  const logAgentStart = cronLogCommand(id, "AGENT_START", '"agent=$active_agent"');
  const logAgentDone = cronLogCommand(
    id,
    "AGENT_DONE",
    '"agent=$active_agent exit=$status"',
  );
  if (agentBin !== "claude") {
    return (
      `${resumeInit}` +
      `active_agent=${shellQuote(agentBin)}; ` +
      logAgentStart +
      `set +e; ` +
      `set -o pipefail; ` +
      `${agentBin} -p "$(cat ${promptFile})" 2>&1 | tee ${logFile}; ` +
      `status=$?; ` +
      logAgentDone +
      exitOrReturn
    );
  }
  const resumeCodex = resumeFile ? `printf '%s' codex > ${resumeFile}; ` : "";
  return (
    `${resumeInit}` +
    `active_agent=claude; ` +
    logAgentStart +
    `set +e; ` +
    `set -o pipefail; ` +
    `claude -p "$(cat ${promptFile})" 2>&1 | tee ${logFile}; ` +
    `status=$?; ` +
    `if grep -Eiq '(usage|session|hit (your |the )?limit)' ${logFile} && grep -Eiq '(limit|resets?|/upgrade)' ${logFile}; then ` +
    `echo "cron-runtime: Claude limit detected; retrying with Codex" | tee -a ${logFile}; ` +
    cronLogCommand(id, "AGENT_FALLBACK", "'from=claude to=codex'") +
    `active_agent=codex; ` +
    `export RALPH_HARNESS=codex; ` +
    `${resumeCodex}` +
    logAgentStart +
    `codex exec --sandbox danger-full-access "$(cat ${promptFile})" 2>&1 | tee -a ${logFile}; ` +
    `status=$?; ` +
    `fi; ` +
    logAgentDone +
    exitOrReturn
  );
}

function fireTmux(entry: CronEntry): void {
  const pidFile = `/tmp/cron-${entry.id}.pid`;
  if (!entry.overlap && fs.existsSync(pidFile)) {
    const existing = parseInt(fs.readFileSync(pidFile, "utf-8").trim(), 10);
    if (!isNaN(existing)) {
      try {
        process.kill(existing, 0);
        log(entry.id, "SKIPPED_OVERLAP");
        return;
      } catch {
        /* stale — fall through */
      }
    }
  }
  const session = tmuxSessionName(entry.id, new Date());
  const promptFile = `/tmp/${session}.prompt`;
  const body = reloadBody(entry);
  fs.writeFileSync(promptFile, body);
  const child = spawn(
    "tmux",
    [
      "new-session",
      "-d",
      "-s",
      session,
      "-c",
      process.cwd(),
      buildTmuxWrapper({ session, id: entry.id, agentBin: AGENT_BIN, promptFile }),
    ],
    { stdio: "ignore" },
  );
  child.on("error", (e: Error) => log(entry.id, "ERR", String(e)));
  // Detached tmux path: we observe only the spawn, not the agent's eventual
  // exit, so no EXIT_<code> reason tail can be captured here (cf. fire()).
  log(entry.id, "SPAWNED", session);
}

function fire(entry: CronEntry): void {
  if (entry.tmux) {
    fireTmux(entry);
    return;
  }
  log(entry.id, "FIRE");
  const session = tmuxSessionName(entry.id, new Date());
  const promptFile = `/tmp/${session}.prompt`;
  const logFile = `/tmp/${session}.log`;
  fs.writeFileSync(promptFile, reloadBody(entry));
  const child = spawn(
    "bash",
    [
      "-lc",
      buildCronAgentCommand({
        id: entry.id,
        agentBin: AGENT_BIN,
        promptFile,
        logFile,
      }),
    ],
    { stdio: "inherit" },
  );
  child.on("exit", (code: number | null) =>
    code === 0
      ? log(entry.id, "OK")
      : log(entry.id, `EXIT_${code}`, readFailureTail(logFile)),
  );
  child.on("error", (e: Error) => log(entry.id, "ERR", String(e)));
}

export interface BootResult {
  scheduled: number;
  skipped: number;
}

// Construct a single live Cron for `entry`. Extracted from main()'s loop so the
// construction is both individually fault-isolatable (scheduleAll wraps each
// call in try/catch) and injectable in tests (scheduleAll takes `mkCron`), so a
// test can drive the loop without arming a real timer or simulate a
// construction throw. Returns the live Cron handle so scheduleAll can register
// it in `activeJobs`, letting a SIGHUP reschedule (US-002) stop the prior
// generation before re-arming.
function constructCron(entry: CronEntry): Cron {
  return new Cron(
    entry.schedule,
    {
      timezone: entry.timezone,
      protect: !entry.overlap,
      catch: (err: unknown) => onJobError(entry.id, err),
    },
    () => fire(entry),
  );
}

// Module-level registry of the live Cron handles armed by scheduleAll's most
// recent call. A SIGHUP reschedule (US-002) stops every handle here before
// re-arming, so a reload never leaves duplicate overlapping timers. It is
// cleared at the START of each scheduleAll() call; only truthy handles are
// registered, so a test injecting a `() => void` mkCron registers nothing.
let activeJobs: Cron[] = [];

// Re-entrancy guard for sighupHandler: true while a reload is in progress so a
// second SIGHUP arriving mid-reload is a safe no-op rather than re-stopping and
// re-arming a half-built generation. Cleared in sighupHandler's finally block.
let reloading = false;

// Test-only seam: clear the module-level activeJobs registry between cases so
// state from one test cannot leak into the next. Carries no external-stability
// guarantee (mirrors loadCrons/onJobError's injection-only seams).
export function resetActiveJobs(): void {
  activeJobs = [];
}

// Load every cron under `dir` and schedule each one, fault-isolating each
// `new Cron()` construction so a residual constructor throw skips only that one
// cron and the loop continues. This construction catch is DEFENSE-IN-DEPTH:
// loadCrons already drops invalid schedules at load time (US-002), so it never
// fires in normal operation — it guards a future load-path bypass or a croner
// edge case. Logs a `BOOT` summary `"<N> scheduled, <M> skipped"` and returns
// the counts. `M` is not double-counted: a cron dropped at load time is counted
// once (loadSkips) and never reaches the construction loop, while a cron that
// survives load but throws at construction is counted once (constructSkips) —
// the two sets are disjoint. `logFn`/`mkCron` exist only for test injection and
// default to the real `log` / `constructCron`.
export function scheduleAll(
  dir: string = CRONS_DIR,
  logFn = log,
  mkCron: (entry: CronEntry) => Cron | void = constructCron,
): BootResult {
  // Clear the prior generation's handles at the START of each call so a reload
  // (US-002) registers only this call's jobs; the prior handles are stopped by
  // the SIGHUP handler before it re-invokes scheduleAll.
  activeJobs = [];
  let loadSkips = 0;
  const entries = loadCrons(dir, (id, status, msg) => {
    if (status === "SCHED_INVALID") loadSkips++;
    logFn(id, status, msg);
  });
  let scheduled = 0;
  let constructSkips = 0;
  for (const entry of entries) {
    try {
      const handle = mkCron(entry);
      // Register only truthy handles: a test's `() => void` mkCron returns
      // undefined and is intentionally not tracked, while the real
      // constructCron returns a live Cron that a reload must later stop.
      if (handle) activeJobs.push(handle);
      scheduled++;
    } catch (err) {
      logFn(entry.id, "SCHED_INVALID", String(err));
      constructSkips++;
    }
  }
  const skipped = loadSkips + constructSkips;
  logFn("system", "BOOT", `${scheduled} scheduled, ${skipped} skipped`);
  return { scheduled, skipped };
}

// SIGHUP reschedule entry point. Stops the prior generation of armed Cron
// handles, then re-reads crons/ and re-arms via scheduleAll() — so schedule
// edits and added/removed crons/*.md files take effect without restarting the
// cron-system session. Exported (not buried in main()) so tests can invoke it
// directly without going through process signals or acquireLock side effects.
//
// .stop() halts a handle's FUTURE fires but cannot kill a callback already in
// flight; a non-tmux fire mid-reload may briefly overlap the new generation.
// That window is best-effort only — croner's overlap guard (protect:!overlap)
// remains the sole protection against concurrent fires. See Non-Goals in the PRD.
//
// Does NOT call process.exit() and does NOT remove the PID file: a reload keeps
// the same process alive (unlike SIGTERM/SIGINT cleanup). The reentrancy lock
// makes a rapid double-SIGHUP safe — the second call is a no-op while the first
// reload is still in progress.
//
// A malformed cron file present during the reload is dropped by scheduleAll's
// loadCrons() path (logged SCHED_INVALID) exactly as at boot, so one bad file
// never crashes the reload — surviving crons stay scheduled. On a successful
// reschedule the handler emits one `RELOAD` liveness line via the private log()
// helper (id "system", matching the BOOT precedent) reusing scheduleAll's
// disjoint scheduled/skipped counts — no inline appendFileSync, no duplicated
// format.
export function sighupHandler(): void {
  if (reloading) return;
  reloading = true;
  try {
    for (const job of activeJobs) {
      try {
        job.stop();
      } catch {
        /* best-effort: a handle that fails to stop must not abort the reload */
      }
    }
    const { scheduled, skipped } = scheduleAll();
    log("system", "RELOAD", `${scheduled} scheduled, ${skipped} skipped`);
  } finally {
    reloading = false;
  }
}

function main(): void {
  if (!acquireLock()) {
    process.stderr.write("cron-runtime: another instance is running\n");
    process.exit(1);
  }
  const cleanup = (): void => {
    try {
      fs.unlinkSync(PID_FILE);
    } catch {
      /* already gone */
    }
    process.exit(0);
  };
  process.on("SIGTERM", cleanup);
  process.on("SIGINT", cleanup);
  // Defer the reschedule out of the signal-callback context via setImmediate so
  // its synchronous file I/O (loadCrons readdir/readFile) runs on the next tick
  // rather than inside the OS signal handler. SIGHUP reloads; it never exits.
  process.on("SIGHUP", () => setImmediate(sighupHandler));
  scheduleAll();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
