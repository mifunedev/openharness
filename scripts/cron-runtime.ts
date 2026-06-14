// scripts/cron-runtime.ts — minimal cron runtime per SPEC v0.7 §"Croner runtime".
// Reads crons/*.md frontmatter, schedules with croner, runs body as agent prompt.
import { Cron } from "croner";
import { spawn, spawnSync } from "node:child_process";
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
  // When true, a tmux fire that would otherwise log SKIPPED_OVERLAP (overlap:false
  // + a genuinely-live previous run) instead runs in an isolated git worktree under
  // .worktrees/cron/<session>. A fire is then never silently skipped — it either
  // runs (root or worktree) or surfaces a failure (ERR_WORKTREE/ERR_WORKTREE_CAP).
  worktree: boolean;
  agentBin?: string;
  body: string;
  filePath: string;
}

const CRONS_DIR = path.resolve(process.env.CRONS_DIR || "crons");
const PID_FILE = path.join(CRONS_DIR, ".pid");
const LOG_FILE = path.join(CRONS_DIR, ".cron.log");
const AGENT_BIN = process.env.CRON_AGENT_BIN || "claude";
const CRON_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export function isValidCronId(id: string): boolean {
  return CRON_ID_PATTERN.test(id);
}

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
    worktree: fm.worktree === "true",
    agentBin: fm.agent || undefined,
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
    const expectedId = path.basename(f, ".md");
    if (!isValidCronId(entry.id)) {
      logFn(
        isValidCronId(expectedId) ? expectedId : "cron",
        "ID_INVALID",
        `invalid cron id: ${entry.id}`,
      );
      continue;
    }
    if (!isValidCronId(expectedId)) {
      logFn(entry.id, "ID_INVALID", `invalid cron filename id: ${expectedId}`);
      continue;
    }
    if (entry.id !== expectedId) {
      logFn(entry.id, "ID_MISMATCH", `id must match filename: ${expectedId}`);
      continue;
    }
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
  // Overlap pidfile written/removed by the wrapper. Defaults to the id-scoped
  // /tmp/cron-<id>.pid (the primary fire). A worktree-fallback fire passes a
  // session-scoped path so it does not clobber the primary run's lock.
  pidFile?: string;
  // Absolute path of the isolated worktree this fire runs in (worktree-fallback
  // only). Exported as CRON_WORKTREE so the agent knows it is isolated.
  worktree?: string;
}): string {
  const { session, id, agentBin, promptFile } = opts;
  if (!isValidCronId(id)) throw new Error(`invalid cron id: ${id}`);
  const pidFile = opts.pidFile ?? `/tmp/cron-${id}.pid`;
  const worktreeExport = opts.worktree ? ` CRON_WORKTREE=${opts.worktree}` : "";
  return (
    `echo $$ > ${pidFile}; ` +
    `export CRON_TMUX_SESSION=${session} CRON_KEEP_MARKER=/tmp/${session}.keep CRON_OVERLAP_PIDFILE=${pidFile}${worktreeExport}; ` +
    buildCronAgentCommand({
      id,
      agentBin,
      promptFile,
      logFile: `/tmp/${session}.log`,
      resumeFile: `/tmp/${session}.agent`,
      exitOnComplete: false,
    }) +
    `; ` +
    `rm -f ${pidFile}; ` +
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
  if (!isValidCronId(id)) throw new Error(`invalid cron id: ${id}`);
  const exitOrReturn = exitOnComplete ? `exit $status` : `true`;
  const resumeInit = resumeFile ? `printf '%s' ${agentBin} > ${resumeFile}; ` : "";
  const logAgentStart = cronLogCommand(id, "AGENT_START", '"agent=$active_agent"');
  const logAgentDone = cronLogCommand(
    id,
    "AGENT_DONE",
    '"agent=$active_agent exit=$status"',
  );
  if (agentBin === "pi" && resumeFile && !exitOnComplete) {
    return (
      `${resumeInit}` +
      `active_agent=pi; ` +
      logAgentStart +
      `set +e; ` +
      // Pi's attachable TUI must own the tmux pane's tty directly. The
      // headless `-p ... | tee ...` shape is useful for non-tmux jobs, but it
      // renders as an effectively blank pane when a human attaches mid-run.
      `pi "$(cat ${promptFile})"; ` +
      `status=$?; ` +
      logAgentDone +
      exitOrReturn
    );
  }
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

// Max concurrent isolated worktree runs per cron id. worktree:true crons spawn a
// fresh worktree EVERY fire (keeping the root checkout clean), so a genuinely-stuck
// run (e.g. an idle Pi TUI that never exits) would otherwise accumulate a worktree
// every hour. The cap turns runaway growth into a surfaced ERR_WORKTREE_CAP failure
// rather than silent disk/session bloat. Dead-session worktrees are pruned before
// the count, and the heartbeat reaps stuck sessions + their worktrees hourly, so in
// steady state the live count tracks in-flight/kept-for-review runs and stays well
// under this ceiling (aligned with autopilot's 6-PR/day creation cap).
const WORKTREE_MAX_CONCURRENT = 6;

// Liveness probe: signal 0 throws iff the pid is gone (or unsignalable).
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export type OverlapDecision = "run" | "skip" | "worktree";

// Pure fire policy shared by fireTmux and its tests. Decides how a tmux fire
// proceeds given the cron's flags and whether a *live* holder owns the id-scoped
// overlap pidfile:
//   "worktree" — worktree:true → ALWAYS isolate in a fresh .worktrees/cron/<session>
//                worktree, every fire, so the shared root checkout never goes dirty
//                and a fire is never skipped (it runs isolated or fails loudly).
//   "run"      — no live holder of the id lock (no pidfile, or a stale/dead pid) →
//                run in root, reclaiming the id-scoped lock.
//   "skip"     — a live holder and the cron is NOT a worktree cron → SKIPPED_OVERLAP
//                (legacy serialize-on-root behaviour, e.g. heartbeat/cleanup/eval).
// worktree:true takes precedence over overlap/pidfile state: an isolated run shares
// no state with the root or with sibling worktree runs, so the overlap lock is moot.
export function decideOverlap(opts: {
  overlap: boolean;
  worktree: boolean;
  pidfileExists: boolean;
  holderAlive: boolean;
}): OverlapDecision {
  if (opts.worktree) return "worktree";
  if (opts.overlap) return "run";
  if (!opts.pidfileExists || !opts.holderAlive) return "run";
  return "skip";
}

const FALLBACK_WORKTREE_DIR = ".worktrees/cron";

// First existing remote (preferred) or local base branch, mirroring the
// development→main→master precedence in context/rules/git.md. Returns a
// commit-ish suitable for `git worktree add --detach`, or null if none exist.
function detectBaseRef(): string | null {
  for (const ref of ["development", "main", "master"]) {
    if (
      spawnSync("git", ["show-ref", "--verify", "--quiet", `refs/remotes/origin/${ref}`])
        .status === 0
    ) {
      return `origin/${ref}`;
    }
  }
  for (const ref of ["development", "main", "master"]) {
    if (spawnSync("git", ["show-ref", "--verify", "--quiet", `refs/heads/${ref}`]).status === 0) {
      return ref;
    }
  }
  return null;
}

// Absolute working directory of every live tmux pane. This is how worktree
// liveness is judged — NOT by matching the worktree dir name to a tmux session
// name. Autopilot RENAMES its session (cron-autopilot-<ts> → autopilot-<branch>)
// and ship-spec runs its build in a SEPARATE Advisor session (agent-ship-<slug>),
// so a name match would falsely declare an active worktree dead and delete it.
function livePaneCwds(): string[] {
  const r = spawnSync("tmux", ["list-panes", "-a", "-F", "#{pane_current_path}"], {
    encoding: "utf-8",
  });
  if (r.status !== 0 || !r.stdout) return [];
  return r.stdout.split("\n").map((s) => s.trim()).filter(Boolean);
}

// A worktree is "in use" iff some live tmux pane is working inside it (its own
// dir or a descendant).
function worktreeInUse(wtPath: string, cwds: string[]): boolean {
  const abs = path.resolve(wtPath);
  return cwds.some((p) => p === abs || p.startsWith(abs + path.sep));
}

// Remove fallback worktrees that no live tmux pane is working inside (self-healing),
// then return the count still in use. Pane-cwd liveness (above) is robust to the
// autopilot session rename and to the Advisor session sharing the worktree.
function pruneAndCountFallbackWorktrees(id: string): number {
  const dir = path.resolve(FALLBACK_WORKTREE_DIR);
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return 0;
  }
  const cwds = livePaneCwds();
  let live = 0;
  for (const name of names) {
    if (!name.startsWith(`cron-${id}-`)) continue;
    const wt = path.join(dir, name);
    if (worktreeInUse(wt, cwds)) {
      live++;
    } else {
      spawnSync("git", ["worktree", "remove", "--force", wt], { stdio: "ignore" });
    }
  }
  spawnSync("git", ["worktree", "prune"], { stdio: "ignore" });
  return live;
}

// Create an isolated detached worktree at .worktrees/cron/<session> off the base
// branch for a worktree cron's fire. Returns the absolute path, or null after
// logging a FAILURE (ERR_WORKTREE_CAP at/over the cap, ERR_WORKTREE otherwise) —
// the caller must NOT fall back to a skip on null.
function createFallbackWorktree(entry: CronEntry, session: string): string | null {
  const live = pruneAndCountFallbackWorktrees(entry.id);
  if (live >= WORKTREE_MAX_CONCURRENT) {
    log(
      entry.id,
      "ERR_WORKTREE_CAP",
      `${live} live worktree runs >= cap ${WORKTREE_MAX_CONCURRENT}`,
    );
    return null;
  }
  const base = detectBaseRef();
  if (!base) {
    log(entry.id, "ERR_WORKTREE", "no base ref (development/main/master) found");
    return null;
  }
  const dir = path.resolve(FALLBACK_WORKTREE_DIR);
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    /* git worktree add will surface a hard failure below */
  }
  const wtPath = path.join(dir, session);
  const add = spawnSync("git", ["worktree", "add", "--detach", wtPath, base], {
    encoding: "utf-8",
  });
  if (add.status !== 0) {
    log(entry.id, "ERR_WORKTREE", `git worktree add failed: ${(add.stderr || "").trim().slice(0, 150)}`);
    return null;
  }
  return wtPath;
}

function fireTmux(entry: CronEntry): void {
  const session = tmuxSessionName(entry.id, new Date());
  const idPidFile = `/tmp/cron-${entry.id}.pid`;
  let cwd = process.cwd();
  let pidFile = idPidFile;
  let worktree: string | undefined;

  const pidfileExists = fs.existsSync(idPidFile);
  let holderAlive = false;
  if (pidfileExists) {
    const existing = parseInt(fs.readFileSync(idPidFile, "utf-8").trim(), 10);
    holderAlive = !isNaN(existing) && isProcessAlive(existing);
  }
  const decision = decideOverlap({
    overlap: entry.overlap,
    worktree: entry.worktree,
    pidfileExists,
    holderAlive,
  });
  if (decision === "skip") {
    log(entry.id, "SKIPPED_OVERLAP");
    return;
  }
  if (decision === "worktree") {
    const wt = createFallbackWorktree(entry, session);
    if (wt === null) return; // createFallbackWorktree logged the FAILURE; never a skip
    cwd = wt;
    worktree = wt;
    pidFile = `/tmp/${session}.pid`; // session-scoped: do not clobber the live primary lock
  }
  // decision === "run" reclaims the id-scoped lock by simply overwriting the
  // stale/absent pidfile below (the wrapper does `echo $$ > pidFile`).

  const promptFile = `/tmp/${session}.prompt`;
  const agentBin = entry.agentBin || AGENT_BIN;
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
      cwd,
      buildTmuxWrapper({ session, id: entry.id, agentBin, promptFile, pidFile, worktree }),
    ],
    { stdio: "ignore" },
  );
  child.on("error", (e: Error) => log(entry.id, "ERR", String(e)));
  // Detached tmux path: we observe only the spawn, not the agent's eventual
  // exit, so no EXIT_<code> reason tail can be captured here (cf. fire()).
  if (worktree) {
    log(entry.id, "SPAWNED_WORKTREE", `${session} ${worktree}`);
  } else {
    log(entry.id, "SPAWNED", session);
  }
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
  const agentBin = entry.agentBin || AGENT_BIN;
  fs.writeFileSync(promptFile, reloadBody(entry));
  const child = spawn(
    "bash",
    [
      "-lc",
      buildCronAgentCommand({
        id: entry.id,
        agentBin,
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
    if (["SCHED_INVALID", "ID_INVALID", "ID_MISMATCH"].includes(status)) loadSkips++;
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
