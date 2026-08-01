import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { assertFrozenBaselineManifest, executeCandidateGate, productionMetadataDelta } from '../run.mjs';

const manifestUrl = new URL('../../evidence/benchmark-manifest.json', import.meta.url);

test('US-005 accepts only the unchanged frozen baseline manifest', () => {
  const bytes = readFileSync(manifestUrl);
  const hash = createHash('sha256').update(bytes).digest('hex');
  assert.equal(hash, 'ed79d0e7f623938e92e17cc2b3203b07074f5d796f0de3abeb5013700fc2e31b');
  assert.equal(assertFrozenBaselineManifest(JSON.parse(bytes), hash), true);
  assert.throws(() => assertFrozenBaselineManifest(JSON.parse(bytes), '0'.repeat(64)), /hash changed/);
});

test('unavailable network isolation creates three safe NOT RUN rows before launch', async () => {
  let launches = 0;
  const reason = 'fresh user/network namespace unavailable; candidate launch is prohibited';
  const result = await executeCandidateGate({
    network: { status: 'NOT RUN', reason },
    repetitions: 3,
    manifestHash: 'synthetic-manifest-hash',
    launchCandidate: async () => {
      launches += 1;
      throw new Error('candidate launcher must be unreachable');
    },
  });
  assert.equal(launches, 0);
  assert.equal(result.candidateLaunchCount, 0);
  assert.equal(result.rows.length, 3);
  assert.deepEqual(result.rows.map((row) => row.repetition), [1, 2, 3]);
  assert.ok(result.rows.every((row) => row.status === 'NOT RUN'));
  assert.ok(result.rows.every((row) => row.candidateLaunched === false && row.runtimeRootCreated === false));
  assert.ok(result.rows.every((row) => row.ownedProcessCount === 0 && row.cleanupStatus === 'clean-no-runtime-created'));
});

test('metadata delta excludes only the short-lived ps observer and detects other changes', () => {
  const unchanged = productionMetadataDelta(
    [
      { name: 'git-status', output: ' M .oh/tasks/pm2-pi-supervision/progress.txt\n' },
      { name: 'process-identities', output: '10 1 Thu Jan  1 00:00:00 1970 node\n20 10 Thu Jan  1 00:00:01 1970 ps\n' },
    ],
    [
      { name: 'git-status', output: ' M .oh/tasks/pm2-pi-supervision/progress.txt\n' },
      { name: 'process-identities', output: '10 1 Thu Jan  1 00:00:00 1970 node\n21 10 Thu Jan  1 00:00:02 1970 ps\n' },
    ],
  );
  assert.equal(unchanged.unchanged, true);
  assert.equal(unchanged.productionContentRead, false);

  const changed = productionMetadataDelta(
    [{ name: 'tmux-session-identities', output: 'fixture\t$1\t1\t0\n' }],
    [{ name: 'tmux-session-identities', output: 'fixture\t$1\t1\t0\nnew\t$2\t2\t0\n' }],
  );
  assert.equal(changed.unchanged, false);
  assert.deepEqual(changed.commands[0].added, ['new\t$2\t2\t0']);
});
