import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { assertDisposableHomesEmpty, assertPm2Command, buildChildEnvironment, createRuntimeRoot, PRODUCTION_METADATA_COMMANDS, proveDeniedNetwork, removeRuntimeRoot, snapshotProductionMetadata } from '../contract.mjs';
import { FixtureLifecycle } from '../lifecycle.mjs';

function fakeRegistry(root) {
  let calls = 0;
  return { get calls() { return calls; }, async cleanup({ removeRoot }) { calls += 1; if (removeRoot) rmSync(root, { recursive: true, force: true }); return { status: 'clean', remaining: [] }; } };
}

test('env -i contract creates empty disposable homes and 0700 PM2_HOME', () => {
  const dirs = createRuntimeRoot();
  try {
    assertDisposableHomesEmpty(dirs);
    const env = buildChildEnvironment(dirs, { FIXTURE_CANDIDATE: dirs.root });
    assert.deepEqual(Object.keys(env).sort(), ['FIXTURE_CANDIDATE', 'HOME', 'LANG', 'LC_ALL', 'PATH', 'PM2_HOME', 'TMPDIR', 'TZ', 'XDG_CACHE_HOME', 'XDG_CONFIG_HOME', 'XDG_STATE_HOME'].sort());
    assert.equal(statSync(dirs.pm2).mode & 0o777, 0o700);
    assert.throws(() => buildChildEnvironment(dirs, { API_KEY: dirs.root }), /prohibited/);
    assert.throws(() => buildChildEnvironment(dirs, { ESCAPE: '/host/path' }), /escapes/);
  } finally { removeRuntimeRoot(dirs.root); }
});

test('non-empty disposable auth/config home fails closed', () => {
  const dirs = createRuntimeRoot();
  try {
    writeFileSync(join(dirs.config, 'auth.json'), '{}');
    assert.throws(() => assertDisposableHomesEmpty(dirs), /not empty/);
  } finally { removeRuntimeRoot(dirs.root); }
});

test('network-denial failure returns safe NOT RUN', () => {
  const result = proveDeniedNetwork({ spawn: () => ({ status: 1 }) });
  assert.equal(result.status, 'NOT RUN');
  assert.match(result.reason, /candidate launch is prohibited/);
});

test('global/default and cluster PM2 commands are denied', () => {
  const dirs = createRuntimeRoot();
  try {
    const env = buildChildEnvironment(dirs);
    assert.throws(() => assertPm2Command(['pm2', 'status'], {}, dirs.root), /explicit fixture PM2_HOME/);
    assert.throws(() => assertPm2Command(['pm2', 'delete', 'all'], env, dirs.root), /prohibited/);
    assert.throws(() => assertPm2Command(['pm2', 'kill'], env, dirs.root), /prohibited/);
    assert.throws(() => assertPm2Command(['pm2', 'start', 'x', '-i', '2'], env, dirs.root), /cluster/);
    assert.throws(() => assertPm2Command(['pm2', 'module:install', 'x'], env, dirs.root), /prohibited/);
    assert.throws(() => assertPm2Command(['pm2', 'delete', 'fixture-unique-name'], env, dirs.root), /exact registered/);
    assert.equal(assertPm2Command(['pm2', 'delete', 'fixture-unique-name'], env, dirs.root, { ownedProcessNames: ['fixture-unique-name'] }), true);
  } finally { removeRuntimeRoot(dirs.root); }
});

test('lifecycle performs cleanup after success and assertion failure', async () => {
  for (const shouldFail of [false, true]) {
    const root = mkdtempSync(join(tmpdir(), 'fixture-lifecycle-'));
    const registry = fakeRegistry(root);
    const emitter = new EventEmitter();
    const exits = [];
    const lifecycle = new FixtureLifecycle({ registry, emitter, exit: (code) => exits.push(code) }).install({ deadlineMs: 10_000 });
    if (shouldFail) await assert.rejects(lifecycle.run(async () => { throw new Error('synthetic assertion'); }), /synthetic assertion/);
    else assert.equal(await lifecycle.run(async () => 'ok'), 'ok');
    assert.equal(registry.calls, 1);
    assert.equal(existsSync(root), false);
    assert.deepEqual(exits, [shouldFail ? 1 : 0]);
  }
});

test('EXIT, INT, TERM, HUP, and timeout invoke one idempotent bounded cleanup', async () => {
  for (const [trigger, expected] of [['beforeExit', 0], ['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129], ['timeout', 124]]) {
    const root = mkdtempSync(join(tmpdir(), 'fixture-signal-'));
    const registry = fakeRegistry(root);
    const emitter = new EventEmitter();
    const exits = [];
    let timeoutCallback;
    const lifecycle = new FixtureLifecycle({ registry, emitter, setTimer: (fn) => { timeoutCallback = fn; return 1; }, clearTimer: () => {}, exit: (code) => exits.push(code) }).install({ deadlineMs: 1 });
    if (trigger === 'timeout') timeoutCallback(); else emitter.emit(trigger, 0);
    await lifecycle.cleanupPromise;
    await lifecycle.finish({ reason: 'repeat', exitCode: 99 });
    assert.equal(registry.calls, 1);
    assert.deepEqual(exits, [expected]);
  }
});

test('metadata snapshots are constrained to the four identity-only commands', () => {
  const seen = [];
  const rows = snapshotProductionMetadata('/synthetic/repo', {
    exec: (file, args, options) => {
      seen.push({ file, args, cwd: options.cwd });
      return `${file}-synthetic-metadata`;
    },
  });
  assert.deepEqual(seen.map(({ file, args }) => [file, ...args]), PRODUCTION_METADATA_COMMANDS.map(({ file, args }) => [file, ...args]));
  assert.equal(rows.length, 4);
});

test('baseline source is synthetic-only and has no process, network, or production imports', () => {
  const source = readFileSync(new URL('../baseline.mjs', import.meta.url), 'utf8');
  const imports = [...source.matchAll(/from ['"]([^'"]+)['"]/g)].map((match) => match[1]).sort();
  assert.deepEqual(imports, ['./jsonl.mjs', 'node:crypto']);
  for (const prohibited of ['child_process', 'node:net', 'node:http', 'node:https', 'tmux', 'client-slack', 'pi-messenger-bridge']) assert.equal(source.includes(prohibited), false, prohibited);
  for (const surface of ['ready', 'work', 'idle_survived', 'SYNTHETIC_LOG', 'status', 'exit', 'restart_count', 'SYNTHETIC_STALE_CONTEXT']) assert.equal(source.includes(surface), true, surface);
});
