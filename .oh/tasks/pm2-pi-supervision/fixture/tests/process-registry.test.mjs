import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OwnedProcessRegistry, parseProcStat } from '../process-registry.mjs';

function procStat({ pid = 123, ppid = 9, start = 777 } = {}) {
  const fields = ['S', String(ppid), ...Array(17).fill('0'), String(start), ...Array(3).fill('0')];
  return `${pid} (synthetic process) ${fields.join(' ')}`;
}

test('proc parser uses exact Linux parent and start-time fields', () => {
  assert.deepEqual(parseProcStat(procStat({ ppid: 42, start: 9001 })), { ppid: 42, startTime: '9001' });
});

test('successful cleanup is reverse-order, exact-PID, bounded, and idempotent', async () => {
  const root = mkdtempSync(join(tmpdir(), 'owned-registry-'));
  const state = new Map([[101, { pid: 101, ppid: 50, startTime: 'a' }], [102, { pid: 102, ppid: 101, startTime: 'b' }]]);
  const signals = [];
  const registry = new OwnedProcessRegistry({
    runtimeRoot: root,
    ownerPid: 50,
    procReader: (pid) => state.get(pid) ?? null,
    signaler: (pid, signal) => { signals.push([pid, signal]); state.delete(pid); },
    sleeper: async () => {},
  });
  registry.register({ pid: 101, parentPid: 50, role: 'wrapper', candidate: 'synthetic', namespace: 'n1' });
  registry.register({ pid: 102, parentPid: 101, role: 'child', candidate: 'synthetic', namespace: 'n1' });
  const proof = await registry.cleanup({ termWaitMs: 1, removeRoot: true });
  assert.deepEqual(signals, [[102, 'SIGTERM'], [101, 'SIGTERM']]);
  assert.equal(proof.status, 'clean');
  assert.equal(proof.runtimeRootRemoved, true);
  assert.equal((await registry.cleanup()).idempotent, true);
});

test('PID reuse/start-time mismatch is rejected before a signal', async () => {
  const root = mkdtempSync(join(tmpdir(), 'owned-reuse-'));
  let identity = { pid: 201, ppid: 50, startTime: 'original' };
  let signaled = false;
  const registry = new OwnedProcessRegistry({ runtimeRoot: root, ownerPid: 50, procReader: () => identity, signaler: () => { signaled = true; } });
  const entry = registry.register({ pid: 201, role: 'child', candidate: 'synthetic', namespace: 'n2' });
  identity = { ...identity, startTime: 'reused' };
  assert.throws(() => registry.signal(entry, 'SIGTERM'), /start-time ownership mismatch/);
  assert.equal(signaled, false);
  identity = null;
  await registry.cleanup({ termWaitMs: 1, removeRoot: true });
});
