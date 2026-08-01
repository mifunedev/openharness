import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  assertFrozenControlManifest,
  characterizeExtensionProbeNotRun,
  characterizeNoModeNotRun,
  characterizePtyControlNotRun,
  characterizeWrapperNotRun,
  detectPtyUtilityMetadata,
} from '../control-characterizations.mjs';

const EXPECTED_MANIFEST_HASH = 'ed79d0e7f623938e92e17cc2b3203b07074f5d796f0de3abeb5013700fc2e31b';
const manifestUrl = new URL('../../evidence/benchmark-manifest.json', import.meta.url);
const unavailableNetwork = {
  status: 'NOT RUN',
  reason: 'fresh user/network namespace unavailable; candidate launch is prohibited',
};

function manifestAndHash() {
  const bytes = readFileSync(manifestUrl);
  return { manifest: JSON.parse(bytes), hash: createHash('sha256').update(bytes).digest('hex') };
}

test('US-007 through US-010 accept only their unchanged frozen manifest contracts', () => {
  const { manifest, hash } = manifestAndHash();
  assert.equal(hash, EXPECTED_MANIFEST_HASH);
  for (const story of ['US-007', 'US-008', 'US-009', 'US-010']) {
    assert.equal(assertFrozenControlManifest(manifest, hash, EXPECTED_MANIFEST_HASH, story), true);
    assert.throws(() => assertFrozenControlManifest(manifest, '0'.repeat(64), EXPECTED_MANIFEST_HASH, story), /hash changed/);
  }
});

test('US-007 refuses wrapper substitution when direct transport remains LIVE-UNVERIFIED', () => {
  const result = characterizeWrapperNotRun({
    network: unavailableNetwork,
    directAggregate: { status: 'NOT RUN' },
    directTransport: { feasibility: 'LIVE-UNVERIFIED', infeasibleClaimed: false },
    manifestHash: EXPECTED_MANIFEST_HASH,
  });
  assert.equal(result.candidateLaunchCount, 0);
  assert.equal(result.aggregate.status, 'NOT RUN');
  assert.equal(result.aggregate.conditionalLaunchAuthorized, false);
  assert.match(result.reason, /not solely by proven direct-transport infeasibility/);
  assert.equal(result.artifacts['topology.json'].directCandidateSubstitution, false);
  assert.equal(result.artifacts['topology.json'].semanticWatchdogFunction, false);
  assert.equal(result.artifacts['topology.json'].exactPm2ScriptTarget, 'fixture-owned RPC-host wrapper, never Pi');
  assert.equal(result.artifacts['topology.json'].requiredSocket.mode, '0600');
  assert.deepEqual(result.artifacts['topology.json'].responsibilities.map(({ component }) => component), ['PM2', 'RPC-host wrapper', 'Pi', 'fixture client']);
  assert.ok(result.rows.every((row) => row.pm2DaemonPid === null && row.wrapperPid === null && row.piPid === null));
  assert.ok(result.rows.every((row) => row.request.sha256 === null && row.response.sha256 === null));
});

test('US-007 rejects a false claim that direct transport was proven infeasible', () => {
  assert.throws(() => characterizeWrapperNotRun({
    network: unavailableNetwork,
    directAggregate: { status: 'NOT RUN' },
    directTransport: { feasibility: 'LIVE-UNVERIFIED', infeasibleClaimed: true },
    manifestHash: EXPECTED_MANIFEST_HASH,
  }), /must not be inferred/);
});

test('US-008 records fake-provider API obligations with zero model turns and production loads', () => {
  const result = characterizeExtensionProbeNotRun({
    network: unavailableNetwork,
    directAggregate: { status: 'NOT RUN' },
    wrapperAggregate: { status: 'NOT RUN' },
    manifestHash: EXPECTED_MANIFEST_HASH,
  });
  const obligations = result.artifacts['probe-obligations.json'];
  assert.equal(result.aggregate.status, 'NOT RUN');
  assert.equal(obligations.prerequisiteTopologyResults.runnableRpcTopologyCount, 0);
  assert.ok(obligations.requiredApiSequence.some((step) => step.includes('sendUserMessage()')));
  assert.ok(obligations.requiredApiSequence.some((step) => step.includes('turn_end')));
  assert.ok(obligations.requiredApiSequence.some((step) => step.includes('extension_ui_request')));
  assert.deepEqual({
    live: obligations.observed.liveModelTurns,
    provider: obligations.observed.providerBackedModelTurns,
    fake: obligations.observed.fakeProviderTurns,
    extensions: obligations.observed.productionExtensionLoads,
    settings: obligations.observed.productionSettingsLoads,
  }, { live: 0, provider: 0, fake: 0, extensions: 0, settings: 0 });
  assert.ok(result.rows.every((row) => row.sendUserMessageAttempted === false && row.turnEndObserved === null));
});

test('US-009 preserves no-mode observations as null instead of assuming print mode', () => {
  const result = characterizeNoModeNotRun({ network: unavailableNetwork, manifestHash: EXPECTED_MANIFEST_HASH });
  const mode = result.artifacts['mode.json'];
  assert.equal(result.aggregate.status, 'NOT RUN');
  assert.deepEqual(mode.scriptArguments, []);
  assert.equal(mode.explicitModeArgumentPresent, false);
  assert.equal(mode.expectedMode, null);
  assert.equal(mode.observed.resolvedMode, null);
  assert.match(mode.modeAssumption, /^none;/);
  assert.equal(result.aggregate.resolvedModeClaimed, false);
  assert.ok(result.rows.every((row) => row.resolvedMode === null && row.stdinTty === null && row.stdoutTty === null));
});

test('US-010 detects installed PTY utility metadata without execution, install, or fetch', () => {
  const metadata = detectPtyUtilityMetadata();
  assert.equal(metadata.status, 'SOURCE-VERIFIED-METADATA');
  assert.equal(metadata.utility, 'script');
  assert.equal(metadata.packageMetadata.package, 'util-linux');
  assert.equal(metadata.packageMetadata.installStatus, 'install ok installed');
  assert.equal(typeof metadata.utilityVersion, 'string');
  assert.match(metadata.binarySha256, /^[a-f0-9]{64}$/);
  assert.equal(metadata.compatibilityMetadataDetected, true);
  assert.equal(metadata.executableInvoked, false);
  assert.equal(metadata.packageManagerInvoked, false);
  assert.equal(metadata.installAttempted, false);
  assert.equal(metadata.fetchAttempted, false);
});

test('US-010 records the PTY boundary but does not launch while isolation is unavailable', () => {
  const utilityMetadata = detectPtyUtilityMetadata();
  const result = characterizePtyControlNotRun({
    network: unavailableNetwork,
    manifestHash: EXPECTED_MANIFEST_HASH,
    utilityMetadata,
  });
  const boundary = result.artifacts['mode-lifecycle.json'];
  const prerequisite = result.artifacts['prerequisite.json'];
  assert.equal(result.candidateLaunchCount, 0);
  assert.equal(result.aggregate.status, 'NOT RUN');
  assert.equal(result.aggregate.compatibilityMetadataDetected, true);
  assert.match(result.reason, /network namespace isolation is unavailable/);
  assert.equal(prerequisite.globalInstallAttempted, false);
  assert.equal(prerequisite.candidateLaunchAuthorized, false);
  assert.deepEqual(boundary.responsibilities.map(({ component }) => component), ['PM2 7.0.3', 'PTY utility', 'disposable baseline/Pi control', 'fixture']);
  assert.equal(boundary.semanticWatchdogFunction, false);
  assert.equal(boundary.resolvedModeClaimed, false);
  assert.ok(result.rows.every((row) => row.utilityPid === null && row.pm2DaemonPid === null && row.controlPid === null));
});

test('control characterization module cannot launch processes, open sockets, install, or fetch', () => {
  const source = readFileSync(new URL('../control-characterizations.mjs', import.meta.url), 'utf8');
  assert.equal(source.includes("from 'node:child_process'"), false);
  assert.equal(source.includes("from 'node:net'"), false);
  assert.equal(source.includes('spawn('), false);
  assert.equal(source.includes('execFile'), false);
  assert.equal(source.includes('npm install'), false);
  assert.equal(source.includes('fetch('), false);
});
