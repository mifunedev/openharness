import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const PM2_PIN = Object.freeze({
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

export const PUBLIC_PI_COMMAND = '/home/sandbox/.local/bin/pi';

const REQUIRED_PROOFS = Object.freeze([
  Object.freeze({ id: 'pm2-daemon-pid', requirement: 'exact PM2 daemon PID and ownership registration' }),
  Object.freeze({ id: 'pi-pid', requirement: 'exact Pi child PID, parent PM2 identity, and ownership registration' }),
  Object.freeze({ id: 'stdin-owner-writer', requirement: 'retained writable Pi stdin owner and external fixture writer' }),
  Object.freeze({ id: 'stdout-consumer', requirement: 'lossless Pi stdout consumer independent of PM2 logs' }),
  Object.freeze({ id: 'ready-signal', requirement: 'first valid Pi RPC public stdout frame inside the ready deadline' }),
  Object.freeze({ id: 'lf-jsonl-command-path', requirement: 'bounded UTF-8 LF JSONL from fixture writer to Pi stdin' }),
  Object.freeze({ id: 'retained-open-stdin', requirement: 'stdin remains open while RPC service is expected to live' }),
  Object.freeze({ id: 'eof-shutdown', requirement: 'writer EOF reaches Pi and produces bounded shutdown' }),
  Object.freeze({ id: 'exit-code-propagation', requirement: 'Pi exit code propagates through PM2 status without substitution' }),
  Object.freeze({ id: 'byte-frame-losslessness', requirement: 'request and response byte/frame count, order, type, and SHA-256 equality' }),
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function sanitizeHostToolPath(path) {
  return typeof path === 'string'
    ? path.replace(/^\/home\/sandbox\/\.local(?=\/|$)/, '<HOST_TOOL_ROOT>')
    : path;
}

export function assertFrozenDirectManifest(manifest, hash, expectedHash) {
  assert(hash === expectedHash, 'frozen benchmark manifest hash changed');
  assert(manifest.schemaVersion === 1 && manifest.status === 'FROZEN_PRE_OBSERVATION', 'manifest is not frozen pre-observation');
  assert(manifest.candidateObservationCountAtFreeze === 0, 'manifest was frozen after observation');
  assert(manifest.measurement?.measuredRepetitions === 3, 'direct topology requires exactly three measured repetitions');
  assert(manifest.networkProof?.requiredBeforeEveryCandidateLaunch === true, 'network proof gate is required');
  assert(manifest.constraints?.network?.unprovenResult === 'NOT RUN', 'unproven network result must be NOT RUN');
  const direct = manifest.candidates?.find((candidate) => candidate.id === 'pm2-direct-rpc');
  assert(direct?.definition === 'PM2 7.0.3 script target is the Pi executable with --mode rpc', 'direct candidate definition changed');
  assert(direct?.infeasibleResult === 'NOT RUN without wrapper substitution', 'direct infeasibility policy changed');
  assert(Array.isArray(direct.requiredProof) && direct.requiredProof.join(',') === 'stdin owner/writer,stdout consumer,ready path,LF-JSONL command path,retained-open stdin,EOF shutdown,exit propagation,byte/frame equality', 'direct proof obligations changed');
  assert(manifest.protocol?.framing === 'UTF-8 LF-delimited JSONL', 'direct framing changed');
  assert(manifest.protocol?.maxLineBytes === 65536 && manifest.protocol?.maxFramesPerRepetition === 10000 && manifest.protocol?.maxTotalBytesPerRepetition === 8388608, 'direct protocol bounds changed');
  return true;
}

export function inspectPublicPiSource(commandPath = PUBLIC_PI_COMMAND) {
  if (!existsSync(commandPath)) {
    return {
      status: 'SOURCE-UNAVAILABLE',
      commandPath,
      candidateExecuted: false,
      reason: 'public installed Pi executable was not found at the cited path',
    };
  }
  const resolvedScript = realpathSync(commandPath);
  const packageRoot = dirname(dirname(resolvedScript));
  const packagePath = join(packageRoot, 'package.json');
  const rpcSourcePath = join(packageRoot, 'dist', 'modes', 'rpc', 'rpc-mode.js');
  const mainSourcePath = join(packageRoot, 'dist', 'main.js');
  assert(existsSync(packagePath) && existsSync(rpcSourcePath) && existsSync(mainSourcePath), 'installed Pi public source is incomplete');
  const packageBytes = readFileSync(packagePath);
  const packageMetadata = JSON.parse(packageBytes);
  assert(packageMetadata.name === '@earendil-works/pi-coding-agent', 'unexpected Pi package name');
  assert(packageMetadata.version === '0.82.1', 'unexpected installed Pi version');
  assert(packageMetadata.bin?.pi === 'dist/cli.js', 'unexpected Pi executable mapping');
  return {
    status: 'SOURCE-VERIFIED',
    package: packageMetadata.name,
    version: packageMetadata.version,
    commandPath: sanitizeHostToolPath(commandPath),
    resolvedScript: sanitizeHostToolPath(resolvedScript),
    binTarget: packageMetadata.bin.pi,
    candidateExecuted: false,
    packageJsonSha256: sha256(packageBytes),
    mainSourceSha256: sha256(readFileSync(mainSourcePath)),
    rpcSourceSha256: sha256(readFileSync(rpcSourcePath)),
    sourceReferences: [
      'installed package.json name/version/bin fields',
      'dist/main.js resolveAppMode: explicit mode rpc selects RPC',
      'dist/modes/rpc/rpc-mode.js: stdin LF-JSONL reader, raw stdout frames, stdin end shutdown',
      'docs/rpc.md: LF-only JSONL and extension_ui_request protocol',
    ],
  };
}

function notRunSequence(repetition, reason, manifestHash) {
  return {
    kind: 'direct-rpc-transport-sequence',
    story: 'US-006',
    candidate: 'pm2-direct-rpc-topology',
    repetition,
    status: 'NOT RUN',
    outcome: 'NOT RUN',
    reason,
    request: { byteCount: null, frameCount: null, sequence: null, types: null, sha256: null },
    response: { byteCount: null, frameCount: null, sequence: null, types: null, sha256: null },
    byteFrameEquality: null,
    extensionUiRequestParsed: null,
    candidateLaunched: false,
    pm2DaemonPid: null,
    piPid: null,
    wrapperPid: null,
    comparable: false,
    censored: false,
    manifestHash,
  };
}

export function characterizeDirectTopologyNotRun({ network, repetitions, manifestHash, piSource }) {
  assert(repetitions === 3, 'direct topology requires exactly three preregistered sequence slots');
  assert(network?.status === 'NOT RUN' && typeof network.reason === 'string', 'safe direct NOT RUN requires failed network-isolation proof');
  const reason = network.reason;
  const packageEvidence = {
    kind: 'version-integrity-source-evidence',
    story: 'US-006',
    candidate: 'pm2-direct-rpc-topology',
    pm2: {
      status: 'SOURCE-VERIFIED',
      resolvedPackageIdentity: {
        exact: true,
        package: PM2_PIN.package,
        version: PM2_PIN.version,
        nodeEngine: PM2_PIN.nodeEngine,
        integrity: PM2_PIN.integrity,
        tarballUrl: PM2_PIN.tarballUrl,
      },
      source: {
        metadataCommandCitedNotExecuted: PM2_PIN.citedMetadataCommand,
        taskEvidence: PM2_PIN.citedEvidence,
        upstreamTag: PM2_PIN.upstreamTag,
        upstreamTagCommit: PM2_PIN.upstreamTagCommit,
        upstreamSource: PM2_PIN.upstreamSource,
      },
      runtimeResolution: {
        status: 'NOT RUN',
        reason,
        exactFetchAttempted: false,
        otherFetchAttempted: false,
        npmAuthOrConfigRead: false,
        ambientCacheInspected: false,
        offlineDependencyResolution: 'NOT RUN',
        cacheOrDependencyMissPolicy: 'NOT RUN without alternate fetch, dependency, lockfile, or global install',
        executableLoaded: false,
      },
    },
    pi: piSource,
    networkFetches: [],
  };

  const obligations = REQUIRED_PROOFS.map((proof) => ({
    ...proof,
    status: proof.id === 'eof-shutdown' && piSource.status === 'SOURCE-VERIFIED' ? 'SOURCE-VERIFIED-PI-ONLY' : 'LIVE-UNVERIFIED',
    observedValue: null,
    note: proof.id === 'eof-shutdown' && piSource.status === 'SOURCE-VERIFIED'
      ? 'Pi source installs a stdin end shutdown handler; PM2-to-Pi EOF propagation was not observed.'
      : 'No end-to-end value is claimed because the launch prerequisite failed.',
  }));

  const topology = {
    kind: 'direct-rpc-topology',
    story: 'US-006',
    candidate: 'pm2-direct-rpc-topology',
    result: 'NOT RUN',
    reason,
    directCandidateOnly: true,
    wrapperSubstituted: false,
    wrapperProcessLaunched: false,
    pm2LogsUsedAsTransport: false,
    scriptTarget: piSource.commandPath,
    resolvedScriptTarget: piSource.resolvedScript ?? null,
    scriptArguments: ['--mode', 'rpc'],
    exactTargetStatement: 'PM2 script target is the installed Pi executable; Pi is the intended PM2 child.',
    intendedParentage: 'PM2 daemon -> Pi --mode rpc',
    processMap: {
      pm2Daemon: { pid: null, parentPid: null, procStartTime: null, status: 'NOT RUN' },
      pi: { pid: null, parentPid: null, procStartTime: null, status: 'NOT RUN' },
      wrapper: null,
    },
    proofObligations: obligations,
    networkIsolation: network.status,
    candidateLaunchCount: 0,
  };

  const rows = Array.from({ length: repetitions }, (_, index) => notRunSequence(index + 1, reason, manifestHash));
  const transport = {
    kind: 'direct-rpc-transport',
    story: 'US-006',
    candidate: 'pm2-direct-rpc-topology',
    result: 'NOT RUN',
    feasibility: 'LIVE-UNVERIFIED',
    infeasibleClaimed: false,
    blocker: reason,
    framingRequired: 'UTF-8 LF-delimited JSONL',
    bounds: { maxLineBytes: 65536, maxFramesPerRepetition: 10000, maxTotalBytesPerRepetition: 8388608 },
    pm2LogsUsedAsTransport: false,
    writableRetainedStdinProven: false,
    losslessStdoutConsumerProven: false,
    readySignalProven: false,
    eofPropagationProven: false,
    exitCodePropagationProven: false,
    wrapperFallbackUsed: false,
    requestedSequences: 3,
    measuredSequences: 0,
    notRunSequences: 3,
    requiredRunCompleteness: '0/3',
    sequenceEvidence: rows,
    imputation: false,
    selectiveRetries: false,
    comparable: false,
  };
  const aggregate = {
    kind: 'direct-rpc-topology-aggregate',
    story: 'US-006',
    candidate: 'pm2-direct-rpc-topology',
    status: 'NOT RUN',
    reason,
    requestedRepetitions: 3,
    measuredRepetitions: 0,
    notRunRepetitions: 3,
    requiredRunCompleteness: '0/3',
    transportFeasibility: 'LIVE-UNVERIFIED',
    metrics: 'not-comparable',
    imputation: false,
    selectiveRetries: false,
    manifestHash,
  };
  return { packageEvidence, topology, transport, rows, aggregate, candidateLaunchCount: 0 };
}
