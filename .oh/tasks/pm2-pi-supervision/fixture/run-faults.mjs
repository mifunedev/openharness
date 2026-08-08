#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { proveDeniedNetwork, snapshotProductionMetadata } from './contract.mjs';
import { appendVerification, writeBoundedFile } from './evidence.mjs';
import { productionMetadataDelta } from './run.mjs';

const TASK_ROOT = resolve('.oh/tasks/pm2-pi-supervision');
const EXPECTED_MANIFEST_HASH = 'ed79d0e7f623938e92e17cc2b3203b07074f5d796f0de3abeb5013700fc2e31b';
const EXPECTED_FAULTS = Object.freeze([
  'clean-exit',
  'non-zero-exit',
  'rapid-crash-loop',
  'SIGTERM',
  'synthetic-live-unhealthy-sentinel',
]);
const REQUIRED_ROW_FIELDS = Object.freeze([
  'candidate', 'fault', 'repetition', 'utcStart', 'utcEnd', 'monotonicStartNs',
  'monotonicEndNs', 'detectionSource', 'recoveryAction', 'detectionLatencyNs',
  'recoveryLatencyNs', 'restartCount', 'pid', 'startTime', 'exitCode',
  'finalStatus', 'outcome', 'censored', 'observabilityFields', 'cleanupStatus',
]);

export const STORY_CONFIG = Object.freeze({
  'US-011': Object.freeze({ candidate: 'baseline', dependencies: Object.freeze(['US-005']) }),
  'US-012': Object.freeze({ candidate: 'pm2-direct-rpc', dependencies: Object.freeze(['US-006', 'US-008']) }),
  'US-013': Object.freeze({ candidate: 'pm2-rpc-host-wrapper', dependencies: Object.freeze(['US-007', 'US-008']) }),
  'US-014': Object.freeze({ candidate: 'pm2-direct-no-mode', dependencies: Object.freeze(['US-009']) }),
  'US-015': Object.freeze({ candidate: 'pm2-pty-control', dependencies: Object.freeze(['US-010']) }),
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function argsOf(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    assert(key?.startsWith('--') && argv[index + 1] !== undefined, `invalid argument: ${key}`);
    assert(!(key.slice(2) in result), `duplicate argument: ${key}`);
    result[key.slice(2)] = argv[index + 1];
  }
  return result;
}

function assertTaskPath(path, label) {
  const rel = relative(TASK_ROOT, path);
  assert(rel && rel !== '..' && !rel.startsWith('../') && !rel.startsWith('..\\'), `${label} must be inside task root`);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function writeJson(path, value) {
  writeBoundedFile(path, `${JSON.stringify(value, null, 2)}\n`, { worktreeRoot: resolve('.') });
}

export function assertFrozenFaultManifest(manifest, hash) {
  assert(hash === EXPECTED_MANIFEST_HASH, 'frozen benchmark manifest hash changed');
  assert(manifest.schemaVersion === 1 && manifest.status === 'FROZEN_PRE_OBSERVATION', 'manifest is not frozen pre-observation');
  assert(manifest.candidateObservationCountAtFreeze === 0, 'manifest was frozen after observation');
  assert(manifest.measurement?.measuredRepetitions === 3, 'fault matrix requires exactly three repetitions');
  assert(manifest.measurement?.selectiveRetries === false && manifest.measurement?.imputation === false, 'retry/imputation policy changed');
  assert(JSON.stringify(manifest.faults?.order) === JSON.stringify(EXPECTED_FAULTS), 'frozen five-fault order changed');
  assert(JSON.stringify(manifest.faults?.requiredRowFields) === JSON.stringify(REQUIRED_ROW_FIELDS), 'required fault row fields changed');
  assert(manifest.networkProof?.requiredBeforeEveryCandidateLaunch === true, 'network proof gate is required');
  assert(manifest.constraints?.network?.unprovenResult === 'NOT RUN', 'unproven network result must remain NOT RUN');
  assert(manifest.sentinel?.stderrSymptom === 'SYNTHETIC_STALE_CONTEXT', 'sentinel stderr symptom changed');
  assert(manifest.sentinel?.symptomSurface === 'common public stderr/health surface available identically to every candidate', 'sentinel public surface changed');
  assert(manifest.sentinel?.childPid === 'same-and-running', 'sentinel live-PID obligation changed');
  assert(manifest.sentinel?.ordinarySyntheticWork === 'blocked until externally observable recovery action', 'sentinel blocked-work obligation changed');
  assert(manifest.sentinel?.classification === 'simulation-not-proof-of-Slack-recovery', 'sentinel classification changed');
  return true;
}

export function validatePrerequisites({ story, config, manifestHash, prd, aggregates }) {
  const storyRecord = prd.userStories?.find(({ id }) => id === story);
  assert(storyRecord && storyRecord.passes === false, `${story} pass state must remain false during delegate execution`);
  assert(JSON.stringify(storyRecord.dependsOn) === JSON.stringify(config.dependencies), `${story} dependency list changed`);
  return config.dependencies.map((dependency) => {
    const dependencyRecord = prd.userStories?.find(({ id }) => id === dependency);
    const aggregate = aggregates[dependency];
    assert(dependencyRecord?.passes === true, `${dependency} is not First-Mate-passed`);
    assert(aggregate?.story === dependency, `${dependency} aggregate story mismatch`);
    assert(aggregate?.status === 'NOT RUN', `${dependency} candidate is not verified NOT RUN`);
    assert(aggregate?.measuredRepetitions === 0, `${dependency} unexpectedly contains measured behavior`);
    assert(aggregate?.manifestHash === manifestHash, `${dependency} manifest hash mismatch`);
    return {
      story: dependency,
      firstMatePassed: true,
      candidate: aggregate.candidate,
      status: aggregate.status,
      measuredRepetitions: aggregate.measuredRepetitions,
      comparable: false,
      blocker: aggregate.reason,
      evidence: `evidence/${dependency}/aggregate.json`,
      manifestHash: aggregate.manifestHash,
    };
  });
}

function faultObligation(fault, manifest) {
  if (fault === 'clean-exit') return { action: 'request exact clean exit', executed: false };
  if (fault === 'non-zero-exit') return { action: 'request exact non-zero exit', executed: false };
  if (fault === 'rapid-crash-loop') return { action: manifest.faults.rapidCrashLoop.definition, executed: false };
  if (fault === 'SIGTERM') return { action: 'signal only the exact revalidated registered candidate PID with SIGTERM', executed: false };
  return {
    action: 'exercise the synthetic live-unhealthy sentinel',
    executed: false,
    childPidRequired: manifest.sentinel.childPid,
    publicStderrSymptomRequired: manifest.sentinel.stderrSymptom,
    publicSymptomSurfaceRequired: manifest.sentinel.symptomSurface,
    ordinarySyntheticWorkRequired: manifest.sentinel.ordinarySyntheticWork,
    hiddenCandidateChannel: manifest.sentinel.hiddenCandidateChannel,
    creditRule: manifest.sentinel.creditRule,
    classification: manifest.sentinel.classification,
    slackRecoveryProofClaimed: false,
  };
}

export function preregisterSafeNotRunFaultMatrix({ story, candidate, manifest, manifestHash, network, prerequisites }) {
  assert(network?.status === 'NOT RUN' && typeof network.reason === 'string', 'safe NOT RUN fault path requires unavailable network isolation');
  assert(prerequisites.length > 0 && prerequisites.every(({ status, firstMatePassed }) => status === 'NOT RUN' && firstMatePassed), 'all prerequisite candidates must be First-Mate-passed NOT RUN');
  const reason = `prerequisite candidate behavior is NOT RUN and ${network.reason}; every fault slot is safely NOT RUN before candidate launch, fault injection, or signal`;
  const rows = [];
  for (const fault of manifest.faults.order) {
    for (let repetition = 1; repetition <= manifest.measurement.measuredRepetitions; repetition += 1) {
      rows.push({
        kind: 'fault-repetition-slot',
        story,
        candidate,
        fault,
        repetition,
        registrationOrder: rows.length + 1,
        preregistered: true,
        status: 'NOT RUN',
        outcome: 'NOT RUN',
        reason,
        comparable: false,
        candidateLaunched: false,
        faultInjected: false,
        signalAttempted: false,
        observationPerformed: false,
        utcStart: null,
        utcEnd: null,
        monotonicStartNs: null,
        monotonicEndNs: null,
        detectionSource: null,
        recoveryAction: null,
        detectionLatencyNs: null,
        recoveryLatencyNs: null,
        restartCount: null,
        pid: null,
        startTime: null,
        exitCode: null,
        finalStatus: null,
        censored: false,
        censorDeadlineNs: null,
        censoringSemantics: 'not applicable because the slot was not executed; no timeout observation occurred',
        observabilityFields: {
          publicStderrSymptom: null,
          boundedLogBytes: null,
          protocolFrameCount: null,
          protocolSha256: null,
          sameChildPidAliveRunning: null,
          ordinarySyntheticWorkBlocked: null,
        },
        boundedLogs: null,
        protocolEvidence: null,
        semanticHealthObserved: null,
        slackRecoveryProofClaimed: false,
        cleanupStatus: 'clean-no-candidate-launched',
        faultObligation: faultObligation(fault, manifest),
        manifestHash,
      });
    }
  }
  assert(rows.length === 15, 'fault matrix must preregister exactly fifteen slots');
  return { rows, reason };
}

export function aggregateSafeNotRunFaults({ story, candidate, rows, reason, manifestHash }) {
  const byFault = EXPECTED_FAULTS.map((fault) => {
    const slots = rows.filter((row) => row.fault === fault);
    assert(slots.length === 3, `${fault} must have exactly three slots`);
    return {
      fault,
      requestedRepetitions: 3,
      measuredRepetitions: 0,
      notRunRepetitions: 3,
      requiredRunCompleteness: '0/3',
      outcome: 'NOT RUN',
      comparable: false,
      censoredFailures: 0,
      lifecycleSuccessCount: null,
      semanticHealthSuccessCount: null,
      detectionLatencyNs: { median: null, inclusiveMinMax: { min: null, max: null } },
      recoveryLatencyNs: { median: null, inclusiveMinMax: { min: null, max: null } },
      restartCount: { median: null, inclusiveMinMax: { min: null, max: null } },
    };
  });
  return {
    kind: 'fault-matrix-aggregate',
    story,
    candidate,
    status: 'NOT RUN',
    reason,
    faultOrder: EXPECTED_FAULTS,
    faultsRequested: 5,
    repetitionsPerFault: 3,
    requestedSlots: 15,
    measuredSlots: 0,
    notRunSlots: 15,
    comparableSlots: 0,
    requiredRunCompleteness: '0/15',
    lifecycleSuccessCount: null,
    semanticHealthSuccessCount: null,
    metrics: { detectionLatencyNs: null, recoveryLatencyNs: null, restartCount: null },
    censoring: { censoredFailures: 0, unexecutedNotRunSlots: 15, imputed: false },
    selectiveRetries: false,
    imputation: false,
    comparable: false,
    byFault,
    manifestHash,
  };
}

async function main() {
  const options = argsOf(process.argv.slice(2));
  assert(Object.keys(options).sort().join(',') === 'candidate,manifest,output,story', 'exactly --story, --candidate, --manifest, and --output are required');
  const config = STORY_CONFIG[options.story];
  assert(config, 'run-faults.mjs supports exactly US-011 through US-015');
  assert(options.candidate === config.candidate, `${options.story} candidate must be exact`);

  const manifestPath = resolve(options.manifest);
  const outputDir = resolve(options.output);
  assertTaskPath(manifestPath, 'manifest');
  assertTaskPath(outputDir, 'output');
  assert(basename(manifestPath) === 'benchmark-manifest.json', 'unexpected manifest path');
  assert(outputDir === join(TASK_ROOT, 'evidence', options.story), `${options.story} output path must be exact`);

  const startedAtUtc = new Date().toISOString();
  const startedNs = process.hrtime.bigint();
  const manifestBytes = readFileSync(manifestPath);
  const manifestHash = sha256(manifestBytes);
  const manifest = JSON.parse(manifestBytes);
  assertFrozenFaultManifest(manifest, manifestHash);
  const frozenHashRecord = readFileSync(join(TASK_ROOT, 'evidence', 'US-004', 'manifest.sha256'), 'utf8').trim().split(/\s+/)[0];
  assert(frozenHashRecord === manifestHash, 'US-004 frozen hash record does not match manifest');

  const prd = JSON.parse(readFileSync(join(TASK_ROOT, 'prd.json'), 'utf8'));
  const aggregates = Object.fromEntries(config.dependencies.map((dependency) => [
    dependency,
    JSON.parse(readFileSync(join(TASK_ROOT, 'evidence', dependency, 'aggregate.json'), 'utf8')),
  ]));
  const prerequisites = validatePrerequisites({ story: options.story, config, manifestHash, prd, aggregates });

  // The network proof and prerequisite checks are load-bearing gates. This
  // runner implements only the current safe NOT RUN path: it has no candidate
  // launcher, fault injector, signal path, process registry, PM2, or Pi import.
  const network = proveDeniedNetwork();
  assert(network.status === 'NOT RUN', `${options.story} is authorized only for the verified unavailable-isolation path in this study`);
  const beforeMetadata = snapshotProductionMetadata(resolve('.'));
  const { rows, reason } = preregisterSafeNotRunFaultMatrix({
    story: options.story,
    candidate: options.candidate,
    manifest,
    manifestHash,
    network,
    prerequisites,
  });
  const aggregate = aggregateSafeNotRunFaults({
    story: options.story,
    candidate: options.candidate,
    rows,
    reason,
    manifestHash,
  });
  const afterMetadata = snapshotProductionMetadata(resolve('.'));
  const metadataDelta = productionMetadataDelta(beforeMetadata, afterMetadata);
  assert(metadataDelta.unchanged, 'production metadata changed during safe NOT RUN fault registration');
  assert(sha256(readFileSync(manifestPath)) === manifestHash, 'frozen manifest changed during fault registration');

  mkdirSync(outputDir, { recursive: true, mode: 0o700 });
  writeBoundedFile(join(outputDir, 'run.jsonl'), `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`, { worktreeRoot: resolve('.') });
  writeJson(join(outputDir, 'aggregate.json'), aggregate);
  writeJson(join(outputDir, 'fault-matrix.json'), {
    kind: 'preregistered-fault-matrix',
    story: options.story,
    candidate: options.candidate,
    status: 'NOT RUN',
    manifestHash,
    manifestFrozenUnchanged: true,
    faultOrder: EXPECTED_FAULTS,
    repetitionsPerFault: 3,
    expectedSlotCount: 15,
    registeredSlotCount: rows.length,
    slotOrder: rows.map(({ registrationOrder, fault, repetition }) => ({ registrationOrder, fault, repetition })),
    prerequisites,
    networkIsolation: network.status,
    blocker: reason,
    executionBoundary: {
      candidateLaunchCount: 0,
      faultInjectionCount: 0,
      signalAttempts: 0,
      observations: 0,
      allSlotsNonComparable: true,
    },
    sentinelUnexecutedObligations: faultObligation('synthetic-live-unhealthy-sentinel', manifest),
  });
  writeJson(join(outputDir, 'production-metadata-delta.json'), metadataDelta);
  const cleanupNoSignalProof = {
    kind: 'cleanup-no-signal-proof',
    story: options.story,
    candidate: options.candidate,
    status: 'clean-no-candidate-launched',
    reason,
    candidateLaunchCount: 0,
    faultInjectionCount: 0,
    signalAttempts: 0,
    pm2DaemonLaunchCount: 0,
    piLaunchCount: 0,
    wrapperLaunchCount: 0,
    ptyUtilityLaunchCount: 0,
    watchdogLaunchCount: 0,
    runtimeRootsCreated: 0,
    ownedRegistryCreated: false,
    registeredOwnedProcessCount: 0,
    remainingOwnedPids: [],
    residue: 'none-created',
    cleanupRequired: false,
    cleanupStatus: 'clean-no-candidate-launched',
    idempotent: true,
    productionMetadataUnchanged: true,
  };
  writeJson(join(outputDir, 'cleanup-no-signal-proof.json'), cleanupNoSignalProof);
  writeJson(join(outputDir, 'cleanup-proof.json'), cleanupNoSignalProof);

  const command = `node .oh/tasks/pm2-pi-supervision/fixture/run-faults.mjs --story ${options.story} --candidate ${options.candidate} --manifest .oh/tasks/pm2-pi-supervision/evidence/benchmark-manifest.json --output .oh/tasks/pm2-pi-supervision/evidence/${options.story}`;
  const verification = {
    kind: 'story-run',
    story: options.story,
    candidate: options.candidate,
    command,
    status: 'PASS',
    result: 'NOT RUN',
    exitCode: 0,
    startedAtUtc,
    endedAtUtc: new Date().toISOString(),
    durationNs: (process.hrtime.bigint() - startedNs).toString(),
    manifestHashBefore: manifestHash,
    manifestHashAfter: sha256(readFileSync(manifestPath)),
    frozenManifestUnchanged: true,
    prerequisiteCandidates: prerequisites,
    networkIsolation: network.status,
    notRunReason: reason,
    networkProofCommand: network.command,
    networkProbeExitCode: network.probeExitCode ?? 0,
    faultsPreregistered: 5,
    repetitionsPerFault: 3,
    requestedSlots: 15,
    measuredSlots: 0,
    notRunSlots: 15,
    comparableSlots: 0,
    candidateLaunchCount: 0,
    faultInjectionCount: 0,
    signalAttempts: 0,
    observationPerformed: false,
    slackRecoveryProofClaimed: false,
    productionMetadataOnly: true,
    productionContentRead: false,
    productionMetadataUnchanged: true,
    cleanupStatus: cleanupNoSignalProof.cleanupStatus,
    remainingOwnedPids: [],
  };
  appendVerification(join(outputDir, 'verification.jsonl'), verification);
  process.stdout.write(`${JSON.stringify(verification)}\n`);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ status: 'FAIL', error: String(error.message) })}\n`);
    process.exit(1);
  });
}
