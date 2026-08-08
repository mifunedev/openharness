import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  STORY_CONFIG,
  aggregateSafeNotRunFaults,
  assertFrozenFaultManifest,
  preregisterSafeNotRunFaultMatrix,
  validatePrerequisites,
} from '../run-faults.mjs';

const EXPECTED_MANIFEST_HASH = 'ed79d0e7f623938e92e17cc2b3203b07074f5d796f0de3abeb5013700fc2e31b';
const manifestUrl = new URL('../../evidence/benchmark-manifest.json', import.meta.url);
const manifestBytes = readFileSync(manifestUrl);
const manifest = JSON.parse(manifestBytes);
const unavailableNetwork = {
  status: 'NOT RUN',
  reason: 'fresh user/network namespace unavailable; candidate launch is prohibited',
};
const faults = ['clean-exit', 'non-zero-exit', 'rapid-crash-loop', 'SIGTERM', 'synthetic-live-unhealthy-sentinel'];

function prerequisitesFor(story) {
  return STORY_CONFIG[story].dependencies.map((dependency) => ({
    story: dependency,
    firstMatePassed: true,
    candidate: 'prerequisite-candidate',
    status: 'NOT RUN',
    measuredRepetitions: 0,
    comparable: false,
    blocker: unavailableNetwork.reason,
    manifestHash: EXPECTED_MANIFEST_HASH,
  }));
}

test('US-011 through US-015 accept only the unchanged frozen five-fault manifest', () => {
  const hash = createHash('sha256').update(manifestBytes).digest('hex');
  assert.equal(hash, EXPECTED_MANIFEST_HASH);
  assert.equal(assertFrozenFaultManifest(manifest, hash), true);
  assert.throws(() => assertFrozenFaultManifest(manifest, '0'.repeat(64)), /hash changed/);
  const changed = structuredClone(manifest);
  changed.faults.order = changed.faults.order.slice(0, 4);
  assert.throws(() => assertFrozenFaultManifest(changed, hash), /five-fault order changed/);
});

test('story map is exactly US-011 through US-015 with the frozen candidate identities', () => {
  assert.deepEqual(Object.keys(STORY_CONFIG), ['US-011', 'US-012', 'US-013', 'US-014', 'US-015']);
  assert.deepEqual(Object.fromEntries(Object.entries(STORY_CONFIG).map(([story, value]) => [story, value.candidate])), {
    'US-011': 'baseline',
    'US-012': 'pm2-direct-rpc',
    'US-013': 'pm2-rpc-host-wrapper',
    'US-014': 'pm2-direct-no-mode',
    'US-015': 'pm2-pty-control',
  });
});

test('every candidate preregisters exactly five faults times three repetitions in frozen order', () => {
  for (const [story, config] of Object.entries(STORY_CONFIG)) {
    const { rows } = preregisterSafeNotRunFaultMatrix({
      story,
      candidate: config.candidate,
      manifest,
      manifestHash: EXPECTED_MANIFEST_HASH,
      network: unavailableNetwork,
      prerequisites: prerequisitesFor(story),
    });
    assert.equal(rows.length, 15);
    assert.deepEqual(rows.map(({ fault, repetition }) => [fault, repetition]), faults.flatMap((fault) => [1, 2, 3].map((repetition) => [fault, repetition])));
    assert.deepEqual(rows.map(({ registrationOrder }) => registrationOrder), Array.from({ length: 15 }, (_, index) => index + 1));
    assert.ok(rows.every((row) => row.status === 'NOT RUN' && row.outcome === 'NOT RUN' && row.comparable === false));
    assert.ok(rows.every((row) => row.candidateLaunched === false && row.faultInjected === false && row.signalAttempted === false));
  }
});

test('every NOT RUN slot retains all manifest fields with null metrics and explicit non-censor semantics', () => {
  const { rows } = preregisterSafeNotRunFaultMatrix({
    story: 'US-011',
    candidate: 'baseline',
    manifest,
    manifestHash: EXPECTED_MANIFEST_HASH,
    network: unavailableNetwork,
    prerequisites: prerequisitesFor('US-011'),
  });
  for (const row of rows) {
    for (const field of manifest.faults.requiredRowFields) assert.ok(Object.hasOwn(row, field), `missing ${field}`);
    assert.equal(row.utcStart, null);
    assert.equal(row.utcEnd, null);
    assert.equal(row.monotonicStartNs, null);
    assert.equal(row.monotonicEndNs, null);
    assert.equal(row.detectionLatencyNs, null);
    assert.equal(row.recoveryLatencyNs, null);
    assert.equal(row.restartCount, null);
    assert.equal(row.pid, null);
    assert.equal(row.exitCode, null);
    assert.equal(row.finalStatus, null);
    assert.equal(row.boundedLogs, null);
    assert.equal(row.protocolEvidence, null);
    assert.equal(row.semanticHealthObserved, null);
    assert.equal(row.censored, false);
    assert.equal(row.censorDeadlineNs, null);
    assert.match(row.censoringSemantics, /not executed/);
  }
});

test('synthetic sentinel preserves exact public-stderr/live-PID/block-work obligations as unexecuted only', () => {
  const { rows } = preregisterSafeNotRunFaultMatrix({
    story: 'US-012',
    candidate: 'pm2-direct-rpc',
    manifest,
    manifestHash: EXPECTED_MANIFEST_HASH,
    network: unavailableNetwork,
    prerequisites: prerequisitesFor('US-012'),
  });
  const sentinelRows = rows.filter(({ fault }) => fault === 'synthetic-live-unhealthy-sentinel');
  assert.equal(sentinelRows.length, 3);
  for (const row of sentinelRows) {
    assert.equal(row.faultObligation.executed, false);
    assert.equal(row.faultObligation.childPidRequired, 'same-and-running');
    assert.equal(row.faultObligation.publicStderrSymptomRequired, 'SYNTHETIC_STALE_CONTEXT');
    assert.equal(row.faultObligation.publicSymptomSurfaceRequired, 'common public stderr/health surface available identically to every candidate');
    assert.equal(row.faultObligation.ordinarySyntheticWorkRequired, 'blocked until externally observable recovery action');
    assert.equal(row.faultObligation.classification, 'simulation-not-proof-of-Slack-recovery');
    assert.equal(row.faultObligation.slackRecoveryProofClaimed, false);
    assert.equal(row.slackRecoveryProofClaimed, false);
    assert.equal(row.observabilityFields.sameChildPidAliveRunning, null);
    assert.equal(row.observabilityFields.ordinarySyntheticWorkBlocked, null);
  }
});

test('aggregate does not turn unexecuted slots into zero latency, restart, lifecycle, or semantic metrics', () => {
  const story = 'US-013';
  const candidate = STORY_CONFIG[story].candidate;
  const { rows, reason } = preregisterSafeNotRunFaultMatrix({
    story,
    candidate,
    manifest,
    manifestHash: EXPECTED_MANIFEST_HASH,
    network: unavailableNetwork,
    prerequisites: prerequisitesFor(story),
  });
  const aggregate = aggregateSafeNotRunFaults({ story, candidate, rows, reason, manifestHash: EXPECTED_MANIFEST_HASH });
  assert.equal(aggregate.requestedSlots, 15);
  assert.equal(aggregate.measuredSlots, 0);
  assert.equal(aggregate.notRunSlots, 15);
  assert.equal(aggregate.comparableSlots, 0);
  assert.equal(aggregate.lifecycleSuccessCount, null);
  assert.equal(aggregate.semanticHealthSuccessCount, null);
  assert.deepEqual(aggregate.metrics, { detectionLatencyNs: null, recoveryLatencyNs: null, restartCount: null });
  assert.equal(aggregate.censoring.censoredFailures, 0);
  assert.equal(aggregate.censoring.unexecutedNotRunSlots, 15);
  assert.equal(aggregate.imputation, false);
  assert.equal(aggregate.selectiveRetries, false);
  assert.ok(aggregate.byFault.every((entry) => entry.lifecycleSuccessCount === null && entry.detectionLatencyNs.median === null));
});

test('prerequisite validation requires exact dependencies to be First-Mate-passed safe NOT RUN with frozen hash', () => {
  const story = 'US-014';
  const config = STORY_CONFIG[story];
  const prd = {
    userStories: [
      { id: story, passes: false, dependsOn: [...config.dependencies] },
      { id: 'US-009', passes: true },
    ],
  };
  const aggregates = {
    'US-009': { story: 'US-009', candidate: 'pm2-direct-no-mode', status: 'NOT RUN', measuredRepetitions: 0, manifestHash: EXPECTED_MANIFEST_HASH, reason: unavailableNetwork.reason },
  };
  assert.equal(validatePrerequisites({ story, config, manifestHash: EXPECTED_MANIFEST_HASH, prd, aggregates }).length, 1);
  assert.throws(() => validatePrerequisites({
    story,
    config,
    manifestHash: EXPECTED_MANIFEST_HASH,
    prd: { userStories: [{ id: story, passes: false, dependsOn: [...config.dependencies] }, { id: 'US-009', passes: false }] },
    aggregates,
  }), /not First-Mate-passed/);
  assert.throws(() => validatePrerequisites({
    story,
    config,
    manifestHash: EXPECTED_MANIFEST_HASH,
    prd,
    aggregates: { 'US-009': { ...aggregates['US-009'], status: 'MEASURED', measuredRepetitions: 3 } },
  }), /not verified NOT RUN/);
});

test('safe fault path rejects proven isolation instead of launching, faulting, or signaling', () => {
  assert.throws(() => preregisterSafeNotRunFaultMatrix({
    story: 'US-015',
    candidate: 'pm2-pty-control',
    manifest,
    manifestHash: EXPECTED_MANIFEST_HASH,
    network: { status: 'PROVEN' },
    prerequisites: prerequisitesFor('US-015'),
  }), /requires unavailable network isolation/);
});

test('fault runner has no candidate launch, process registry, PM2, Pi, fault-injection, or signal API', () => {
  const source = readFileSync(new URL('../run-faults.mjs', import.meta.url), 'utf8');
  assert.equal(source.includes("from 'node:child_process'"), false);
  assert.equal(source.includes("from './process-registry.mjs'"), false);
  assert.equal(source.includes('spawn('), false);
  assert.equal(source.includes('execFile('), false);
  assert.equal(source.includes('process.kill('), false);
  assert.equal(source.includes('.kill('), false);
  assert.equal(source.includes('faultInjector'), false);
  assert.equal(source.includes('pm2 start'), false);
  assert.equal(source.includes('--mode rpc'), false);
});
