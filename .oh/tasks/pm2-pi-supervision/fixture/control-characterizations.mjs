import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';

const WRAPPER_RESPONSIBILITIES = Object.freeze([
  Object.freeze({ component: 'PM2', requiredBoundary: 'supervise the fixture RPC-host wrapper as the exact script target; never claim direct Pi supervision' }),
  Object.freeze({ component: 'RPC-host wrapper', requiredBoundary: 'own the Pi stdin/stdout byte pipes, bounded LF-JSONL relay, ready/EOF/exit propagation, and a runtime-root Unix socket with mode 0600' }),
  Object.freeze({ component: 'Pi', requiredBoundary: 'run as the wrapper child with explicit --mode rpc and expose only the public RPC byte protocol' }),
  Object.freeze({ component: 'fixture client', requiredBoundary: 'own the Unix-socket peer and verify request/response sequence, type, count, byte count, and SHA-256 equality' }),
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function notRunRows({ story, candidate, reason, manifestHash, rowKind, rowFields = {} }) {
  return Array.from({ length: 3 }, (_, index) => ({
    kind: rowKind,
    story,
    candidate,
    repetition: index + 1,
    status: 'NOT RUN',
    outcome: 'NOT RUN',
    reason,
    candidateLaunched: false,
    observationPerformed: false,
    comparable: false,
    censored: false,
    manifestHash,
    ...rowFields,
  }));
}

function notRunAggregate({ story, candidate, reason, manifestHash, kind, fields = {} }) {
  return {
    kind,
    story,
    candidate,
    status: 'NOT RUN',
    reason,
    requestedRepetitions: 3,
    measuredRepetitions: 0,
    notRunRepetitions: 3,
    requiredRunCompleteness: '0/3',
    metrics: 'not-comparable',
    imputation: false,
    selectiveRetries: false,
    comparable: false,
    manifestHash,
    ...fields,
  };
}

export function assertFrozenControlManifest(manifest, hash, expectedHash, story) {
  assert(hash === expectedHash, 'frozen benchmark manifest hash changed');
  assert(manifest.schemaVersion === 1 && manifest.status === 'FROZEN_PRE_OBSERVATION', 'manifest is not frozen pre-observation');
  assert(manifest.candidateObservationCountAtFreeze === 0, 'manifest was frozen after observation');
  assert(manifest.measurement?.measuredRepetitions === 3, 'control protocol requires exactly three repetitions');
  assert(manifest.networkProof?.requiredBeforeEveryCandidateLaunch === true, 'network proof gate is required');
  assert(manifest.constraints?.network?.unprovenResult === 'NOT RUN', 'unproven network result must be NOT RUN');
  if (story === 'US-007') {
    const candidate = manifest.candidates?.find(({ id }) => id === 'pm2-rpc-host-wrapper');
    assert(candidate?.scriptTarget === 'fixture-owned wrapper, never Pi', 'wrapper target boundary changed');
    assert(candidate?.eligibility === 'only when direct RPC transport is infeasible; otherwise NOT RUN (not required by protocol)', 'wrapper eligibility changed');
    assert(candidate?.transport === 'wrapper-owned Pi byte pipes and mode-0600 runtime-root Unix socket', 'wrapper transport changed');
  } else if (story === 'US-008') {
    assert(manifest.fakeProvider?.kind === 'deterministic local fixture provider', 'fake provider contract changed');
    assert(manifest.fakeProvider?.liveOrProviderBackedModelTurn === 'prohibited', 'model-turn prohibition changed');
    assert(manifest.protocol?.extensionUiRequest === 'explicitly parse type=extension_ui_request', 'extension UI protocol changed');
  } else if (story === 'US-009') {
    const candidate = manifest.candidates?.find(({ id }) => id === 'pm2-direct-no-mode');
    assert(candidate?.definition === 'PM2 7.0.3 directly launches Pi without --mode rpc', 'no-mode definition changed');
    assert(candidate?.requiredObservation?.includes('resolved mode'), 'resolved-mode observation obligation changed');
  } else if (story === 'US-010') {
    const candidate = manifest.candidates?.find(({ id }) => id === 'pm2-pty-control');
    assert(candidate?.missingPrerequisiteResult === 'NOT RUN; install nothing', 'PTY prerequisite policy changed');
  } else {
    throw new Error(`unsupported control story: ${story}`);
  }
  return true;
}

export function characterizeWrapperNotRun({ network, directAggregate, directTransport, manifestHash }) {
  assert(network?.status === 'NOT RUN' && typeof network.reason === 'string', 'wrapper safe NOT RUN requires unavailable network isolation');
  assert(directAggregate?.status === 'NOT RUN', 'US-006 must be NOT RUN before wrapper characterization');
  assert(directTransport?.feasibility === 'LIVE-UNVERIFIED', 'direct feasibility must remain LIVE-UNVERIFIED');
  assert(directTransport?.infeasibleClaimed === false, 'direct infeasibility must not be inferred');
  const reason = 'conditional wrapper launch is not authorized: US-006 was blocked by unavailable network isolation, not solely by proven direct-transport infeasibility; unavailable network isolation independently prohibits launch';
  const rows = notRunRows({
    story: 'US-007',
    candidate: 'pm2-rpc-host-wrapper',
    reason,
    manifestHash,
    rowKind: 'wrapper-transport-sequence',
    rowFields: {
      pm2DaemonPid: null,
      wrapperPid: null,
      piPid: null,
      socketPath: null,
      socketMode: null,
      request: { byteCount: null, frameCount: null, sequence: null, types: null, sha256: null },
      response: { byteCount: null, frameCount: null, sequence: null, types: null, sha256: null },
      byteFrameEquality: null,
      readyObserved: null,
      eofPropagationObserved: null,
      exitPropagationObserved: null,
    },
  });
  const topology = {
    kind: 'wrapper-topology',
    story: 'US-007',
    candidate: 'pm2-rpc-host-wrapper',
    separatelyNamedCandidate: 'PM2 7.0.3 + RPC-host wrapper + Pi RPC',
    result: 'NOT RUN',
    reason,
    eligibility: {
      directTransportStatus: directTransport.feasibility,
      directTransportInfeasibleProven: false,
      us006BlockedSolelyByDirectTransportInfeasibility: false,
      conditionalLaunchAuthorized: false,
      networkIsolation: network.status,
    },
    intendedParentage: 'PM2 daemon -> fixture RPC-host wrapper -> Pi --mode rpc',
    exactPm2ScriptTarget: 'fixture-owned RPC-host wrapper, never Pi',
    wrapperOwnsPiBytePipes: true,
    requiredSocket: { location: 'beneath fresh runtime root', type: 'Unix stream socket', mode: '0600' },
    processMap: {
      pm2Daemon: { pid: null, parentPid: null, procStartTime: null, status: 'NOT RUN' },
      wrapper: { pid: null, parentPid: null, procStartTime: null, status: 'NOT RUN' },
      pi: { pid: null, parentPid: null, procStartTime: null, status: 'NOT RUN' },
    },
    responsibilities: WRAPPER_RESPONSIBILITIES,
    semanticWatchdogFunction: false,
    providerFunction: false,
    networkFunction: false,
    productionConfiguration: false,
    directCandidateSubstitution: false,
    candidateLaunchCount: 0,
  };
  const transport = {
    kind: 'wrapper-transport',
    story: 'US-007',
    candidate: 'pm2-rpc-host-wrapper',
    result: 'NOT RUN',
    feasibility: 'LIVE-UNVERIFIED',
    blocker: reason,
    framingRequired: 'UTF-8 LF-delimited JSONL',
    bounds: { maxLineBytes: 65536, maxFramesPerRepetition: 10000, maxTotalBytesPerRepetition: 8388608 },
    socketModeRequired: '0600',
    pipeOwnershipProven: false,
    socketBoundaryProven: false,
    losslessRelayProven: false,
    readyPropagationProven: false,
    eofPropagationProven: false,
    exitPropagationProven: false,
    requestedSequences: 3,
    measuredSequences: 0,
    notRunSequences: 3,
    sequenceEvidence: rows,
    imputation: false,
    selectiveRetries: false,
    comparable: false,
  };
  return {
    rows,
    aggregate: notRunAggregate({
      story: 'US-007',
      candidate: 'pm2-rpc-host-wrapper',
      reason,
      manifestHash,
      kind: 'wrapper-topology-aggregate',
      fields: { conditionalLaunchAuthorized: false, transportFeasibility: 'LIVE-UNVERIFIED' },
    }),
    artifacts: { 'topology.json': topology, 'transport.json': transport },
    candidateLaunchCount: 0,
    reason,
  };
}

export function characterizeExtensionProbeNotRun({ network, directAggregate, wrapperAggregate, manifestHash }) {
  assert(network?.status === 'NOT RUN' && typeof network.reason === 'string', 'extension safe NOT RUN requires unavailable network isolation');
  assert(directAggregate?.status === 'NOT RUN' && wrapperAggregate?.status === 'NOT RUN', 'both RPC topology dependencies must be NOT RUN');
  const reason = 'no RPC topology is runnable and denied-network proof is unavailable; fake-provider and extension API probe remains safely NOT RUN before extension/provider/Pi load or model turn';
  const rows = notRunRows({
    story: 'US-008',
    candidate: 'rpc-extension-probe',
    reason,
    manifestHash,
    rowKind: 'extension-api-probe-slot',
    rowFields: {
      rpcTopology: null,
      disposableProbeExtensionLoaded: false,
      fakeProviderLoaded: false,
      sendUserMessageAttempted: false,
      turnEndObserved: null,
      extensionUiRequestParsed: null,
      requestFrameCount: null,
      responseFrameCount: null,
      requestSha256: null,
      responseSha256: null,
      liveModelTurns: 0,
      providerBackedModelTurns: 0,
      fakeProviderTurns: 0,
      productionExtensionLoads: 0,
      productionSettingsLoads: 0,
    },
  });
  const obligations = {
    kind: 'extension-api-probe-obligations',
    story: 'US-008',
    candidate: 'rpc-extension-probe',
    result: 'NOT RUN',
    reason,
    prerequisiteTopologyResults: {
      directRpc: directAggregate.status,
      rpcHostWrapper: wrapperAggregate.status,
      runnableRpcTopologyCount: 0,
    },
    requiredFixtureBoundary: {
      extension: 'disposable task-local probe extension only',
      prompt: 'synthetic prompt only',
      provider: 'deterministic local fake/test provider only',
      network: 'denied and proven before launch',
      authHomes: 'fresh, allowlisted, and empty',
    },
    requiredApiSequence: [
      'load only the disposable probe extension',
      'inject one synthetic sendUserMessage() call',
      'observe its corresponding turn_end event',
      'parse bounded frame types including extension_ui_request',
      'prove request/response count, order, type, byte count, and SHA-256 evidence per runnable RPC topology',
    ],
    failClosedCondition: 'if deterministic fake-provider execution cannot be proven without credential discovery or a live/provider-backed model turn, remain NOT RUN',
    observed: {
      sendUserMessageAttempted: false,
      turnEndObserved: null,
      extensionUiRequestParsed: null,
      losslessJsonlProven: false,
      liveModelTurns: 0,
      providerBackedModelTurns: 0,
      fakeProviderTurns: 0,
      externalCredentialDiscoveryAttempts: 0,
      productionExtensionLoads: 0,
      productionSettingsLoads: 0,
      piLaunches: 0,
    },
    topologyAttribution: 'none runnable; no result attributed to direct RPC or wrapper RPC',
  };
  return {
    rows,
    aggregate: notRunAggregate({
      story: 'US-008',
      candidate: 'rpc-extension-probe',
      reason,
      manifestHash,
      kind: 'extension-api-probe-aggregate',
      fields: { runnableRpcTopologyCount: 0, liveModelTurns: 0, providerBackedModelTurns: 0 },
    }),
    artifacts: { 'probe-obligations.json': obligations },
    candidateLaunchCount: 0,
    reason,
  };
}

export function characterizeNoModeNotRun({ network, manifestHash }) {
  assert(network?.status === 'NOT RUN' && typeof network.reason === 'string', 'no-mode safe NOT RUN requires unavailable network isolation');
  const reason = 'fresh user/network namespace isolation is unavailable; the direct no-mode control is safely NOT RUN before PM2 or Pi launch';
  const rows = notRunRows({
    story: 'US-009',
    candidate: 'pm2-direct-no-mode',
    reason,
    manifestHash,
    rowKind: 'no-mode-control-repetition',
    rowFields: {
      pm2DaemonPid: null,
      piPid: null,
      stdinTty: null,
      stdoutTty: null,
      resolvedMode: null,
      readyObserved: null,
      idleSurvivalNs: null,
      exitCode: null,
      restartCount: null,
    },
  });
  const mode = {
    kind: 'no-mode-control-obligations',
    story: 'US-009',
    candidate: 'pm2-direct-no-mode',
    result: 'NOT RUN',
    reason,
    exactPm2VersionRequired: '7.0.3',
    exactScriptTarget: 'installed Pi executable directly',
    scriptArguments: [],
    explicitModeArgumentPresent: false,
    wrappers: { rpcHost: false, pty: false },
    requiredObservations: ['stdin TTY state', 'stdout TTY state', 'resolved Pi mode', 'ready behavior', '30-second idle behavior', 'exit propagation', 'restart behavior'],
    observed: {
      stdinTty: null,
      stdoutTty: null,
      resolvedMode: null,
      ready: null,
      idle: null,
      exit: null,
      restart: null,
    },
    expectedMode: null,
    modeAssumption: 'none; print-mode behavior is an observation target, not an assumed result',
    liveModelTurns: 0,
    productionAssetsLoaded: 0,
    candidateLaunchCount: 0,
  };
  const lifecycle = {
    kind: 'no-mode-lifecycle',
    story: 'US-009',
    candidate: 'pm2-direct-no-mode',
    result: 'NOT RUN',
    requestedRepetitions: 3,
    measuredRepetitions: 0,
    repetitionEvidence: rows,
    resolvedModeClaimed: false,
    metrics: 'not-comparable',
  };
  return {
    rows,
    aggregate: notRunAggregate({
      story: 'US-009',
      candidate: 'pm2-direct-no-mode',
      reason,
      manifestHash,
      kind: 'no-mode-control-aggregate',
      fields: { resolvedMode: null, resolvedModeClaimed: false },
    }),
    artifacts: { 'mode.json': mode, 'lifecycle.json': lifecycle },
    candidateLaunchCount: 0,
    reason,
  };
}

function packageVersionFromDpkgStatus(packageName, statusPath) {
  if (!existsSync(statusPath)) return null;
  const stanzas = readFileSync(statusPath, 'utf8').split(/\n\n+/);
  const stanza = stanzas.find((value) => value.startsWith(`Package: ${packageName}\n`));
  if (!stanza) return null;
  const fields = Object.fromEntries(stanza.split('\n').filter((line) => line.includes(': ')).map((line) => {
    const separator = line.indexOf(': ');
    return [line.slice(0, separator), line.slice(separator + 2)];
  }));
  return {
    package: fields.Package,
    version: fields.Version ?? null,
    architecture: fields.Architecture ?? null,
    installStatus: fields.Status ?? null,
  };
}

export function detectPtyUtilityMetadata({ utilityPath = '/usr/bin/script', statusPath = '/var/lib/dpkg/status' } = {}) {
  if (!existsSync(utilityPath)) {
    return {
      status: 'NOT PRESENT',
      utility: 'script',
      utilityPath,
      executableInvoked: false,
      packageManagerInvoked: false,
      installAttempted: false,
      fetchAttempted: false,
    };
  }
  const resolvedPath = realpathSync(utilityPath);
  const bytes = readFileSync(resolvedPath);
  const stat = statSync(resolvedPath);
  const packageMetadata = packageVersionFromDpkgStatus('util-linux', statusPath);
  return {
    status: 'SOURCE-VERIFIED-METADATA',
    utility: 'script',
    role: 'compatible PTY allocation/control utility candidate',
    utilityPath,
    resolvedPath,
    executableMode: `0${(stat.mode & 0o777).toString(8)}`,
    binarySha256: createHash('sha256').update(bytes).digest('hex'),
    packageMetadata,
    utilityVersion: packageMetadata?.version ?? null,
    compatibilityMetadataDetected: packageMetadata?.installStatus === 'install ok installed' && Boolean(packageMetadata.version),
    compatibilityStillLiveUnverified: true,
    detectionMethod: 'read-only executable identity/hash plus installed util-linux package metadata; utility was not executed',
    executableInvoked: false,
    packageManagerInvoked: false,
    installAttempted: false,
    fetchAttempted: false,
  };
}

export function characterizePtyControlNotRun({ network, manifestHash, utilityMetadata }) {
  assert(network?.status === 'NOT RUN' && typeof network.reason === 'string', 'PTY safe NOT RUN requires unavailable network isolation');
  assert(utilityMetadata && utilityMetadata.executableInvoked === false, 'PTY metadata detection must not execute the utility');
  const present = utilityMetadata.status === 'SOURCE-VERIFIED-METADATA';
  const reason = present
    ? 'compatible PTY utility metadata is present, but fresh user/network namespace isolation is unavailable; the PTY control is safely NOT RUN before utility, PM2, baseline, or Pi launch'
    : 'compatible PTY utility prerequisite is not present; install nothing and record safe NOT RUN';
  const rows = notRunRows({
    story: 'US-010',
    candidate: 'pm2-pty-control',
    reason,
    manifestHash,
    rowKind: 'pty-control-repetition',
    rowFields: {
      utilityPid: null,
      pm2DaemonPid: null,
      controlPid: null,
      stdinTty: null,
      stdoutTty: null,
      resolvedMode: null,
      readyObserved: null,
      idleSurvivalNs: null,
      exitCode: null,
      restartCount: null,
    },
  });
  const prerequisite = {
    kind: 'pty-control-prerequisite',
    story: 'US-010',
    candidate: 'pm2-pty-control',
    result: 'NOT RUN',
    reason,
    utilityMetadata,
    manifestEdited: false,
    lockfileEdited: false,
    dependencyAdded: false,
    globalInstallAttempted: false,
    fetchAttempted: false,
    networkIsolation: network.status,
    candidateLaunchAuthorized: false,
  };
  const boundary = {
    kind: 'pty-control-responsibility-boundary',
    story: 'US-010',
    candidate: 'pm2-pty-control',
    result: 'NOT RUN',
    responsibilities: [
      { component: 'PM2 7.0.3', boundary: 'supervise the already-present PTY utility as its exact child; PM2 does not itself supply PTY semantics' },
      { component: 'PTY utility', boundary: 'allocate and own the PTY and execute the disposable baseline/Pi control; no semantic-health function' },
      { component: 'disposable baseline/Pi control', boundary: 'resolve and expose its actual TTY/mode/lifecycle behavior' },
      { component: 'fixture', boundary: 'observe TTY, mode, ready, idle, exit, restart, metadata, and cleanup without production assets' },
    ],
    observed: { stdinTty: null, stdoutTty: null, resolvedMode: null, lifecycle: null },
    resolvedModeClaimed: false,
    semanticWatchdogFunction: false,
    liveModelTurns: 0,
    productionAssetsLoaded: 0,
    repetitionEvidence: rows,
  };
  return {
    rows,
    aggregate: notRunAggregate({
      story: 'US-010',
      candidate: 'pm2-pty-control',
      reason,
      manifestHash,
      kind: 'pty-control-aggregate',
      fields: {
        utilityMetadataStatus: utilityMetadata.status,
        utilityVersion: utilityMetadata.utilityVersion ?? null,
        compatibilityMetadataDetected: utilityMetadata.compatibilityMetadataDetected ?? false,
        resolvedMode: null,
      },
    }),
    artifacts: { 'prerequisite.json': prerequisite, 'mode-lifecycle.json': boundary },
    candidateLaunchCount: 0,
    reason,
  };
}
