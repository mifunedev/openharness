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
  return `${id}-${mm}${dd}-${hh}${min}`;
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
      agentBin,
      promptFile,
      logFile: `/tmp/${session}.log`,
      resumeFile: `/tmp/${session}.agent`,
    }) +
    `; ` +
    `rm -f /tmp/cron-${id}.pid; ` +
    // Kept session: resume the run's own conversation as a live, attachable
    // agent (idle until driven); fall back to a shell if that exits.
    `[ -f /tmp/${session}.keep ] && { ` +
    `if [ "$(cat /tmp/${session}.agent 2>/dev/null || echo ${agentBin})" = codex ]; then codex; else ${agentBin} --continue; fi; ` +
    `exec bash; }`
  );
}

export function buildCronAgentCommand(opts: {
  agentBin: string;
  promptFile: string;
  logFile: string;
  resumeFile?: string;
}): string {
  const { agentBin, promptFile, logFile, resumeFile } = opts;
  const resumeInit = resumeFile ? `printf '%s' ${agentBin} > ${resumeFile}; ` : "";
  if (agentBin !== "claude") {
    return `${resumeInit}${agentBin} -p "$(cat ${promptFile})" 2>&1 | tee ${logFile}`;
  }
  const resumeCodex = resumeFile ? `printf '%s' codex > ${resumeFile}; ` : "";
  return (
    `${resumeInit}` +
    `set +e; ` +
    `set -o pipefail; ` +
    `claude -p "$(cat ${promptFile})" 2>&1 | tee ${logFile}; ` +
    `status=$?; ` +
    `if grep -Eiq '(usage|session|hit (your |the )?limit)' ${logFile} && grep -Eiq '(limit|resets?|/upgrade)' ${logFile}; then ` +
    `echo "cron-runtime: Claude limit detected; retrying with Codex" | tee -a ${logFile}; ` +
    `export RALPH_HARNESS=codex; ` +
    `${resumeCodex}` +
    `codex exec --sandbox danger-full-access "$(cat ${promptFile})" 2>&1 | tee -a ${logFile}; ` +
    `status=$?; ` +
    `fi; ` +
    `exit $status`
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
  const promptFile = `/tmp/cron-${session}.prompt`;
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
  log(entry.id, "SPAWNED", session);
}

function fire(entry: CronEntry): void {
  if (entry.tmux) {
    fireTmux(entry);
    return;
  }
  log(entry.id, "FIRE");
  const session = tmuxSessionName(entry.id, new Date());
  const promptFile = `/tmp/cron-${session}.prompt`;
  const logFile = `/tmp/${session}.log`;
  fs.writeFileSync(promptFile, reloadBody(entry));
  const child = spawn(
    "bash",
    [
      "-lc",
      buildCronAgentCommand({
        agentBin: AGENT_BIN,
        promptFile,
        logFile,
      }),
    ],
    { stdio: "inherit" },
  );
  child.on("exit", (code: number | null) => log(entry.id, code === 0 ? "OK" : `EXIT_${code}`));
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
// construction throw.
function constructCron(entry: CronEntry): void {
  new Cron(
    entry.schedule,
    {
      timezone: entry.timezone,
      protect: !entry.overlap,
      catch: (err: unknown) => onJobError(entry.id, err),
    },
    () => fire(entry),
  );
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
  mkCron: (entry: CronEntry) => void = constructCron,
): BootResult {
  let loadSkips = 0;
  const entries = loadCrons(dir, (id, status, msg) => {
    if (status === "SCHED_INVALID") loadSkips++;
    logFn(id, status, msg);
  });
  let scheduled = 0;
  let constructSkips = 0;
  for (const entry of entries) {
    try {
      mkCron(entry);
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
  scheduleAll();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
