import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFrozenComparisonManifest,
  buildComparison,
  inventoryEvidence,
} from '../compare.mjs';

const taskRoot = resolve('.oh/tasks/pm2-pi-supervision');
const evidenceRoot = resolve(taskRoot, 'evidence');
const manifestBytes = readFileSync(resolve(evidenceRoot, 'benchmark-manifest.json'));
const manifestHash = createHash('sha256').update(manifestBytes).digest('hex');
const manifest = JSON.parse(manifestBytes);
const prd = JSON.parse(readFileSync(resolve(taskRoot, 'prd.json'), 'utf8'));

const expectedOrder = [
  'safety-cleanup-gate',
  'required-run-completeness',
  'lifecycle-success-count',
  'semantic-health-success-count',
  'observability-field-completeness',
  'median-recovery-latency',
  'operational-responsibility-count',
];

test('US-016 accepts only the unchanged frozen lexicographic contract', () => {
  assert.equal(manifestHash, 'ed79d0e7f623938e92e17cc2b3203b07074f5d796f0de3abeb5013700fc2e31b');
  assert.equal(assertFrozenComparisonManifest(manifest, manifestHash), true);
  const changedOrder = structuredClone(manifest);
  changedOrder.ordering.lexicographic = [...expectedOrder].reverse();
  assert.throws(() => assertFrozenComparisonManifest(changedOrder, manifestHash), /lexicographic ordering changed/);
  const changedWeightPolicy = structuredClone(manifest);
  changedWeightPolicy.measurement.imputation = true;
  assert.throws(() => assertFrozenComparisonManifest(changedWeightPolicy, manifestHash), /retry or imputation policy changed/);
});

test('traceability reads and hashes every bounded US-005 through US-015 evidence file', () => {
  const inventory = inventoryEvidence(evidenceRoot);
  assert.ok(inventory.length >= 124);
  assert.deepEqual([...new Set(inventory.map(({ story }) => story))], [
    'US-005', 'US-006', 'US-007', 'US-008', 'US-009', 'US-010',
    'US-011', 'US-012', 'US-013', 'US-014', 'US-015',
  ]);
  assert.ok(inventory.reduce((sum, { bytes }) => sum + bytes, 0) > 0);
  assert.ok(inventory.every(({ bytes, sha256 }) => bytes >= 0 && /^[a-f0-9]{64}$/.test(sha256)));
});

test('all safe NOT RUN candidates remain one non-comparable tie group with no ranks or imputed scores', () => {
  const comparison = buildComparison({ manifest, manifestHash, evidenceRoot, prd });
  assert.equal(comparison.comparisonOutcome, 'NON_COMPARABLE_ALL_TIE_UNRANKED');
  assert.deepEqual(comparison.lexicographicOrder, expectedOrder);
  assert.equal(comparison.requestedFaultSlots, 75);
  assert.equal(comparison.measuredFaultSlots, 0);
  assert.equal(comparison.comparableFaultSlots, 0);
  assert.equal(comparison.rankedCandidateCount, 0);
  assert.equal(comparison.tiedCandidateCount, 5);
  assert.equal(comparison.imputation, false);
  assert.equal(comparison.weighting, 'FROZEN_ONLY');
  for (const candidate of comparison.candidateScores) {
    assert.equal(candidate.evidenceStatus, 'NOT RUN');
    assert.equal(candidate.comparable, false);
    assert.equal(candidate.rank, null);
    assert.equal(candidate.tieGroup, 'all-candidates-not-run');
    assert.equal(candidate.orderingApplied, false);
    assert.equal(candidate.evidenceScore['safety-cleanup-gate'], 'PASS_SAFE_NOT_RUN');
    for (const field of expectedOrder.slice(1)) assert.equal(candidate.evidenceScore[field], null);
    assert.equal(candidate.operationalResponsibilityCount, null);
    assert.equal(candidate.operationalResponsibilityCountStatus, 'LIVE-UNVERIFIED');
    assert.equal(candidate.residualResponsibilityCount, 8);
  }
});

test('comparison preserves explicit blockers and the separate human decision boundary', () => {
  const comparison = buildComparison({ manifest, manifestHash, evidenceRoot, prd });
  assert.match(comparison.commonBlocker, /namespace isolation is unavailable/);
  assert.ok(comparison.candidateScores.every(({ blocker }) => blocker.includes('NOT RUN') || blocker.includes('namespace unavailable')));
  assert.equal(comparison.selectionAuthority, false);
  assert.match(comparison.selectionRequires, /separate human-approved issue or ADR/);
});

test('comparison implementation has no process, network, PM2, Pi, or production-content access path', () => {
  const source = readFileSync(new URL('../compare.mjs', import.meta.url), 'utf8');
  assert.equal(source.includes("from 'node:child_process'"), false);
  assert.equal(source.includes("from 'node:net'"), false);
  assert.equal(source.includes("from './contract.mjs'"), false);
  assert.equal(source.includes('spawn('), false);
  assert.equal(source.includes('execFile('), false);
  assert.equal(source.includes('process.kill('), false);
  assert.equal(source.includes('snapshotProductionMetadata'), false);
});
