import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';

export function parseProcStat(text) {
  const close = text.lastIndexOf(')');
  if (close < 0) throw new Error('malformed /proc stat');
  const fields = text.slice(close + 2).trim().split(/\s+/);
  if (fields.length < 20) throw new Error('short /proc stat');
  return { ppid: Number(fields[1]), startTime: fields[19] };
}

export function readProcIdentity(pid, read = readFileSync) {
  if (!Number.isSafeInteger(pid) || pid <= 1) throw new Error('unsafe PID');
  try {
    const parsed = parseProcStat(read(`/proc/${pid}/stat`, 'utf8'));
    return { pid, ...parsed };
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class OwnedProcessRegistry {
  constructor({ runtimeRoot, ownerPid = process.pid, procReader = readProcIdentity, signaler = process.kill, sleeper = wait } = {}) {
    if (!runtimeRoot) throw new Error('runtimeRoot is required');
    this.runtimeRoot = runtimeRoot;
    this.path = join(runtimeRoot, 'run', 'owned-pids.jsonl');
    this.ownerPid = ownerPid;
    this.procReader = procReader;
    this.signaler = signaler;
    this.sleeper = sleeper;
    this.entries = [];
    this.cleaned = false;
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
  }

  register({ pid, role, candidate, namespace, parentPid = this.ownerPid }) {
    const identity = this.procReader(pid);
    if (!identity) throw new Error(`spawned PID disappeared before registration: ${pid}`);
    if (identity.ppid !== parentPid) throw new Error(`PID parent mismatch at registration: ${pid}`);
    const entry = {
      pid,
      parentPid,
      startTime: String(identity.startTime),
      role: String(role),
      candidate: String(candidate),
      namespace: String(namespace),
      registeredAtUtc: new Date().toISOString(),
    };
    appendFileSync(this.path, `${JSON.stringify(entry)}\n`, { encoding: 'utf8', mode: 0o600 });
    this.entries.push(entry);
    return Object.freeze({ ...entry });
  }

  revalidate(entry) {
    if (!this.entries.some((item) => item.pid === entry.pid && item.startTime === entry.startTime)) throw new Error(`PID is not registered: ${entry.pid}`);
    const current = this.procReader(entry.pid);
    if (!current) return false;
    if (String(current.startTime) !== String(entry.startTime)) throw new Error(`PID/start-time ownership mismatch: ${entry.pid}`);
    if (current.ppid !== entry.parentPid) throw new Error(`PID parent ownership mismatch: ${entry.pid}`);
    if (entry.parentPid !== this.ownerPid && !this.entries.some((item) => item.pid === entry.parentPid)) throw new Error(`PID is not a registered descendant: ${entry.pid}`);
    return true;
  }

  signal(entry, signal) {
    if (!['SIGTERM', 'SIGKILL', 'SIGINT', 'SIGHUP'].includes(signal)) throw new Error(`unsupported signal: ${signal}`);
    if (!this.revalidate(entry)) return false;
    this.signaler(entry.pid, signal);
    return true;
  }

  async cleanup({ termWaitMs = 5000, pollMs = 25, removeRoot = false } = {}) {
    if (this.cleaned) return { status: 'clean', idempotent: true, ownedCount: this.entries.length, remaining: [] };
    const ordered = [...this.entries].reverse();
    for (const entry of ordered) {
      if (this.revalidate(entry)) this.signal(entry, 'SIGTERM');
    }
    const deadline = Date.now() + termWaitMs;
    while (Date.now() < deadline && ordered.some((entry) => this.procReader(entry.pid))) await this.sleeper(pollMs);
    for (const entry of ordered) {
      if (this.procReader(entry.pid)) this.signal(entry, 'SIGKILL');
    }
    const killDeadline = Date.now() + Math.min(1000, termWaitMs);
    while (Date.now() < killDeadline && ordered.some((entry) => this.procReader(entry.pid))) await this.sleeper(pollMs);
    const remaining = ordered.filter((entry) => this.procReader(entry.pid)).map((entry) => entry.pid);
    if (remaining.length) throw new Error(`owned PID cleanup failed: ${remaining.join(',')}`);
    this.cleaned = true;
    if (removeRoot && existsSync(this.runtimeRoot)) rmSync(this.runtimeRoot, { recursive: true, force: true, maxRetries: 2, retryDelay: 25 });
    return { status: 'clean', idempotent: false, ownedCount: ordered.length, remaining: [], runtimeRootRemoved: removeRoot };
  }
}
