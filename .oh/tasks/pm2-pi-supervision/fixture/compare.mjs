#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { appendVerification, writeBoundedFile } from './evidence.mjs';

const TASK_ROOT = resolve('.oh/tasks/pm2-pi-supervision');
const EXPECTED_MANIFEST_HASH = 'ed79d0e7f623938e92e17cc2b3203b07074f5d796f0de3abeb5013700fc2e31b';
const EXPECTED_ORDER = Object.freeze([
  'safety-cleanup-gate',
  'required-run-completeness',
  'lifecycle-success-count',
  'semantic-health-success-count',
  'observability-field-completeness',
  'median-recovery-latency',
  'operational-responsibility-count',
]);
const FAULT_STORIES = Object.freeze({
  'US-011': 'baseline',
  'US-012': 'pm2-direct-rpc',
  'US-013': 'pm2-rpc-host-wrapper',
  'US-014': 'pm2-direct-no-mode',
  'US-015': 'pm2-pty-control',
});
const CHARACTERIZATION_STORIES = Object.freeze([
  'US-005', 'US-006', 'US-007', 'US-008', 'US-009', 'US-010',
]);
const FAULTS = Object.freeze([
  'clean-exit',
  'non-zero-exit',
  'rapid-crash-loop',
  'SIGTERM',
  'synthetic-live-unhealthy-sentinel',
]);
const RESIDUAL_RESPONSIBILITIES = Object.freeze([
  'preserve the required Pi process mode and terminal semantics',
  'retain and supervise the public stderr health surface',
  'detect the synthetic live-unhealthy symptom while the child remains alive',
  'block ordinary work until an externally observable recovery action',
  'perform and attribute semantic recovery rather than lifecycle-only restart',
  'maintain heartbeat and state observability',
  'bound retained logs and diagnostic output',
  'perform any bridge-lock cleanup required by the current source design',
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
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

function writeJson(path, value) {
  writeBoundedFile(path, `${JSON.stringify(value, null, 2)}\n`, { worktreeRoot: resolve('.') });
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readJsonl(path) {
  return readFileSync(path, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

export function assertFrozenComparisonManifest(manifest, manifestHash) {
  assert(manifestHash === EXPECTED_MANIFEST_HASH, 'frozen benchmark manifest hash changed');
  assert(manifest.schemaVersion === 1 && manifest.status === 'FROZEN_PRE_OBSERVATION', 'manifest is not frozen pre-observation');
  assert(manifest.candidateObservationCountAtFreeze === 0, 'manifest was not frozen before observation');
  assert(manifest.measurement?.measuredRepetitions === 3, 'measurement repetition count changed');
  assert(manifest.measurement?.selectiveRetries === false && manifest.measurement?.imputation === false, 'retry or imputation policy changed');
  assert(manifest.aggregation?.noImputation === true && manifest.aggregation?.notRun === 'not comparable', 'NOT RUN aggregation policy changed');
  assert(JSON.stringify(manifest.ordering?.lexicographic) === JSON.stringify(EXPECTED_ORDER), 'lexicographic ordering changed');
  assert(manifest.ordering?.ties === 'remain-ties', 'tie policy changed');
  assert(manifest.ordering?.notRunAndFailed === 'not-comparable-not-zero', 'NOT RUN ordering policy changed');
  assert(Array.isArray(manifest.amendments?.current) && manifest.amendments.current.length === 0, 'manifest contains an amendment requiring rerun analysis');
  return true;
}

function filesUnder(path) {
  const files = [];
  const visit = (current) => {
    const stat = lstatSync(current);
    assert(!stat.isSymbolicLink(), `symlink evidence is prohibited: ${relative(TASK_ROOT, current)}`);
    if (stat.isDirectory()) for (const entry of readdirSync(current).sort()) visit(join(current, entry));
    else if (stat.isFile()) files.push(current);
  };
  visit(path);
  return files;
}

export function inventoryEvidence(evidenceRoot) {
  const inventory = [];
  for (let number = 5; number <= 15; number += 1) {
    const story = `US-${String(number).padStart(3, '0')}`;
    const storyDir = join(evidenceRoot, story);
    assert(lstatSync(storyDir).isDirectory(), `missing evidence directory: ${story}`);
    for (const path of filesUnder(storyDir)) {
      const bytes = readFileSync(path);
      const text = bytes.toString('utf8');
      let records = null;
      if (path.endsWith('.json')) {
        JSON.parse(text);
        records = 1;
      } else if (path.endsWith('.jsonl')) {
        records = text.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line)).length;
      }
      inventory.push({
        story,
        path: relative(TASK_ROOT, path),
        bytes: bytes.length,
        sha256: sha256(bytes),
        records,
      });
    }
  }
  return inventory;
}

function assertSharedVerification(story, evidenceRoot) {
  const rows = readJsonl(join(evidenceRoot, story, 'verification.jsonl'));
  const requiredCommands = [
    'timeout 180s node --test .oh/tasks/pm2-pi-supervision/fixture/tests/*.test.mjs',
    "find .oh/tasks/pm2-pi-supervision/fixture -type f -name '*.mjs' -print0 | sort -z | xargs -0 -r -n1 node --check",
    'timeout 180s pnpm typecheck',
    'timeout 180s node .oh/tasks/pm2-pi-supervision/fixture/secret-scan.mjs .oh/tasks/pm2-pi-supervision/evidence',
  ];
  for (const command of requiredCommands) {
    assert(rows.some((row) => row.kind === 'command' && row.command === command && row.exitCode === 0), `${story} missing passing shared command: ${command}`);
  }
  return rows.length;
}

function validateCharacterizations(evidenceRoot, manifestHash) {
  return CHARACTERIZATION_STORIES.map((story) => {
    const aggregate = readJson(join(evidenceRoot, story, 'aggregate.json'));
    assert(aggregate.story === story, `${story} aggregate story mismatch`);
    assert(aggregate.status === 'NOT RUN', `${story} is not verified NOT RUN`);
    assert(aggregate.measuredRepetitions === 0, `${story} unexpectedly contains measurements`);
    assert(aggregate.requiredRunCompleteness === '0/3', `${story} completeness was imputed`);
    assert(aggregate.imputation === false && aggregate.selectiveRetries === false, `${story} retry/imputation policy violated`);
    assert(aggregate.manifestHash === manifestHash, `${story} manifest hash mismatch`);
    assertSharedVerification(story, evidenceRoot);
    return { story, status: aggregate.status, measuredRows: 0, comparableRows: 0, blocker: aggregate.reason };
  });
}

export function buildComparison({ manifest, manifestHash, evidenceRoot, prd }) {
  assertFrozenComparisonManifest(manifest, manifestHash);
  const candidateScores = [];
  let requestedSlots = 0;
  let measuredSlots = 0;
  let comparableSlots = 0;
  for (const [story, candidate] of Object.entries(FAULT_STORIES)) {
    const storyRecord = prd.userStories?.find(({ id }) => id === story);
    assert(storyRecord?.passes === true, `${story} is not First-Mate-passed`);
    const aggregate = readJson(join(evidenceRoot, story, 'aggregate.json'));
    const matrix = readJson(join(evidenceRoot, story, 'fault-matrix.json'));
    const rows = readJsonl(join(evidenceRoot, story, 'run.jsonl'));
    const cleanup = readJson(join(evidenceRoot, story, 'cleanup-proof.json'));
    const metadata = readJson(join(evidenceRoot, story, 'production-metadata-delta.json'));
    assert(aggregate.story === story && aggregate.candidate === candidate, `${story} candidate mismatch`);
    assert(aggregate.status === 'NOT RUN' && aggregate.comparable === false, `${story} must remain non-comparable NOT RUN`);
    assert(aggregate.requestedSlots === 15 && aggregate.measuredSlots === 0 && aggregate.comparableSlots === 0, `${story} slot counts changed`);
    assert(aggregate.notRunSlots === 15 && aggregate.requiredRunCompleteness === '0/15', `${story} NOT RUN completeness changed`);
    assert(aggregate.lifecycleSuccessCount === null && aggregate.semanticHealthSuccessCount === null, `${story} success count was imputed`);
    assert(aggregate.metrics?.recoveryLatencyNs === null, `${story} recovery latency was imputed`);
    assert(aggregate.imputation === false && aggregate.selectiveRetries === false, `${story} retry/imputation policy violated`);
    assert(aggregate.manifestHash === manifestHash && matrix.manifestHash === manifestHash, `${story} manifest hash mismatch`);
    assert(JSON.stringify(aggregate.faultOrder) === JSON.stringify(FAULTS), `${story} fault order changed`);
    assert(rows.length === 15 && rows.every((row) => row.status === 'NOT RUN' && row.comparable === false), `${story} raw rows are not all non-comparable NOT RUN`);
    assert(rows.every((row) => row.observationPerformed === false && row.candidateLaunched === false && row.faultInjected === false), `${story} unexpectedly observed behavior`);
    assert(rows.every((row) => row.lifecycleSuccessCount === undefined && row.recoveryLatencyNs === null), `${story} raw metrics were imputed`);
    assert(cleanup.status === 'clean-no-candidate-launched' && cleanup.registeredOwnedProcessCount === 0 && cleanup.remainingOwnedPids.length === 0, `${story} cleanup gate failed`);
    assert(metadata.metadataOnly === true && metadata.productionContentRead === false && metadata.unchanged === true, `${story} production metadata boundary failed`);
    assertSharedVerification(story, evidenceRoot);
    requestedSlots += aggregate.requestedSlots;
    measuredSlots += aggregate.measuredSlots;
    comparableSlots += aggregate.comparableSlots;
    candidateScores.push({
      candidate,
      story,
      evidenceStatus: 'NOT RUN',
      comparable: false,
      rank: null,
      tieGroup: 'all-candidates-not-run',
      orderingApplied: false,
      orderingStopReason: 'NOT RUN is not comparable and is never converted to zero',
      evidenceScore: {
        'safety-cleanup-gate': 'PASS_SAFE_NOT_RUN',
        'required-run-completeness': null,
        'lifecycle-success-count': null,
        'semantic-health-success-count': null,
        'observability-field-completeness': null,
        'median-recovery-latency': null,
        'operational-responsibility-count': null,
      },
      observedCompleteness: '0/15',
      operationalResponsibilityCount: null,
      operationalResponsibilityCountStatus: 'LIVE-UNVERIFIED',
      residualResponsibilityCount: RESIDUAL_RESPONSIBILITIES.length,
      residualResponsibilities: [...RESIDUAL_RESPONSIBILITIES],
      blocker: aggregate.reason,
      evidence: [
        `evidence/${story}/aggregate.json`,
        `evidence/${story}/fault-matrix.json`,
        `evidence/${story}/run.jsonl`,
        `evidence/${story}/cleanup-proof.json`,
        `evidence/${story}/production-metadata-delta.json`,
        `evidence/${story}/verification.jsonl`,
      ],
    });
  }
  assert(requestedSlots === 75 && measuredSlots === 0 && comparableSlots === 0, 'cross-candidate slot totals changed');
  return {
    schemaVersion: 1,
    story: 'US-016',
    status: 'PASS',
    comparisonOutcome: 'NON_COMPARABLE_ALL_TIE_UNRANKED',
    manifestHash,
    manifestStatus: manifest.status,
    amendments: 0,
    lexicographicOrder: [...EXPECTED_ORDER],
    weighting: 'FROZEN_ONLY',
    imputation: false,
    selectiveRetries: false,
    requestedFaultSlots: requestedSlots,
    measuredFaultSlots: measuredSlots,
    comparableFaultSlots: comparableSlots,
    rankedCandidateCount: 0,
    tiedCandidateCount: candidateScores.length,
    tiePolicy: manifest.ordering.ties,
    notRunPolicy: manifest.ordering.notRunAndFailed,
    uncertainty: 'All runtime behavior, lifecycle outcomes, semantic-health outcomes, observability completeness, recovery latency, and operational-responsibility counts remain unmeasured.',
    commonBlocker: 'Fresh unprivileged user/network namespace isolation is unavailable; candidate launch is prohibited.',
    residualResponsibilityCatalog: [...RESIDUAL_RESPONSIBILITIES],
    residualResponsibilityCountPerCandidate: RESIDUAL_RESPONSIBILITIES.length,
    candidateScores,
    selectionAuthority: false,
    selectionRequires: 'a separate human-approved issue or ADR',
  };
}

function policyScan(assessment, comparison) {
  const prohibitedTerms = ['a' + 'dopt', 'recomm' + 'ended', 'win' + 'ner'];
  const scanned = `${assessment}\n${JSON.stringify(comparison)}`.toLowerCase();
  const termFindings = prohibitedTerms.filter((term) => new RegExp(`\\b${term}\\b`, 'i').test(scanned));
  const boundaryPresent = /separate human-approved issue or ADR/i.test(scanned);
  const claimLabelsPresent = ['SOURCE-VERIFIED', 'LIVE-VERIFIED', 'LIVE-UNVERIFIED', 'NOT RUN'].every((label) => assessment.includes(label));
  return {
    kind: 'comparison-policy-scan',
    story: 'US-016',
    status: termFindings.length === 0 && boundaryPresent && claimLabelsPresent ? 'PASS' : 'FAIL',
    scannedArtifacts: ['assessment.md', 'evidence/US-016/comparison.json'],
    prohibitedOutputLabelFindingCount: termFindings.length,
    prohibitedOutputLabelFindings: termFindings,
    claimVocabularyComplete: claimLabelsPresent,
    separateHumanDecisionBoundaryPresent: boundaryPresent,
    selectionAuthority: false,
    migrationOrRolloutAuthority: false,
    productionConfigurationSupplied: false,
    defaultChangeSupplied: false,
    postObservationWeighting: false,
    imputation: false,
  };
}

async function main() {
  const options = argsOf(process.argv.slice(2));
  assert(Object.keys(options).sort().join(',') === 'evidence-root,manifest,output,story', 'exactly --story, --manifest, --evidence-root, and --output are required');
  assert(options.story === 'US-016', 'compare.mjs supports exactly US-016');
  const manifestPath = resolve(options.manifest);
  const evidenceRoot = resolve(options['evidence-root']);
  const outputDir = resolve(options.output);
  assertTaskPath(manifestPath, 'manifest');
  assertTaskPath(evidenceRoot, 'evidence root');
  assertTaskPath(outputDir, 'output');
  assert(basename(manifestPath) === 'benchmark-manifest.json', 'unexpected manifest path');
  assert(outputDir === join(TASK_ROOT, 'evidence', 'US-016'), 'US-016 output path must be exact');

  const startedAtUtc = new Date().toISOString();
  const startedNs = process.hrtime.bigint();
  const manifestBytes = readFileSync(manifestPath);
  const manifestHash = sha256(manifestBytes);
  const manifest = JSON.parse(manifestBytes);
  assertFrozenComparisonManifest(manifest, manifestHash);
  const frozenHash = readFileSync(join(evidenceRoot, 'US-004', 'manifest.sha256'), 'utf8').trim().split(/\s+/)[0];
  assert(frozenHash === manifestHash, 'US-004 hash record does not match frozen manifest');
  const prd = readJson(join(TASK_ROOT, 'prd.json'));
  const storyRecord = prd.userStories?.find(({ id }) => id === 'US-016');
  assert(storyRecord?.passes === false, 'US-016 pass state must remain false during delegate execution');
  assert(JSON.stringify(storyRecord.dependsOn) === JSON.stringify(Object.keys(FAULT_STORIES)), 'US-016 dependencies changed');

  const inventory = inventoryEvidence(evidenceRoot);
  const characterizations = validateCharacterizations(evidenceRoot, manifestHash);
  const comparison = buildComparison({ manifest, manifestHash, evidenceRoot, prd });
  mkdirSync(outputDir, { recursive: true, mode: 0o700 });
  writeJson(join(outputDir, 'comparison.json'), comparison);

  const traceability = {
    kind: 'comparison-traceability',
    story: 'US-016',
    status: 'PASS',
    manifest: { path: 'evidence/benchmark-manifest.json', sha256: manifestHash, amendments: 0 },
    inputStoryRange: 'US-005..US-015',
    inputFileCount: inventory.length,
    inputByteCount: inventory.reduce((sum, file) => sum + file.bytes, 0),
    inputInventory: inventory,
    characterizationSummary: characterizations,
    faultSummary: {
      candidates: 5,
      requestedSlots: 75,
      notRunSlots: 75,
      measuredSlots: 0,
      comparableSlots: 0,
      candidateLaunchCount: 0,
      faultInjectionCount: 0,
      signalAttemptCount: 0,
      productionContentRead: false,
    },
    claims: [
      { id: 'manifest-frozen', label: 'SOURCE-VERIFIED', evidence: ['evidence/benchmark-manifest.json', 'evidence/US-004/manifest.sha256'] },
      { id: 'source-characterizations', label: 'SOURCE-VERIFIED', evidence: ['evidence/US-006/version-integrity-source.json', 'evidence/US-010/prerequisite.json'] },
      { id: 'runtime-results', label: 'NOT RUN', evidence: Object.keys(FAULT_STORIES).map((story) => `evidence/${story}/aggregate.json`) },
      { id: 'runtime-capabilities', label: 'LIVE-UNVERIFIED', evidence: Object.keys(FAULT_STORIES).map((story) => `evidence/${story}/fault-matrix.json`) },
      { id: 'bounded-verification', label: 'LIVE-VERIFIED', evidence: Object.keys(FAULT_STORIES).map((story) => `evidence/${story}/verification.jsonl`) },
    ],
  };
  writeJson(join(outputDir, 'traceability.json'), traceability);

  const assessment = readFileSync(join(TASK_ROOT, 'assessment.md'), 'utf8');
  const policy = policyScan(assessment, comparison);
  assert(policy.status === 'PASS', 'assessment/output policy scan failed');
  writeJson(join(outputDir, 'policy-scan.json'), policy);

  const command = 'timeout 180s node .oh/tasks/pm2-pi-supervision/fixture/compare.mjs --story US-016 --manifest .oh/tasks/pm2-pi-supervision/evidence/benchmark-manifest.json --evidence-root .oh/tasks/pm2-pi-supervision/evidence --output .oh/tasks/pm2-pi-supervision/evidence/US-016';
  const verification = {
    kind: 'story-compare',
    story: 'US-016',
    command,
    status: 'PASS',
    exitCode: 0,
    startedAtUtc,
    endedAtUtc: new Date().toISOString(),
    durationNs: (process.hrtime.bigint() - startedNs).toString(),
    manifestHash,
    inputFileCount: inventory.length,
    requestedFaultSlots: 75,
    measuredFaultSlots: 0,
    comparableFaultSlots: 0,
    rankedCandidateCount: 0,
    tiedCandidateCount: 5,
    imputation: false,
    postObservationWeighting: false,
    productionContentRead: false,
    policyStatus: policy.status,
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
