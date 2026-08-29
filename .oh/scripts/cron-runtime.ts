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
  worktree: boolean;
  agentBin?: string;
  preflight?: string;
  repo?: string;
  body: string;
  filePath: string;
}

const CRONS_DIR = path.resolve("crons");
const WORKTREES_DIR = ".worktrees";
const PID_FILE = path.join(CRONS_DIR, ".pid");
const LOG_FILE = path.join(CRONS_DIR, ".cron.log");
const AGENT_BIN = process.env.CRON_AGENT_BIN || "claude";
const CRON_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const AGENT_BIN_PATTERN = /^[A-Za-z0-9_./-]+$/;
const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const REMOTE_PATTERN = /^[A-Za-z0-9_.-]+$/;

export function isValidCronId(id: string): boolean {
  return CRON_ID_PATTERN.test(id);
}

export function isValidAgentBin(agentBin: string): boolean {
  return (
    agentBin.length > 0 &&
    !agentBin.startsWith("-") &&
    !agentBin.includes("..") &&
    AGENT_BIN_PATTERN.test(agentBin)
  );
}

export function isValidRepo(repo: string): boolean {
  return (
    repo.length > 0 &&
    !repo.startsWith("-") &&
    !repo.includes("..") &&
    REPO_PATTERN.test(repo)
  );
}

export function isValidRemote(remote: string): boolean {
  return (
    remote.length > 0 &&
    !remote.startsWith("-") &&
    !remote.includes("..") &&
    REMOTE_PATTERN.test(remote)
  );
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
    preflight: fm.preflight || undefined,
    repo: fm.repo || undefined,
    body: m[2],
    filePath: path.resolve(file),
  };
}

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

export function loadCrons(dir: string = CRONS_DIR, logFn = log): CronEntry[] {
  if (!fs.existsSync(dir)) return [];
  const out: CronEntry[] = [];
  for (const f of fs.readdirSync(dir).filter((n: string) => n.endsWith(".md")).sort()) {
    let entry: CronEntry | null;
    try {
      entry = parseCronFile(fs.readFileSync(path.join(dir, f), "utf-8"), path.join(dir, f));
    } catch {
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
    if (entry.agentBin && !isValidAgentBin(entry.agentBin)) {
      logFn(entry.id, "AGENT_INVALID", `invalid agent: ${entry.agentBin}`);
      continue;
    }
    if (entry.repo && !isValidRepo(entry.repo)) {
      logFn(entry.id, "REPO_INVALID", `invalid repo: ${entry.repo}`);
      continue;
    }
    if (!isValidSchedule(entry.schedule)) {
      logFn(entry.id, "SCHED_INVALID", `invalid schedule: ${entry.schedule}`);
      continue;
    }
    out.push(entry);
  }
  return out;
}

export function acquireLock(pidFile: string = PID_FILE): boolean {
  fs.mkdirSync(path.dirname(pidFile), { recursive: true });

  while (true) {
    try {
      fs.writeFileSync(pidFile, String(process.pid), { flag: "wx" });
      return true;
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err.code !== "EEXIST") throw e;
    }

    let existingRaw: string;
    try {
      existingRaw = fs.readFileSync(pidFile, "utf-8").trim();
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err.code === "ENOENT") continue;
      throw e;
    }

    const existing = parseInt(existingRaw, 10);
    if (!isNaN(existing)) {
      if (existing === process.pid) return true;
      try {
        process.kill(existing, 0);
        return false;
      } catch {
      }
    }

    try {
      fs.unlinkSync(pidFile);
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err.code !== "ENOENT") throw e;
    }
  }
}

const FIRE_RELOAD_FIELDS: (keyof CronEntry)[] = [
  "schedule",
  "timezone",
  "enabled",
  "overlap",
  "catchup",
  "tmux",
  "worktree",
  "agentBin",
  "preflight",
  "repo",
];

export function reloadEntryForFire(entry: CronEntry, logFn = log): CronEntry | null {
  let fresh: CronEntry | null;
  try {
    fresh = parseCronFile(
      fs.readFileSync(entry.filePath, "utf-8"),
      entry.filePath,
    );
  } catch (e) {
    logFn(entry.id, "CONFIG_RELOAD_ERR", `${path.basename(entry.filePath)}: ${String(e)}`);
    return null;
  }
  if (!fresh) {
    logFn(entry.id, "CONFIG_RELOAD_ERR", `${path.basename(entry.filePath)}: unparseable cron`);
    return null;
  }
  const expectedId = path.basename(entry.filePath, ".md");
  if (!fresh.enabled) {
    logFn(entry.id, "CONFIG_RELOAD_DISABLED", path.basename(entry.filePath));
    return null;
  }
  if (fresh.id !== entry.id || fresh.id !== expectedId || !isValidCronId(fresh.id)) {
    logFn(entry.id, "CONFIG_RELOAD_ERR", `id mismatch: ${fresh.id} expected ${entry.id}`);
    return null;
  }
  if (fresh.agentBin && !isValidAgentBin(fresh.agentBin)) {
    logFn(entry.id, "AGENT_INVALID", `invalid agent: ${fresh.agentBin}`);
    return null;
  }
  if (fresh.repo && !isValidRepo(fresh.repo)) {
    logFn(entry.id, "REPO_INVALID", `invalid repo: ${fresh.repo}`);
    return null;
  }
  if (!isValidSchedule(fresh.schedule)) {
    logFn(entry.id, "SCHED_INVALID", `invalid schedule: ${fresh.schedule}`);
    return null;
  }
  const changed = FIRE_RELOAD_FIELDS.filter((field) => fresh[field] !== entry[field]);
  if (changed.length > 0) {
    logFn(entry.id, "ENTRY_RELOADED", `${path.basename(entry.filePath)}: ${changed.join(",")}`);
  }
  return { ...fresh, filePath: entry.filePath, body: entry.body };
}

export function reloadBody(entry: CronEntry): string {
  let fresh: string | undefined;
  try {
    const parsed = parseCronFile(
      fs.readFileSync(entry.filePath, "utf-8"),
      entry.filePath,
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

function repoFromRemoteUrl(url: string): string | null {
  const trimmed = url.trim().replace(/\.git$/, "");
  const match =
    trimmed.match(/github\.com[:/]([^/\s]+\/[^/\s]+)$/) ||
    trimmed.match(/^([^/\s]+\/[^/\s]+)$/);
  return match ? match[1].toLowerCase() : null;
}

export function remoteForRepo(repo: string): string | undefined {
  if (!isValidRepo(repo)) return undefined;
  const want = repo.toLowerCase();
  const r = spawnSync("git", ["remote", "-v"], { encoding: "utf-8" });
  if (r.status !== 0 || !r.stdout) return undefined;
  for (const line of r.stdout.split("\n")) {
    const m = line.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)$/);
    if (!m) continue;
    if (repoFromRemoteUrl(m[2]) === want && isValidRemote(m[1])) return m[1];
  }
  return undefined;
}

export function readFailureTail(logFile: string, maxChars = 200): string {
  try {
    return fs.readFileSync(logFile, "utf-8").slice(-maxChars);
  } catch {
    return "";
  }
}

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
  pidFile?: string;
  worktree?: string;
  repo?: string;
  remote?: string;
}): string {
  const { session, id, agentBin, promptFile } = opts;
  if (!isValidCronId(id)) throw new Error(`invalid cron id: ${id}`);
  if (!isValidAgentBin(agentBin)) throw new Error(`invalid agent bin: ${agentBin}`);
  if (opts.repo && !isValidRepo(opts.repo)) throw new Error(`invalid repo: ${opts.repo}`);
  if (opts.remote && !isValidRemote(opts.remote)) throw new Error(`invalid remote: ${opts.remote}`);
  const pidFile = opts.pidFile ?? `/tmp/cron-${id}.pid`;
  const quotedAgent = shellQuote(agentBin);
  const quotedPidFile = shellQuote(pidFile);
  const worktreeExport = opts.worktree ? ` CRON_WORKTREE=${shellQuote(opts.worktree)}` : "";
  const repoExport = opts.repo ? ` CRON_REPO=${shellQuote(opts.repo)}` : "";
  const remoteExport = opts.remote ? ` CRON_REMOTE=${shellQuote(opts.remote)}` : "";
  return (
    `echo $$ > ${quotedPidFile}; ` +
    `export CRON_TMUX_SESSION=${shellQuote(session)} CRON_KEEP_MARKER=${shellQuote(`/tmp/${session}.keep`)} CRON_OVERLAP_PIDFILE=${quotedPidFile}${worktreeExport}${repoExport}${remoteExport}; ` +
    buildCronAgentCommand({
      id,
      agentBin,
      promptFile,
      logFile: `/tmp/${session}.log`,
      resumeFile: `/tmp/${session}.agent`,
      exitOnComplete: false,
      repo: opts.repo,
      remote: opts.remote,
    }) +
    `; ` +
    `rm -f ${quotedPidFile}; ` +
    `[ -f ${shellQuote(`/tmp/${session}.keep`)} ] && { ` +
    `if [ "$(cat ${shellQuote(`/tmp/${session}.agent`)} 2>/dev/null || echo ${quotedAgent})" = codex ]; then codex; else ${quotedAgent} --continue; fi; ` +
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
  repo?: string;
  remote?: string;
}): string {
  const {
    id = "cron",
    agentBin,
    promptFile,
    logFile,
    resumeFile,
    exitOnComplete = true,
    repo,
    remote,
  } = opts;
  if (!isValidCronId(id)) throw new Error(`invalid cron id: ${id}`);
  if (!isValidAgentBin(agentBin)) throw new Error(`invalid agent bin: ${agentBin}`);
  if (repo && !isValidRepo(repo)) throw new Error(`invalid repo: ${repo}`);
  if (remote && !isValidRemote(remote)) throw new Error(`invalid remote: ${remote}`);
  const quotedAgent = shellQuote(agentBin);
  const quotedPromptFile = shellQuote(promptFile);
  const quotedLogFile = shellQuote(logFile);
  const exitOrReturn = exitOnComplete ? `exit $status` : `true`;
  const envExport =
    (repo ? `export CRON_REPO=${shellQuote(repo)}; ` : "") +
    (remote ? `export CRON_REMOTE=${shellQuote(remote)}; ` : "");
  const resumeInit = resumeFile
    ? `printf '%s' ${quotedAgent} > ${shellQuote(resumeFile)}; `
    : "";
  const logAgentStart = cronLogCommand(id, "AGENT_START", '"agent=$active_agent"');
  const logAgentDone = cronLogCommand(
    id,
    "AGENT_DONE",
    '"agent=$active_agent exit=$status"',
  );
  if (agentBin === "pi" && resumeFile && !exitOnComplete) {
    return (
      envExport +
      `${resumeInit}` +
      `active_agent=pi; ` +
      logAgentStart +
      `set +e; ` +
      `${quotedAgent} "$(cat ${quotedPromptFile})"; ` +
      `status=$?; ` +
      logAgentDone +
      exitOrReturn
    );
  }
  if (agentBin !== "claude") {
    return (
      envExport +
      `${resumeInit}` +
      `active_agent=${quotedAgent}; ` +
      logAgentStart +
      `set +e; ` +
      `set -o pipefail; ` +
      `${quotedAgent} -p "$(cat ${quotedPromptFile})" 2>&1 | tee ${quotedLogFile}; ` +
      `status=$?; ` +
      logAgentDone +
      exitOrReturn
    );
  }
  const resumeCodex = resumeFile
    ? `printf '%s' codex > ${shellQuote(resumeFile)}; `
    : "";
  return (
    envExport +
    `${resumeInit}` +
    `active_agent=claude; ` +
    logAgentStart +
    `set +e; ` +
    `set -o pipefail; ` +
    `claude -p "$(cat ${quotedPromptFile})" 2>&1 | tee ${quotedLogFile}; ` +
    `status=$?; ` +
    `if grep -Eiq '(usage|session|hit (your |the )?limit)' ${quotedLogFile} && grep -Eiq '(limit|resets?|/upgrade)' ${quotedLogFile}; then ` +
    `echo "cron-runtime: Claude limit detected; retrying with Codex" | tee -a ${quotedLogFile}; ` +
    cronLogCommand(id, "AGENT_FALLBACK", "'from=claude to=codex'") +
    `active_agent=codex; ` +
    `${resumeCodex}` +
    logAgentStart +
    `codex exec --sandbox danger-full-access "$(cat ${quotedPromptFile})" 2>&1 | tee -a ${quotedLogFile}; ` +
    `status=$?; ` +
    `fi; ` +
    logAgentDone +
    exitOrReturn
  );
}

const WORKTREE_MAX_CONCURRENT = 6;

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export type OverlapDecision = "run" | "skip" | "worktree";

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

const FALLBACK_WORKTREE_DIR = path.join(WORKTREES_DIR, "cron");

function detectBaseRef(remote = "origin"): string | null {
  if (!isValidRemote(remote)) return null;
  for (const ref of ["development", "main", "master"]) {
    if (
      spawnSync("git", ["show-ref", "--verify", "--quiet", `refs/remotes/${remote}/${ref}`])
        .status === 0
    ) {
      return `${remote}/${ref}`;
    }
  }
  for (const ref of ["development", "main", "master"]) {
    if (spawnSync("git", ["show-ref", "--verify", "--quiet", `refs/heads/${ref}`]).status === 0) {
      return ref;
    }
  }
  return null;
}

function livePaneCwds(): string[] {
  const r = spawnSync("tmux", ["list-panes", "-a", "-F", "#{pane_current_path}"], {
    encoding: "utf-8",
  });
  if (r.status !== 0 || !r.stdout) return [];
  return r.stdout.split("\n").map((s) => s.trim()).filter(Boolean);
}

function liveTmuxSessionNames(): string[] {
  const r = spawnSync("tmux", ["ls", "-F", "#{session_name}"], { encoding: "utf-8" });
  if (r.status !== 0 || !r.stdout) return [];
  return r.stdout.split("\n").map((s) => s.trim()).filter(Boolean);
}

export function worktreeInUse(
  wtPath: string,
  cwds: string[],
  sessionNames: string[] = liveTmuxSessionNames(),
): boolean {
  const abs = path.resolve(wtPath);
  return (
    cwds.some((p) => p === abs || p.startsWith(abs + path.sep)) ||
    sessionNames.includes(path.basename(abs))
  );
}

export interface FallbackWorktreeState {
  dirty: boolean;
  ref: string;
  changes: string[];
  reason?: string;
  orphaned?: boolean;
}

function isOrphanedWorktree(wtPath: string): boolean {
  const dotGit = path.join(wtPath, ".git");
  let raw: string;
  try {
    const st = fs.statSync(dotGit);
    if (!st.isFile()) return false;
    raw = fs.readFileSync(dotGit, "utf-8");
  } catch {
    return false;
  }
  const match = /^gitdir:\s*(.+?)\s*$/m.exec(raw);
  if (!match) return false;
  const admin = path.resolve(path.dirname(dotGit), match[1]);
  return !fs.existsSync(admin);
}

function worktreeRef(wtPath: string): string {
  const branch = spawnSync("git", ["-C", wtPath, "rev-parse", "--abbrev-ref", "HEAD"], {
    encoding: "utf-8",
  });
  const name = (branch.stdout || "").trim();
  if (branch.status === 0 && name && name !== "HEAD") return name;

  const head = spawnSync("git", ["-C", wtPath, "rev-parse", "--short", "HEAD"], {
    encoding: "utf-8",
  });
  return head.status === 0 && head.stdout.trim() ? head.stdout.trim() : "unknown";
}

export function inspectFallbackWorktree(wtPath: string): FallbackWorktreeState {
  const status = spawnSync("git", ["-C", wtPath, "status", "--porcelain"], {
    encoding: "utf-8",
  });
  const ref = worktreeRef(wtPath);
  if (status.status !== 0) {
    const reason = (status.stderr || status.error?.message || "git status failed").trim();
    if (isOrphanedWorktree(wtPath)) {
      return { dirty: false, orphaned: true, ref, changes: [], reason };
    }
    return { dirty: true, ref, changes: [], reason };
  }

  const changes = (status.stdout || "").split("\n").map((s) => s.trim()).filter(Boolean);
  return { dirty: changes.length > 0, ref, changes };
}

function formatWorktreeChanges(state: FallbackWorktreeState): string {
  if (state.reason) return `status-unavailable=${state.reason.slice(0, 160)}`;
  const shown = state.changes.slice(0, 20).join("; ");
  const suffix = state.changes.length > 20 ? `; +${state.changes.length - 20} more` : "";
  return shown + suffix;
}

export function pruneAndCountFallbackWorktrees(id: string): number {
  const dir = path.resolve(FALLBACK_WORKTREE_DIR);
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return 0;
  }
  const cwds = livePaneCwds();
  const sessionNames = liveTmuxSessionNames();
  let live = 0;
  for (const name of names) {
    if (!name.startsWith(`cron-${id}-`)) continue;
    const wt = path.join(dir, name);
    if (worktreeInUse(wt, cwds, sessionNames)) {
      live++;
      continue;
    }

    const state = inspectFallbackWorktree(wt);
    if (state.orphaned) {
      log(id, "WORKTREE_ORPHANED", `${wt} ref=${state.ref} reason=${(state.reason ?? "").slice(0, 160)}`);
      try {
        fs.rmSync(wt, { recursive: true, force: true });
      } catch (err) {
        log(id, "WORKTREE_ORPHAN_RM_FAILED", `${wt} ${String(err).slice(0, 160)}`);
      }
      continue;
    }
    if (state.dirty) {
      log(id, "WORKTREE_DIRTY", `${wt} ref=${state.ref} changes=${formatWorktreeChanges(state)}`);
      continue;
    }

    spawnSync("git", ["worktree", "remove", "--force", wt], { stdio: "ignore" });
  }
  spawnSync("git", ["worktree", "prune"], { stdio: "ignore" });
  return live;
}

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
  const remote = entry.repo ? remoteForRepo(entry.repo) : undefined;
  if (entry.repo && !remote) {
    log(entry.id, "REPO_REMOTE_MISSING", `no local remote for ${entry.repo}`);
    return null;
  }
  const base = detectBaseRef(remote || "origin");
  if (!base) {
    log(entry.id, "ERR_WORKTREE", "no base ref (development/main/master) found");
    return null;
  }
  const dir = path.resolve(FALLBACK_WORKTREE_DIR);
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
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
  const agentBin = entry.agentBin || AGENT_BIN;
  if (!isValidAgentBin(agentBin)) {
    log(entry.id, "AGENT_INVALID", `invalid agent: ${agentBin}`);
    return;
  }
  const repoRemote = entry.repo ? remoteForRepo(entry.repo) : undefined;
  if (entry.repo && !repoRemote) {
    log(entry.id, "REPO_REMOTE_MISSING", `no local remote for ${entry.repo}`);
    return;
  }

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
    if (wt === null) return;
    cwd = wt;
    worktree = wt;
    pidFile = `/tmp/${session}.pid`;
  }

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
      cwd,
      buildTmuxWrapper({
        session,
        id: entry.id,
        agentBin,
        promptFile,
        pidFile,
        worktree,
        repo: entry.repo,
        remote: repoRemote,
      }),
    ],
    { stdio: "ignore" },
  );
  child.on("error", (e: Error) => log(entry.id, "ERR", String(e)));
  if (worktree) {
    log(entry.id, "SPAWNED_WORKTREE", `${session} ${worktree}`);
  } else {
    log(entry.id, "SPAWNED", session);
  }
}

const PREFLIGHT_TIMEOUT_MS = 60_000;

export function runPreflight(
  entry: CronEntry,
  timeoutMs: number = PREFLIGHT_TIMEOUT_MS,
): { status: number; reason: string } {
  const scriptPath = entry.preflight;
  if (!scriptPath || !isValidAgentBin(scriptPath)) {
    log(entry.id, "PREFLIGHT_ERROR", `invalid preflight: ${scriptPath}`);
    return { status: 12, reason: "preflight-error: invalid-path" };
  }
  const abs = path.resolve(process.cwd(), scriptPath);
  const repoRemote = entry.repo ? remoteForRepo(entry.repo) : undefined;
  if (entry.repo && !repoRemote) {
    log(entry.id, "REPO_REMOTE_MISSING", `no local remote for ${entry.repo}`);
  }
  const r = spawnSync(abs, [], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...(entry.repo ? { CRON_REPO: entry.repo } : {}),
      ...(repoRemote ? { CRON_REMOTE: repoRemote } : {}),
    },
    encoding: "utf-8",
    timeout: timeoutMs,
  });
  if (r.error || typeof r.status !== "number") {
    log(
      entry.id,
      "PREFLIGHT_ERROR",
      `${scriptPath}: ${r.error ? String(r.error) : "no exit status"}`,
    );
    return { status: 12, reason: "preflight-error: exec-error" };
  }
  const out = (r.stdout || "").trim();
  const reason = out ? out.split("\n").pop()!.trim() : `exit ${r.status}`;
  return { status: r.status, reason };
}

export function fire(entry: CronEntry): void {
  const liveEntry = reloadEntryForFire(entry);
  if (!liveEntry) return;
  if (liveEntry.preflight) {
    const { status, reason } = runPreflight(liveEntry);
    if (status !== 0) {
      log(liveEntry.id, "SKIPPED_PREFLIGHT", reason);
      return;
    }
  }
  if (liveEntry.tmux) {
    fireTmux(liveEntry);
    return;
  }
  log(liveEntry.id, "FIRE");
  const session = tmuxSessionName(liveEntry.id, new Date());
  const promptFile = `/tmp/${session}.prompt`;
  const logFile = `/tmp/${session}.log`;
  const agentBin = liveEntry.agentBin || AGENT_BIN;
  if (!isValidAgentBin(agentBin)) {
    log(liveEntry.id, "AGENT_INVALID", `invalid agent: ${agentBin}`);
    return;
  }
  const repoRemote = liveEntry.repo ? remoteForRepo(liveEntry.repo) : undefined;
  if (liveEntry.repo && !repoRemote) {
    log(liveEntry.id, "REPO_REMOTE_MISSING", `no local remote for ${liveEntry.repo}`);
    return;
  }
  fs.writeFileSync(promptFile, reloadBody(liveEntry));
  const child = spawn(
    "bash",
    [
      "-lc",
      buildCronAgentCommand({
        id: liveEntry.id,
        agentBin,
        promptFile,
        logFile,
        repo: liveEntry.repo,
        remote: repoRemote,
      }),
    ],
    { stdio: "inherit" },
  );
  child.on("exit", (code: number | null) =>
    code === 0
      ? log(liveEntry.id, "OK")
      : log(liveEntry.id, `EXIT_${code}`, readFailureTail(logFile)),
  );
  child.on("error", (e: Error) => log(liveEntry.id, "ERR", String(e)));
}

export interface BootResult {
  scheduled: number;
  skipped: number;
}

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

let activeJobs: Cron[] = [];

let reloading = false;

export function resetActiveJobs(): void {
  activeJobs = [];
}

export function scheduleAll(
  dir: string = CRONS_DIR,
  logFn = log,
  mkCron: (entry: CronEntry) => Cron | void = constructCron,
): BootResult {
  activeJobs = [];
  let loadSkips = 0;
  const entries = loadCrons(dir, (id, status, msg) => {
    if (["SCHED_INVALID", "ID_INVALID", "ID_MISMATCH", "AGENT_INVALID", "REPO_INVALID"].includes(status)) loadSkips++;
    logFn(id, status, msg);
  });
  let scheduled = 0;
  let constructSkips = 0;
  for (const entry of entries) {
    try {
      const handle = mkCron(entry);
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

export function sighupHandler(dir: string = CRONS_DIR): void {
  if (reloading) return;
  reloading = true;
  try {
    for (const job of activeJobs) {
      try {
        job.stop();
      } catch {
      }
    }
    const { scheduled, skipped } = scheduleAll(dir);
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
    }
    process.exit(0);
  };
  process.on("SIGTERM", cleanup);
  process.on("SIGINT", cleanup);
  process.on("SIGHUP", () => setImmediate(sighupHandler));
  scheduleAll();
}

let invokedRealPath = "";
try {
  if (process.argv[1]) invokedRealPath = fs.realpathSync(process.argv[1]);
} catch {
}
if (invokedRealPath && invokedRealPath === import.meta.filename) {
  main();
}
