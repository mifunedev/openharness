import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildTerminalCleanupProof,
  buildTerminalMetadataBoundaryProof,
  scanTerminalPolicy,
  validateTerminalPassState,
  verifyTerminalReport,
} from '../verify.mjs';

const taskRoot = resolve('.oh/tasks/pm2-pi-supervision');

function read(path) {
  return readFileSync(resolve(taskRoot, path), 'utf8');
}

test('US-019 accepts only each terminal critic latest exact H0/M0/L0 PASS footer', () => {
  for (const name of ['critique-final-evidence.md', 'critique-final-safety-scope.md']) {
    assert.deepEqual(verifyTerminalReport(read(name), name), { verdict: 'PASS', high: 0, medium: 0, low: 0 });
  }
  assert.throws(
    () => verifyTerminalReport('Final verdict: PASS (H0 / M1 / L0).', 'mutated report'),
    /latest footer is not H0\/M0\/L0/,
  );
});

test('US-019 aggregates only the eleven bounded cleanup proofs and proves no fixture-owned process existed', () => {
  const proof = buildTerminalCleanupProof(taskRoot);
  assert.equal(proof.status, 'PASS');
  assert.equal(proof.sourceProofCount, 11);
  assert.equal(proof.candidateLaunchCount, 0);
  assert.equal(proof.runtimeRootsCreated, 0);
  assert.equal(proof.registeredOwnedProcessCount, 0);
  assert.equal(proof.signalAttempts, 0);
  assert.equal(proof.remainingOwnedPids, 0);
  assert.equal(proof.currentAmbientProcessInventoryCaptured, false);
  assert.equal(proof.globalAmbientProcessIdentityEqualityClaimed, false);
});

test('US-019 metadata proof uses only authorized identity fields and bounded per-run equality', () => {
  const proof = buildTerminalMetadataBoundaryProof(taskRoot);
  assert.equal(proof.status, 'PASS');
  assert.equal(proof.sourceDeltaCount, 11);
  assert.deepEqual(Object.keys(proof.authorizedIdentityMetadata).sort(), [
    'git-diff-paths',
    'git-status',
    'process-identities',
    'tmux-session-identities',
  ]);
  assert.equal(proof.everyCapturedPerRunDeltaUnchanged, true);
  assert.equal(proof.productionContentRead, false);
  assert.equal(proof.currentAmbientIdentitySnapshotCaptured, false);
  assert.equal(proof.volatileAmbientProcessIdentitiesGloballyIdenticalClaimed, false);
  assert.equal(proof.globalContinuityClaimed, false);
});

test('US-019 final synthesis policy preserves all candidate behavior as NOT RUN and requires a separate human decision', () => {
  const policy = scanTerminalPolicy(read('assessment.md'));
  assert.equal(policy.status, 'PASS');
  assert.equal(policy.candidateNotRunRowCount, 5);
  assert.equal(policy.allCandidateBehaviorNonComparable, true);
  assert.equal(policy.separateHumanDecisionBoundaryPresent, true);
  assert.equal(policy.selectionAuthority, false);
  assert.equal(policy.productionConfigurationSupplied, false);
  assert.equal(policy.defaultChangeSupplied, false);
});

test('US-019 policy scan fails closed on a prohibited output label or missing human decision boundary', () => {
  const assessment = read('assessment.md');
  const prohibitedLabel = `${'Win'}${'ner'}: baseline`;
  assert.equal(scanTerminalPolicy(assessment.replace('## Terminal First Mate synthesis', `## Terminal First Mate synthesis\n\n${prohibitedLabel}`)).status, 'FAIL');
  assert.equal(scanTerminalPolicy(assessment.replace('Any selection requires a separate human-approved issue or ADR.', 'Selection boundary omitted.')).status, 'FAIL');
});

test('delegated US-019 verification requires passed dependencies while preserving US-019 passes false', () => {
  const current = JSON.parse(read('prd.json'));
  const delegatedState = structuredClone(current);
  delegatedState.userStories.find(({ id }) => id === 'US-019').passes = false;
  assert.deepEqual(validateTerminalPassState(delegatedState), {
    dependencyStoriesPassed: 18,
    us019PassState: false,
    passStateMutationPerformed: false,
  });
  const invalidDelegatedState = structuredClone(delegatedState);
  invalidDelegatedState.userStories.find(({ id }) => id === 'US-019').passes = true;
  assert.throws(() => validateTerminalPassState(invalidDelegatedState), /US-019 must remain false/);
});

test('US-019 verifier has no live process, metadata snapshot, network, PM2, or production-content execution path', () => {
  const source = read('fixture/verify.mjs');
  assert.equal(source.includes("from 'node:child_process'"), false);
  assert.equal(source.includes('snapshotProductionMetadata'), false);
  assert.equal(source.includes('process.kill('), false);
  assert.equal(source.includes('spawn('), false);
  assert.equal(source.includes('execFile('), false);
  assert.equal(source.includes('pm2 '), false);
});
