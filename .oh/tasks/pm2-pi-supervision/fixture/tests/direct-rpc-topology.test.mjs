import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  PM2_PIN,
  assertFrozenDirectManifest,
  characterizeDirectTopologyNotRun,
  inspectPublicPiSource,
} from '../direct-rpc-topology.mjs';

const EXPECTED_MANIFEST_HASH = 'ed79d0e7f623938e92e17cc2b3203b07074f5d796f0de3abeb5013700fc2e31b';
const manifestUrl = new URL('../../evidence/benchmark-manifest.json', import.meta.url);

function sourceStub() {
  return {
    status: 'SOURCE-VERIFIED',
    package: '@earendil-works/pi-coding-agent',
    version: '0.82.1',
    commandPath: '/public/bin/pi',
    resolvedScript: '/public/lib/pi/dist/cli.js',
    candidateExecuted: false,
  };
}

test('US-006 accepts only the unchanged frozen direct topology manifest', () => {
  const bytes = readFileSync(manifestUrl);
  const hash = createHash('sha256').update(bytes).digest('hex');
  assert.equal(hash, EXPECTED_MANIFEST_HASH);
  assert.equal(assertFrozenDirectManifest(JSON.parse(bytes), hash, EXPECTED_MANIFEST_HASH), true);
  assert.throws(() => assertFrozenDirectManifest(JSON.parse(bytes), '0'.repeat(64), EXPECTED_MANIFEST_HASH), /hash changed/);
});

test('PM2 package identity is exactly pinned to cited 7.0.3 metadata', () => {
  assert.deepEqual(PM2_PIN, {
    package: 'pm2',
    version: '7.0.3',
    nodeEngine: '>=18',
    integrity: 'sha512-zRJOdburpb9OEPB0uqoNT8C1Gp7hPJPVy4Kr67XJNuT9UlMQcOt1WXrYQUmwqKPHk8FyauvP1CPhqoCrCaPw0Q==',
    tarballUrl: 'https://registry.npmjs.org/pm2/-/pm2-7.0.3.tgz',
    upstreamTag: 'v7.0.3',
    upstreamTagCommit: '01d4f6d59c5eaf4ff6683bb38824dcf38d25b289',
    upstreamSource: 'https://github.com/Unitech/pm2/tree/v7.0.3',
    citedMetadataCommand: 'npm view pm2@7.0.3 version engines dist.integrity',
    citedEvidence: '.oh/tasks/pm2-pi-supervision/assessment.md#source-baseline',
  });
});

test('unavailable network isolation yields three direct NOT RUN slots without PM2, Pi, or wrapper launch', () => {
  const reason = 'fresh user/network namespace unavailable; candidate launch is prohibited';
  const result = characterizeDirectTopologyNotRun({
    network: { status: 'NOT RUN', reason },
    repetitions: 3,
    manifestHash: EXPECTED_MANIFEST_HASH,
    piSource: sourceStub(),
  });
  assert.equal(result.candidateLaunchCount, 0);
  assert.equal(result.rows.length, 3);
  assert.deepEqual(result.rows.map((row) => row.repetition), [1, 2, 3]);
  assert.ok(result.rows.every((row) => row.status === 'NOT RUN' && row.candidateLaunched === false));
  assert.ok(result.rows.every((row) => row.pm2DaemonPid === null && row.piPid === null && row.wrapperPid === null));
  assert.equal(result.packageEvidence.pm2.runtimeResolution.exactFetchAttempted, false);
  assert.equal(result.packageEvidence.pm2.runtimeResolution.otherFetchAttempted, false);
  assert.equal(result.packageEvidence.pm2.runtimeResolution.offlineDependencyResolution, 'NOT RUN');
  assert.equal(result.topology.scriptTarget, '/public/bin/pi');
  assert.deepEqual(result.topology.scriptArguments, ['--mode', 'rpc']);
  assert.equal(result.topology.wrapperSubstituted, false);
  assert.equal(result.topology.pm2LogsUsedAsTransport, false);
});

test('direct topology retains every stdin/stdout/ready/EOF/exit ownership obligation as unverified', () => {
  const result = characterizeDirectTopologyNotRun({
    network: { status: 'NOT RUN', reason: 'synthetic unavailable isolation' },
    repetitions: 3,
    manifestHash: EXPECTED_MANIFEST_HASH,
    piSource: sourceStub(),
  });
  assert.deepEqual(result.topology.proofObligations.map(({ id }) => id), [
    'pm2-daemon-pid',
    'pi-pid',
    'stdin-owner-writer',
    'stdout-consumer',
    'ready-signal',
    'lf-jsonl-command-path',
    'retained-open-stdin',
    'eof-shutdown',
    'exit-code-propagation',
    'byte-frame-losslessness',
  ]);
  assert.ok(result.topology.proofObligations.every(({ observedValue }) => observedValue === null));
  assert.equal(result.transport.feasibility, 'LIVE-UNVERIFIED');
  assert.equal(result.transport.infeasibleClaimed, false);
  assert.equal(result.transport.writableRetainedStdinProven, false);
  assert.equal(result.transport.losslessStdoutConsumerProven, false);
  assert.ok(result.rows.every((row) => row.request.sha256 === null && row.response.sha256 === null));
  assert.ok(result.rows.every((row) => row.request.frameCount === null && row.response.frameCount === null));
  assert.equal(result.transport.imputation, false);
  assert.equal(result.transport.selectiveRetries, false);
});

test('safe NOT RUN refuses a PROVEN-network value instead of silently running or substituting', () => {
  assert.throws(() => characterizeDirectTopologyNotRun({
    network: { status: 'PROVEN' },
    repetitions: 3,
    manifestHash: EXPECTED_MANIFEST_HASH,
    piSource: sourceStub(),
  }), /requires failed network-isolation proof/);
});

test('public installed Pi source is characterized read-only without executing Pi', () => {
  const source = inspectPublicPiSource();
  assert.equal(source.status, 'SOURCE-VERIFIED');
  assert.equal(source.package, '@earendil-works/pi-coding-agent');
  assert.equal(source.version, '0.82.1');
  assert.equal(source.binTarget, 'dist/cli.js');
  assert.equal(source.candidateExecuted, false);
  assert.match(source.mainSourceSha256, /^[a-f0-9]{64}$/);
  assert.match(source.rpcSourceSha256, /^[a-f0-9]{64}$/);
});

test('direct characterization module cannot launch a child process or implement a wrapper', () => {
  const source = readFileSync(new URL('../direct-rpc-topology.mjs', import.meta.url), 'utf8');
  assert.equal(source.includes('node:child_process'), false);
  assert.equal(source.includes("from 'node:net'"), false);
  assert.equal(source.includes('spawn('), false);
  assert.equal(source.includes('execFile'), false);
  assert.equal(source.includes('wrapperSubstituted: false'), true);
});
