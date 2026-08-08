#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { appendVerification, writeBoundedFile } from './evidence.mjs';
import { proveDeniedNetwork } from './contract.mjs';
import { scan as scanSecrets } from './secret-scan.mjs';

const TASK_ROOT = resolve('.oh/tasks/pm2-pi-supervision');
const FIXTURE_ROOT = join(TASK_ROOT, 'fixture');
const TERMINAL_REPORTS = Object.freeze(['critique-final-evidence.md', 'critique-final-safety-scope.md']);
const TERMINAL_SOURCE_STORIES = Object.freeze(Array.from({ length: 11 }, (_, index) => `US-${String(index + 5).padStart(3, '0')}`));
const AUTHORIZED_METADATA_COMMANDS = Object.freeze([
  'git-diff-paths',
  'git-status',
  'process-identities',
  'tmux-session-identities',
]);

function argsOf(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    if (!argv[index].startsWith('--') || argv[index + 1] === undefined) throw new Error(`invalid argument: ${argv[index]}`);
    result[argv[index].slice(2)] = argv[index + 1];
  }
  return result;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function assertTaskPath(path) {
  const rel = relative(TASK_ROOT, path);
  assert(rel && rel !== '..' && !rel.startsWith('../') && !rel.startsWith('..\\'), 'evidence path must be inside task root');
}

function writeJson(path, value) {
  writeBoundedFile(path, `${JSON.stringify(value, null, 2)}\n`, { worktreeRoot: resolve('.') });
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function sourceRecord(path) {
  const bytes = readFileSync(path);
  return { path: relative(TASK_ROOT, path), sha256: sha256(bytes), bytes: bytes.length };
}

function verifyManifest(manifest) {
  assert(manifest.schemaVersion === 1, 'manifest schemaVersion');
  assert(manifest.status === 'FROZEN_PRE_OBSERVATION', 'manifest must be frozen pre-observation');
  assert(Array.isArray(manifest.candidates) && manifest.candidates.map((x) => x.id).join(',') === 'baseline,pm2-direct-rpc,pm2-rpc-host-wrapper,pm2-direct-no-mode,pm2-pty-control', 'candidate definitions');
  assert(manifest.candidates.every((candidate) => typeof candidate.readySignal === 'string' && candidate.readySignal.length > 0), 'candidate ready signals');
  assert(manifest.networkProof.requiredBeforeEveryCandidateLaunch === true && manifest.networkProof.unavailableOrFailed.includes('NOT RUN'), 'network proof gate');
  assert(manifest.measurement.measuredRepetitions === 3, 'three measured repetitions');
  assert(manifest.measurement.warmupsCounted === false && manifest.measurement.selectiveRetries === false && manifest.measurement.imputation === false, 'repetition policy');
  assert(manifest.clocks.duration === 'monotonic-nanoseconds' && manifest.clocks.audit === 'UTC-ISO-8601', 'clock policy');
  assert(JSON.stringify(manifest.deadlinesSeconds) === JSON.stringify({ ready: 15, idle: 30, detection: 10, recovery: 30, cleanup: 10, totalRepetition: 120 }), 'deadlines');
  assert(manifest.faults.order.join(',') === 'clean-exit,non-zero-exit,rapid-crash-loop,SIGTERM,synthetic-live-unhealthy-sentinel', 'fault order');
  assert(manifest.faults.rapidCrashLoop.definition === 'three forced non-zero exits within 15 seconds', 'rapid loop');
  assert(manifest.aggregation.metrics.join(',') === 'median,inclusive-min-max' && manifest.aggregation.successCount === 'n/3', 'aggregation');
  assert(manifest.ordering.lexicographic.join(',') === 'safety-cleanup-gate,required-run-completeness,lifecycle-success-count,semantic-health-success-count,observability-field-completeness,median-recovery-latency,operational-responsibility-count', 'ordering');
  assert(manifest.ordering.ties === 'remain-ties' && manifest.ordering.notRunAndFailed === 'not-comparable-not-zero', 'tie/NOT RUN policy');
  assert(manifest.sentinel.stderrSymptom === 'SYNTHETIC_STALE_CONTEXT' && manifest.sentinel.childPid === 'same-and-running' && manifest.sentinel.classification === 'simulation-not-proof-of-Slack-recovery', 'sentinel');
  assert(manifest.amendments.protocolChangeAfterObservation === 'invalidate-prior-comparisons-and-fully-rerun-every-affected-candidate', 'amendment policy');
  assert(manifest.evidence.maxRetainedLogBytes === 1048576 && manifest.evidence.syntheticOnly === true && manifest.evidence.secretScan.requiredBeforeStaging === true, 'evidence policy');
  assert(manifest.constraints.environment.launchSemantics === 'env -i allowlist only' && manifest.constraints.network.unprovenResult === 'NOT RUN', 'environment/network constraint');
  assert(manifest.constraints.process.ownership === 'exact PID plus /proc start-time plus parent/namespace' && manifest.constraints.production.contentInspection === 'prohibited', 'process/production constraint');
}

export function verifyTerminalReport(report, name = 'terminal report') {
  const footers = [...report.matchAll(/^Final verdict: PASS \(H(\d+) \/ M(\d+) \/ L(\d+)\)\.$/gm)];
  assert(footers.length > 0, `${name} has no exact PASS footer`);
  const latest = footers.at(-1);
  assert(latest[1] === '0' && latest[2] === '0' && latest[3] === '0', `${name} latest footer is not H0/M0/L0`);
  return { verdict: 'PASS', high: 0, medium: 0, low: 0 };
}

export function buildTerminalCleanupProof(taskRoot = TASK_ROOT) {
  const sourceProofs = [];
  const totals = {
    candidateLaunchCount: 0,
    runtimeRootsCreated: 0,
    registeredOwnedProcessCount: 0,
    signalAttempts: 0,
    remainingOwnedPids: 0,
  };
  for (const story of TERMINAL_SOURCE_STORIES) {
    const path = join(taskRoot, 'evidence', story, 'cleanup-proof.json');
    const proof = readJson(path);
    assert(proof.status === 'clean-no-candidate-launched', `${story} cleanup status`);
    assert(proof.candidateLaunchCount === 0, `${story} candidate launch count`);
    assert(proof.runtimeRootsCreated === 0, `${story} runtime root count`);
    assert(proof.registeredOwnedProcessCount === 0, `${story} registered owned process count`);
    assert(proof.signalAttempts === 0, `${story} signal attempt count`);
    assert(Array.isArray(proof.remainingOwnedPids) && proof.remainingOwnedPids.length === 0, `${story} remaining owned PIDs`);
    assert(proof.residue === 'none-created' && proof.idempotent === true, `${story} cleanup residue/idempotence`);
    for (const key of Object.keys(totals)) totals[key] += key === 'remainingOwnedPids' ? proof.remainingOwnedPids.length : proof[key];
    sourceProofs.push({ story, ...sourceRecord(path) });
  }
  return {
    kind: 'terminal-cleanup-no-owned-process-proof',
    story: 'US-019',
    status: 'PASS',
    proofScope: 'fixture-owned process and runtime-root records from the already-captured bounded safe-stop runs',
    sourceProofCount: sourceProofs.length,
    sourceProofs,
    ...totals,
    ownedProcessState: 'none-created; none-remaining',
    cleanupRequired: false,
    residue: 'none-created',
    currentAmbientProcessInventoryCaptured: false,
    globalAmbientProcessIdentityEqualityClaimed: false,
  };
}

export function buildTerminalMetadataBoundaryProof(taskRoot = TASK_ROOT) {
  const sourceDeltas = [];
  for (const story of TERMINAL_SOURCE_STORIES) {
    const path = join(taskRoot, 'evidence', story, 'production-metadata-delta.json');
    const delta = readJson(path);
    assert(delta.kind === 'production-metadata-delta', `${story} metadata kind`);
    assert(delta.metadataOnly === true && delta.productionContentRead === false, `${story} metadata/content boundary`);
    assert(delta.unchanged === true, `${story} bounded metadata delta changed`);
    assert(Array.isArray(delta.commands) && delta.commands.length === AUTHORIZED_METADATA_COMMANDS.length, `${story} metadata command count`);
    assert(JSON.stringify(delta.commands.map(({ name }) => name).sort()) === JSON.stringify([...AUTHORIZED_METADATA_COMMANDS].sort()), `${story} unauthorized metadata command`);
    for (const command of delta.commands) {
      assert(command.unchanged === true, `${story}/${command.name} bounded delta changed`);
      assert(command.beforeSha256 === command.afterSha256, `${story}/${command.name} bounded hashes differ`);
      assert(Array.isArray(command.added) && command.added.length === 0, `${story}/${command.name} additions`);
      assert(Array.isArray(command.removed) && command.removed.length === 0, `${story}/${command.name} removals`);
    }
    sourceDeltas.push({ story, ...sourceRecord(path), commandNames: delta.commands.map(({ name }) => name).sort() });
  }
  return {
    kind: 'terminal-production-metadata-boundary-proof',
    story: 'US-019',
    status: 'PASS',
    metadataOnly: true,
    productionContentRead: false,
    authorizedIdentityMetadata: {
      'git-status': 'tracked changed-path status only',
      'git-diff-paths': 'tracked changed-path names only',
      'tmux-session-identities': 'session name, ID, creation time, and attached flag only',
      'process-identities': 'PID, parent PID, start time, and command name only',
    },
    sourceDeltaCount: sourceDeltas.length,
    sourceDeltas,
    everyCapturedPerRunDeltaUnchanged: true,
    proofScope: 'each already-captured bounded pre/post delta independently; no new live metadata capture',
    currentAmbientIdentitySnapshotCaptured: false,
    volatileAmbientProcessIdentitiesGloballyIdenticalClaimed: false,
    globalContinuityClaimed: false,
  };
}

export function scanTerminalPolicy(assessment) {
  const marker = '## Terminal First Mate synthesis';
  assert(assessment.includes(marker), 'terminal synthesis heading missing');
  const terminal = assessment.slice(assessment.indexOf(marker));
  const prohibitedLabels = ['a' + 'dopt', 'recomm' + 'ended', 'win' + 'ner'];
  const findings = prohibitedLabels.filter((word) => new RegExp(`\\b${word}\\b`, 'i').test(terminal));
  const requiredLabels = ['SOURCE-VERIFIED', 'LIVE-VERIFIED', 'LIVE-UNVERIFIED', 'NOT RUN'];
  const labelsComplete = requiredLabels.every((label) => terminal.includes(label));
  const separateDecisionBoundaryPresent = /Any selection requires a separate human-approved issue or ADR\./.test(terminal);
  const scoresStart = terminal.indexOf('### Scores and ties');
  const scoresEnd = terminal.indexOf('The safety/cleanup score', scoresStart);
  const scoreTable = scoresStart >= 0 && scoresEnd > scoresStart ? terminal.slice(scoresStart, scoresEnd) : '';
  const candidateNotRunRows = (scoreTable.match(/\| NOT RUN \|/g) ?? []).length;
  const placeholderAbsent = !/remains blocked on the independent US-017 and US-018 reports/i.test(terminal);
  const metadataQualificationPresent = /does not prove globally identical volatile ambient process identities/i.test(terminal);
  const noProductionChangeBoundaryPresent = /No production runtime, configuration, default, or state was changed by this study/i.test(terminal);
  return {
    kind: 'terminal-policy-scan',
    story: 'US-019',
    status: findings.length === 0 && labelsComplete && separateDecisionBoundaryPresent && candidateNotRunRows === 5 && placeholderAbsent && metadataQualificationPresent && noProductionChangeBoundaryPresent ? 'PASS' : 'FAIL',
    scannedArtifact: 'assessment.md#terminal-first-mate-synthesis',
    prohibitedOutputLabelFindingCount: findings.length,
    prohibitedOutputLabelFindings: findings,
    claimVocabularyComplete: labelsComplete,
    candidateNotRunRowCount: candidateNotRunRows,
    allCandidateBehaviorNonComparable: candidateNotRunRows === 5,
    placeholderAbsent,
    metadataQualificationPresent,
    separateHumanDecisionBoundaryPresent: separateDecisionBoundaryPresent,
    selectionAuthority: false,
    migrationOrRolloutAuthority: false,
    productionConfigurationSupplied: false,
    defaultChangeSupplied: false,
    productionStateChangeAuthorized: false,
    noProductionChangeBoundaryPresent,
  };
}

export function validateTerminalPassState(prd) {
  assert(prd.userStories?.length === 19, 'expected 19 stories');
  for (let number = 1; number <= 18; number += 1) {
    const id = `US-${String(number).padStart(3, '0')}`;
    assert(prd.userStories.find((story) => story.id === id)?.passes === true, `${id} dependency is not First-Mate-passed`);
  }
  const terminal = prd.userStories.find(({ id }) => id === 'US-019');
  assert(terminal?.passes === false, 'US-019 must remain false during delegated verification');
  return { dependencyStoriesPassed: 18, us019PassState: false, passStateMutationPerformed: false };
}

function verifyUS019(evidenceDir) {
  const startedAtUtc = new Date().toISOString();
  const startedNs = process.hrtime.bigint();
  const reports = TERMINAL_REPORTS.map((name) => {
    const path = join(TASK_ROOT, name);
    return { name, result: verifyTerminalReport(readFileSync(path, 'utf8'), name), ...sourceRecord(path) };
  });
  const passState = validateTerminalPassState(readJson(join(TASK_ROOT, 'prd.json')));
  const comparison = readJson(join(TASK_ROOT, 'evidence', 'US-016', 'comparison.json'));
  assert(comparison.status === 'PASS' && comparison.requestedFaultSlots === 75, 'comparison evidence status/slot count');
  assert(comparison.measuredFaultSlots === 0 && comparison.comparableFaultSlots === 0 && comparison.rankedCandidateCount === 0, 'candidate behavior became measured/comparable/ranked');
  assert(comparison.tiedCandidateCount === 5 && comparison.selectionAuthority === false, 'tie/selection boundary changed');
  assert(comparison.candidateScores.every(({ evidenceStatus, comparable, rank }) => evidenceStatus === 'NOT RUN' && comparable === false && rank === null), 'candidate score is not non-comparable NOT RUN');
  const priorPolicy = readJson(join(TASK_ROOT, 'evidence', 'US-016', 'policy-scan.json'));
  assert(priorPolicy.status === 'PASS' && priorPolicy.selectionAuthority === false, 'US-016 policy boundary failed');

  const cleanup = buildTerminalCleanupProof();
  const metadata = buildTerminalMetadataBoundaryProof();
  const policy = scanTerminalPolicy(readFileSync(join(TASK_ROOT, 'assessment.md'), 'utf8'));
  assert(policy.status === 'PASS', 'terminal assessment policy scan failed');
  mkdirSync(evidenceDir, { recursive: true, mode: 0o700 });
  chmodSync(evidenceDir, 0o700);
  writeJson(join(evidenceDir, 'cleanup-proof.json'), cleanup);
  writeJson(join(evidenceDir, 'production-metadata-boundary-proof.json'), metadata);
  writeJson(join(evidenceDir, 'policy-scan.json'), policy);
  const secretScan = scanSecrets(join(TASK_ROOT, 'evidence'));
  assert(secretScan.status === 'PASS', 'terminal secret scan failed');
  writeJson(join(evidenceDir, 'secret-scan.json'), {
    kind: 'terminal-secret-scan',
    story: 'US-019',
    ...secretScan,
    scope: 'task-local evidence tree as it existed after cleanup, metadata-boundary, and policy proofs were written',
  });

  const result = {
    kind: 'story-verify',
    story: 'US-019',
    command: 'timeout 180s node .oh/tasks/pm2-pi-supervision/fixture/verify.mjs --story US-019 --evidence .oh/tasks/pm2-pi-supervision/evidence/US-019',
    status: 'PASS',
    exitCode: 0,
    startedAtUtc,
    endedAtUtc: new Date().toISOString(),
    durationNs: (process.hrtime.bigint() - startedNs).toString(),
    terminalReports: reports,
    ...passState,
    candidateBehaviorStatus: 'NOT RUN',
    requestedFaultSlots: 75,
    measuredFaultSlots: 0,
    comparableFaultSlots: 0,
    rankedCandidateCount: 0,
    tiedCandidateCount: 5,
    cleanupStatus: cleanup.status,
    registeredOwnedProcessCount: cleanup.registeredOwnedProcessCount,
    remainingOwnedPids: cleanup.remainingOwnedPids,
    metadataBoundaryStatus: metadata.status,
    everyCapturedPerRunDeltaUnchanged: metadata.everyCapturedPerRunDeltaUnchanged,
    volatileAmbientProcessIdentitiesGloballyIdenticalClaimed: false,
    policyStatus: policy.status,
    secretScanStatus: secretScan.status,
    productionContentRead: false,
    selectionAuthority: false,
    selectionRequires: 'a separate human-approved issue or ADR',
  };
  appendVerification(join(evidenceDir, 'verification.jsonl'), result);
  return result;
}

async function main() {
  const options = argsOf(process.argv.slice(2));
  assert(['US-003', 'US-004', 'US-019'].includes(options.story), 'verify supports exactly US-003, US-004, and US-019');
  assert(options.evidence, '--evidence required');
  const evidenceDir = resolve(options.evidence);
  assertTaskPath(evidenceDir);
  if (options.story === 'US-019') {
    assert(!options.manifest, 'US-019 does not accept a manifest argument');
    const result = verifyUS019(evidenceDir);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }

  mkdirSync(evidenceDir, { recursive: true, mode: 0o700 });
  chmodSync(evidenceDir, 0o700);
  const startedAtUtc = new Date().toISOString();
  const startedNs = process.hrtime.bigint();
  const files = ['baseline.mjs', 'contract.mjs', 'evidence.mjs', 'jsonl.mjs', 'lifecycle.mjs', 'process-registry.mjs', 'secret-scan.mjs', 'verify.mjs'];
  for (const file of files) assert(statSync(join(FIXTURE_ROOT, file)).isFile(), `missing fixture file: ${file}`);
  const network = proveDeniedNetwork();
  let manifestHash = null;
  if (options.story === 'US-004') {
    assert(options.manifest, '--manifest required for US-004');
    const manifestPath = resolve(options.manifest);
    assertTaskPath(manifestPath);
    const bytes = readFileSync(manifestPath);
    verifyManifest(JSON.parse(bytes));
    manifestHash = sha256(bytes);
    const hashPath = join(evidenceDir, 'manifest.sha256');
    const hashRecord = `${manifestHash}  .oh/tasks/pm2-pi-supervision/evidence/benchmark-manifest.json\n`;
    if (existsSync(hashPath)) assert(readFileSync(hashPath, 'utf8') === hashRecord, 'existing manifest hash record does not match frozen manifest');
    else writeFileSync(hashPath, hashRecord, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  } else {
    assert(!options.manifest, 'US-003 must not accept or observe a benchmark manifest');
  }
  const result = {
    story: options.story,
    status: 'PASS',
    candidateLaunched: false,
    observationPerformed: false,
    networkIsolation: network.status,
    networkNotRunReason: network.status === 'NOT RUN' ? network.reason : null,
    manifestHash,
    startedAtUtc,
    endedAtUtc: new Date().toISOString(),
    durationNs: (process.hrtime.bigint() - startedNs).toString(),
  };
  const command = options.story === 'US-004'
    ? 'timeout 180s node .oh/tasks/pm2-pi-supervision/fixture/verify.mjs --story US-004 --manifest .oh/tasks/pm2-pi-supervision/evidence/benchmark-manifest.json --evidence .oh/tasks/pm2-pi-supervision/evidence/US-004'
    : 'timeout 180s node .oh/tasks/pm2-pi-supervision/fixture/verify.mjs --story US-003 --evidence .oh/tasks/pm2-pi-supervision/evidence/US-003';
  appendVerification(join(evidenceDir, 'verification.jsonl'), { kind: 'story-verify', command, exitCode: 0, ...result });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ status: 'FAIL', error: String(error.message) })}\n`);
    process.exit(1);
  });
}
