#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  assertDisposableHomesEmpty,
  buildChildEnvironment,
  createRuntimeRoot,
  proveDeniedNetwork,
  snapshotProductionMetadata,
} from './contract.mjs';
import { appendVerification, boundedText, writeBoundedFile } from './evidence.mjs';
import { encodeFrame, BoundedJsonlDecoder } from './jsonl.mjs';
import { OwnedProcessRegistry } from './process-registry.mjs';
import {
  assertFrozenDirectManifest,
  characterizeDirectTopologyNotRun,
  inspectPublicPiSource,
} from './direct-rpc-topology.mjs';
import {
  assertFrozenControlManifest,
  characterizeExtensionProbeNotRun,
  characterizeNoModeNotRun,
  characterizePtyControlNotRun,
  characterizeWrapperNotRun,
  detectPtyUtilityMetadata,
} from './control-characterizations.mjs';

const TASK_ROOT = resolve('.oh/tasks/pm2-pi-supervision');
const FIXTURE_ROOT = join(TASK_ROOT, 'fixture');
const EXPECTED_MANIFEST_HASH = 'ed79d0e7f623938e92e17cc2b3203b07074f5d796f0de3abeb5013700fc2e31b';
const EXACT_COMMANDS = Object.freeze({
  'US-005': 'timeout 420s node .oh/tasks/pm2-pi-supervision/fixture/run.mjs --story US-005 --candidate baseline --manifest .oh/tasks/pm2-pi-supervision/evidence/benchmark-manifest.json --output .oh/tasks/pm2-pi-supervision/evidence/US-005',
  'US-006': 'timeout 420s node .oh/tasks/pm2-pi-supervision/fixture/run.mjs --story US-006 --candidate pm2-direct-rpc-topology --manifest .oh/tasks/pm2-pi-supervision/evidence/benchmark-manifest.json --output .oh/tasks/pm2-pi-supervision/evidence/US-006',
  'US-007': 'timeout 420s node .oh/tasks/pm2-pi-supervision/fixture/run.mjs --story US-007 --candidate pm2-rpc-host-wrapper --manifest .oh/tasks/pm2-pi-supervision/evidence/benchmark-manifest.json --output .oh/tasks/pm2-pi-supervision/evidence/US-007',
  'US-008': 'timeout 420s node .oh/tasks/pm2-pi-supervision/fixture/run.mjs --story US-008 --candidate rpc-extension-probe --manifest .oh/tasks/pm2-pi-supervision/evidence/benchmark-manifest.json --output .oh/tasks/pm2-pi-supervision/evidence/US-008',
  'US-009': 'timeout 420s node .oh/tasks/pm2-pi-supervision/fixture/run.mjs --story US-009 --candidate pm2-direct-no-mode --manifest .oh/tasks/pm2-pi-supervision/evidence/benchmark-manifest.json --output .oh/tasks/pm2-pi-supervision/evidence/US-009',
  'US-010': 'timeout 420s node .oh/tasks/pm2-pi-supervision/fixture/run.mjs --story US-010 --candidate pm2-pty-control --manifest .oh/tasks/pm2-pi-supervision/evidence/benchmark-manifest.json --output .oh/tasks/pm2-pi-supervision/evidence/US-010',
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

export function assertFrozenBaselineManifest(manifest, hash) {
  assert(hash === EXPECTED_MANIFEST_HASH, 'frozen benchmark manifest hash changed');
  assert(manifest.schemaVersion === 1 && manifest.status === 'FROZEN_PRE_OBSERVATION', 'manifest is not frozen pre-observation');
  assert(manifest.candidateObservationCountAtFreeze === 0, 'manifest was frozen after observation');
  assert(manifest.measurement?.measuredRepetitions === 3, 'baseline requires exactly three measured repetitions');
  assert(manifest.measurement?.independentFreshRuntimeEachRepetition === true, 'fresh runtime per repetition is required');
  assert(manifest.deadlinesSeconds?.ready === 15 && manifest.deadlinesSeconds?.idle === 30, 'baseline deadlines changed');
  assert(manifest.deadlinesSeconds?.cleanup === 10 && manifest.deadlinesSeconds?.totalRepetition === 120, 'cleanup/total deadlines changed');
  assert(manifest.networkProof?.requiredBeforeEveryCandidateLaunch === true, 'network proof gate is required');
  assert(manifest.constraints?.network?.unprovenResult === 'NOT RUN', 'unproven network result must be NOT RUN');
  const baseline = manifest.candidates?.find((candidate) => candidate.id === 'baseline');
  assert(baseline?.scriptTarget === 'fixture/baseline.mjs', 'baseline target changed');
  assert(baseline?.transport === 'bounded UTF-8 LF JSONL stdin/stdout', 'baseline transport changed');
  return true;
}

function notRunRow({ repetition, reason, manifestHash, network }) {
  return {
    kind: 'baseline-repetition',
    story: 'US-005',
    candidate: 'baseline',
    repetition,
    status: 'NOT RUN',
    outcome: 'NOT RUN',
    reason,
    networkIsolation: network.status,
    candidateLaunched: false,
    observationPerformed: false,
    runtimeRootCreated: false,
    ownedProcessCount: 0,
    launchToReadyNs: null,
    idleSurvivalNs: null,
    idleWindowSeconds: 30,
    cleanExit: null,
    nonZeroRecovery: null,
    restartCount: null,
    boundedLogAccess: null,
    cleanupStatus: 'clean-no-runtime-created',
    censored: false,
    comparable: false,
    manifestHash,
  };
}

export async function executeCandidateGate({ network, repetitions, manifestHash, launchCandidate }) {
  assert(repetitions === 3, 'candidate gate requires exactly three repetitions');
  if (network.status !== 'PROVEN') {
    assert(network.status === 'NOT RUN' && typeof network.reason === 'string', 'invalid denied-network proof result');
    return {
      candidateLaunchCount: 0,
      rows: Array.from({ length: repetitions }, (_, index) => notRunRow({
        repetition: index + 1,
        reason: network.reason,
        manifestHash,
        network,
      })),
    };
  }
  const rows = [];
  for (let repetition = 1; repetition <= repetitions; repetition += 1) rows.push(await launchCandidate(repetition));
  return { candidateLaunchCount: repetitions, rows };
}

function linesForMetadata(name, output) {
  let lines = String(output).split('\n').map((line) => line.trim()).filter(Boolean);
  // Each ps snapshot necessarily observes its own short-lived `ps` command.
  if (name === 'process-identities') lines = lines.filter((line) => !/\sps$/.test(line));
  return [...new Set(lines)].sort();
}

export function productionMetadataDelta(beforeRows, afterRows) {
  const before = new Map(beforeRows.map((row) => [row.name, linesForMetadata(row.name, row.output)]));
  const after = new Map(afterRows.map((row) => [row.name, linesForMetadata(row.name, row.output)]));
  const commands = [];
  for (const name of [...new Set([...before.keys(), ...after.keys()])].sort()) {
    const prior = before.get(name) ?? [];
    const next = after.get(name) ?? [];
    const priorSet = new Set(prior);
    const nextSet = new Set(next);
    const added = next.filter((line) => !priorSet.has(line));
    const removed = prior.filter((line) => !nextSet.has(line));
    commands.push({
      name,
      beforeCount: prior.length,
      afterCount: next.length,
      beforeSha256: sha256(`${prior.join('\n')}\n`),
      afterSha256: sha256(`${next.join('\n')}\n`),
      added,
      removed,
      unchanged: added.length === 0 && removed.length === 0,
    });
  }
  return {
    kind: 'production-metadata-delta',
    metadataOnly: true,
    productionContentRead: false,
    observerRowsExcluded: ['process identity row whose comm is ps'],
    commands,
    unchanged: commands.every((command) => command.unchanged),
  };
}

function writeJson(path, value, options = {}) {
  writeBoundedFile(path, `${JSON.stringify(value, null, 2)}\n`, options);
}

function aggregate(rows, manifestHash) {
  const measured = rows.filter((row) => row.status === 'MEASURED');
  const notRun = rows.filter((row) => row.status === 'NOT RUN');
  if (notRun.length) {
    return {
      kind: 'baseline-aggregate',
      story: 'US-005',
      candidate: 'baseline',
      status: 'NOT RUN',
      reason: notRun[0].reason,
      requestedRepetitions: 3,
      measuredRepetitions: measured.length,
      notRunRepetitions: notRun.length,
      requiredRunCompleteness: `${measured.length}/3`,
      lifecycleSuccessCount: '0/3',
      metrics: 'not-comparable',
      imputation: false,
      selectiveRetries: false,
      manifestHash,
    };
  }
  const median = (values) => [...values].sort((a, b) => Number(BigInt(a) - BigInt(b)))[1];
  const range = (values) => {
    const sorted = [...values].sort((a, b) => Number(BigInt(a) - BigInt(b)));
    return { min: sorted[0], max: sorted[sorted.length - 1] };
  };
  const ready = measured.map((row) => row.launchToReadyNs);
  const recovery = measured.map((row) => row.nonZeroRecoveryNs);
  return {
    kind: 'baseline-aggregate',
    story: 'US-005',
    candidate: 'baseline',
    status: 'MEASURED',
    requestedRepetitions: 3,
    measuredRepetitions: 3,
    notRunRepetitions: 0,
    requiredRunCompleteness: '3/3',
    lifecycleSuccessCount: `${measured.filter((row) => row.outcome === 'PASS').length}/3`,
    launchToReadyNs: { median: median(ready), inclusiveMinMax: range(ready) },
    nonZeroRecoveryNs: { median: median(recovery), inclusiveMinMax: range(recovery) },
    imputation: false,
    selectiveRetries: false,
    manifestHash,
  };
}

function createFrameSession(child) {
  const decoder = new BoundedJsonlDecoder();
  const frames = [];
  const waiters = [];
  const stderr = [];
  let stderrBytes = 0;
  let terminalError = null;
  let exitResult = null;
  let resolveExit;
  const exited = new Promise((resolvePromise) => { resolveExit = resolvePromise; });

  const dispatch = (frame) => {
    frames.push(frame);
    for (let index = waiters.length - 1; index >= 0; index -= 1) {
      const waiter = waiters[index];
      if (waiter.predicate(frame.value)) {
        waiters.splice(index, 1);
        clearTimeout(waiter.timer);
        waiter.resolve(frame);
      }
    }
  };

  child.stdout.on('data', (chunk) => {
    try {
      for (const frame of decoder.push(chunk)) dispatch(frame);
    } catch (error) {
      terminalError = error;
      child.stdin.destroy();
    }
  });
  child.stderr.on('data', (chunk) => {
    stderrBytes += chunk.length;
    if (stderrBytes <= 1024 * 1024) stderr.push(chunk);
    else terminalError = new Error('baseline stderr exceeded retained-log cap');
  });
  child.once('error', (error) => {
    terminalError = error;
    exitResult = { code: null, signal: null };
    resolveExit(exitResult);
  });
  child.once('exit', (code, signal) => {
    exitResult = { code, signal };
    resolveExit(exitResult);
  });

  return {
    frames,
    send(value) {
      assert(!terminalError, terminalError?.message);
      assert(child.exitCode === null && !child.killed, 'baseline child is not running');
      child.stdin.write(encodeFrame(value));
    },
    waitFor(predicate, timeoutMs, label) {
      const existing = frames.find((frame) => predicate(frame.value));
      if (existing) return Promise.resolve(existing);
      return new Promise((resolvePromise, reject) => {
        const waiter = { predicate, resolve: resolvePromise, timer: null };
        waiter.timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error(`${label} deadline exceeded`));
        }, timeoutMs);
        waiters.push(waiter);
      });
    },
    async waitForExit(timeoutMs) {
      const timer = new Promise((_, reject) => setTimeout(() => reject(new Error('baseline exit deadline exceeded')), timeoutMs));
      const result = exitResult ?? await Promise.race([exited, timer]);
      if (terminalError) throw terminalError;
      return result;
    },
    finishSummary() {
      const protocol = decoder.finish();
      return {
        protocol,
        stderr: boundedText(Buffer.concat(stderr).toString('utf8')),
        frameTypes: frames.map((frame) => frame.summary.type),
      };
    },
  };
}

async function launchBaselineProcess({ dirs, registry, repetition, role }) {
  const env = buildChildEnvironment(dirs);
  const script = join(FIXTURE_ROOT, 'baseline.mjs');
  const startNs = process.hrtime.bigint();
  const child = spawn('unshare', ['--user', '--map-root-user', '--net', '--', process.execPath, script], {
    cwd: dirs.root,
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const ownership = registry.register({
    pid: child.pid,
    parentPid: process.pid,
    role,
    candidate: 'baseline',
    namespace: `fresh-user-network-repetition-${repetition}`,
  });
  return { child, ownership, session: createFrameSession(child), startNs };
}

async function measuredRepetition(repetition, manifest) {
  const dirs = createRuntimeRoot();
  assertDisposableHomesEmpty(dirs);
  const registry = new OwnedProcessRegistry({ runtimeRoot: dirs.root });
  const repetitionStartNs = process.hrtime.bigint();
  const operationBudgetSeconds = manifest.deadlinesSeconds.totalRepetition - manifest.deadlinesSeconds.cleanup;
  const operationDeadlineNs = repetitionStartNs + BigInt(operationBudgetSeconds) * 1_000_000_000n;
  const boundedDeadlineMs = (requestedMs, label) => {
    const remainingNs = operationDeadlineNs - process.hrtime.bigint();
    if (remainingNs <= 0n) throw new Error(`total repetition deadline reached before ${label}`);
    const remainingMs = Number(remainingNs / 1_000_000n);
    return Math.max(1, Math.min(requestedMs, remainingMs));
  };
  const utcStart = new Date().toISOString();
  let cleanup;
  let first;
  let replacement;
  try {
    first = await launchBaselineProcess({ dirs, registry, repetition, role: 'baseline-initial' });
    await first.session.waitFor((frame) => frame.type === 'ready', boundedDeadlineMs(manifest.deadlinesSeconds.ready * 1000, 'ready'), 'ready');
    const readyNs = process.hrtime.bigint();
    const idleMs = manifest.deadlinesSeconds.idle * 1000;
    assert(boundedDeadlineMs(idleMs, 'idle window') >= idleMs, 'insufficient total deadline for idle window');
    await new Promise((resolvePromise) => setTimeout(resolvePromise, idleMs));
    assert(first.child.exitCode === null, 'baseline did not survive idle window');
    first.session.send({ type: 'idle' });
    const idle = await first.session.waitFor((frame) => frame.type === 'idle_survived', boundedDeadlineMs(manifest.deadlinesSeconds.ready * 1000, 'idle response'), 'idle response');
    assert(idle.value.seconds === 30 && idle.value.childPidUnchanged === true, 'invalid idle-survival response');
    first.session.send({ type: 'status' });
    const initialStatus = await first.session.waitFor((frame) => frame.type === 'status', boundedDeadlineMs(manifest.deadlinesSeconds.ready * 1000, 'status'), 'status');
    first.session.send({ type: 'log' });
    const log = await first.session.waitFor((frame) => frame.type === 'log', boundedDeadlineMs(manifest.deadlinesSeconds.ready * 1000, 'bounded log'), 'bounded log');
    const nonZeroStartNs = process.hrtime.bigint();
    first.session.send({ type: 'exit', code: 7 });
    const nonZeroExit = await first.session.waitForExit(boundedDeadlineMs(manifest.deadlinesSeconds.recovery * 1000, 'non-zero exit'));
    assert(nonZeroExit.code === 7, 'baseline non-zero exit did not propagate');
    const firstSummary = first.session.finishSummary();

    replacement = await launchBaselineProcess({ dirs, registry, repetition, role: 'baseline-recovery' });
    await replacement.session.waitFor((frame) => frame.type === 'ready', boundedDeadlineMs(manifest.deadlinesSeconds.ready * 1000, 'recovery ready'), 'recovery ready');
    const recoveryNs = process.hrtime.bigint();
    replacement.session.send({ type: 'restart-observed' });
    const restart = await replacement.session.waitFor((frame) => frame.type === 'restart_count', boundedDeadlineMs(manifest.deadlinesSeconds.ready * 1000, 'restart count'), 'restart count');
    replacement.session.send({ type: 'status' });
    const recoveredStatus = await replacement.session.waitFor((frame) => frame.type === 'status' && frame.restartCount === 1, boundedDeadlineMs(manifest.deadlinesSeconds.ready * 1000, 'recovered status'), 'recovered status');
    replacement.session.send({ type: 'exit', code: 0 });
    const cleanExit = await replacement.session.waitForExit(boundedDeadlineMs(manifest.deadlinesSeconds.cleanup * 1000, 'clean exit'));
    assert(cleanExit.code === 0, 'baseline clean exit did not propagate');
    const replacementSummary = replacement.session.finishSummary();

    cleanup = await registry.cleanup({ termWaitMs: 5000, removeRoot: true });
    const totalNs = process.hrtime.bigint() - repetitionStartNs;
    assert(totalNs <= BigInt(manifest.deadlinesSeconds.totalRepetition) * 1_000_000_000n, 'total repetition deadline exceeded');
    return {
      kind: 'baseline-repetition',
      story: 'US-005',
      candidate: 'baseline',
      repetition,
      status: 'MEASURED',
      outcome: 'PASS',
      utcStart,
      utcEnd: new Date().toISOString(),
      monotonicDurationNs: totalNs.toString(),
      launchToReadyNs: (readyNs - first.startNs).toString(),
      idleSurvivalNs: (BigInt(manifest.deadlinesSeconds.idle) * 1_000_000_000n).toString(),
      idleWindowSeconds: manifest.deadlinesSeconds.idle,
      cleanExit: { code: cleanExit.code, signal: cleanExit.signal },
      nonZeroExit: { code: nonZeroExit.code, signal: nonZeroExit.signal },
      nonZeroRecovery: true,
      nonZeroRecoveryNs: (recoveryNs - nonZeroStartNs).toString(),
      finalStatus: recoveredStatus.value.status,
      restartCount: restart.value.restartCount,
      boundedLogAccess: log.value.message === 'SYNTHETIC_LOG',
      initialStatus: { status: initialStatus.value.status, restartCount: initialStatus.value.restartCount },
      ownedProcesses: [first.ownership, replacement.ownership],
      protocol: { initial: firstSummary.protocol, recovery: replacementSummary.protocol },
      frameTypes: { initial: firstSummary.frameTypes, recovery: replacementSummary.frameTypes },
      syntheticStderr: { initial: firstSummary.stderr, recovery: replacementSummary.stderr },
      cleanupStatus: cleanup.status,
      cleanup,
      censored: false,
      comparable: true,
    };
  } catch (error) {
    try {
      cleanup = await registry.cleanup({ termWaitMs: 5000, removeRoot: true });
    } catch (cleanupError) {
      throw new Error(`baseline repetition failed and cleanup failed: ${error.message}; ${cleanupError.message}`);
    }
    throw error;
  }
}

async function main() {
  const options = argsOf(process.argv.slice(2));
  assert(Object.keys(options).sort().join(',') === 'candidate,manifest,output,story', 'exactly --story, --candidate, --manifest, and --output are required');
  const expectedCandidate = {
    'US-005': 'baseline',
    'US-006': 'pm2-direct-rpc-topology',
    'US-007': 'pm2-rpc-host-wrapper',
    'US-008': 'rpc-extension-probe',
    'US-009': 'pm2-direct-no-mode',
    'US-010': 'pm2-pty-control',
  }[options.story];
  assert(expectedCandidate, 'run.mjs supports exactly US-005 through US-010');
  assert(options.candidate === expectedCandidate, `${options.story} candidate must be exact`);

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
  if (options.story === 'US-005') assertFrozenBaselineManifest(manifest, manifestHash);
  else if (options.story === 'US-006') assertFrozenDirectManifest(manifest, manifestHash, EXPECTED_MANIFEST_HASH);
  else assertFrozenControlManifest(manifest, manifestHash, EXPECTED_MANIFEST_HASH, options.story);
  const frozenHashRecord = readFileSync(join(TASK_ROOT, 'evidence', 'US-004', 'manifest.sha256'), 'utf8').trim().split(/\s+/)[0];
  assert(frozenHashRecord === manifestHash, 'US-004 frozen hash record does not match manifest');

  // Immutable launch gate: this runs before any runtime root, PM2 setup, or
  // PM2/Pi candidate path. An unavailable namespace must remain safe NOT RUN.
  const network = proveDeniedNetwork();
  const beforeMetadata = snapshotProductionMetadata(resolve('.'));
  let result;
  let aggregateResult;
  if (options.story === 'US-005') {
    result = await executeCandidateGate({
      network,
      repetitions: manifest.measurement.measuredRepetitions,
      manifestHash,
      launchCandidate: (repetition) => measuredRepetition(repetition, manifest),
    });
    aggregateResult = aggregate(result.rows, manifestHash);
  } else if (options.story === 'US-006') {
    assert(network.status === 'NOT RUN', 'US-006 execution is authorized only for the verified unavailable-isolation path in this study');
    const piSource = inspectPublicPiSource();
    result = characterizeDirectTopologyNotRun({
      network,
      repetitions: manifest.measurement.measuredRepetitions,
      manifestHash,
      piSource,
    });
    aggregateResult = result.aggregate;
  } else {
    assert(network.status === 'NOT RUN', `${options.story} execution is authorized only for the verified unavailable-isolation path in this study`);
    const readEvidenceJson = (story, name) => JSON.parse(readFileSync(join(TASK_ROOT, 'evidence', story, name), 'utf8'));
    if (options.story === 'US-007') {
      result = characterizeWrapperNotRun({
        network,
        directAggregate: readEvidenceJson('US-006', 'aggregate.json'),
        directTransport: readEvidenceJson('US-006', 'transport.json'),
        manifestHash,
      });
    } else if (options.story === 'US-008') {
      result = characterizeExtensionProbeNotRun({
        network,
        directAggregate: readEvidenceJson('US-006', 'aggregate.json'),
        wrapperAggregate: readEvidenceJson('US-007', 'aggregate.json'),
        manifestHash,
      });
    } else if (options.story === 'US-009') {
      result = characterizeNoModeNotRun({ network, manifestHash });
    } else {
      result = characterizePtyControlNotRun({
        network,
        manifestHash,
        utilityMetadata: detectPtyUtilityMetadata(),
      });
    }
    aggregateResult = result.aggregate;
  }
  const afterMetadata = snapshotProductionMetadata(resolve('.'));
  const metadataDelta = productionMetadataDelta(beforeMetadata, afterMetadata);
  const manifestHashAfter = sha256(readFileSync(manifestPath));
  assert(manifestHashAfter === manifestHash, 'frozen manifest changed during run');
  if (network.status !== 'PROVEN') assert(result.candidateLaunchCount === 0, 'candidate launch occurred after denied network preflight');
  assert(metadataDelta.unchanged, 'production metadata changed during the candidate gate');

  mkdirSync(outputDir, { recursive: true, mode: 0o700 });
  const evidenceOptions = { worktreeRoot: resolve('.') };
  writeBoundedFile(join(outputDir, 'run.jsonl'), `${result.rows.map((row) => JSON.stringify(row)).join('\n')}\n`, evidenceOptions);
  writeJson(join(outputDir, 'aggregate.json'), aggregateResult, evidenceOptions);
  writeJson(join(outputDir, 'production-metadata-delta.json'), metadataDelta, evidenceOptions);
  if (options.story === 'US-006') {
    writeJson(join(outputDir, 'version-integrity-source.json'), result.packageEvidence, evidenceOptions);
    writeJson(join(outputDir, 'topology.json'), result.topology, evidenceOptions);
    writeJson(join(outputDir, 'transport.json'), result.transport, evidenceOptions);
  }
  for (const [name, value] of Object.entries(result.artifacts ?? {})) {
    assert(!name.includes('/') && name.endsWith('.json'), 'characterization artifact name must be a bounded JSON basename');
    writeJson(join(outputDir, name), value, evidenceOptions);
  }
  const cleanupProof = network.status === 'PROVEN'
    ? {
        kind: 'cleanup-proof',
        status: 'clean',
        repetitions: result.rows.map((row) => ({ repetition: row.repetition, cleanup: row.cleanup })),
        registeredOwnedProcessCount: result.rows.reduce((count, row) => count + (row.ownedProcesses?.length ?? 0), 0),
        remainingOwnedPids: [],
      }
    : {
        kind: 'cleanup-proof',
        status: 'clean-no-candidate-launched',
        reason: network.reason,
        candidateLaunchCount: 0,
        pm2DaemonLaunchCount: 0,
        piLaunchCount: 0,
        wrapperLaunchCount: 0,
        ptyUtilityLaunchCount: 0,
        providerModelTurnCount: 0,
        productionExtensionLoadCount: 0,
        productionSettingsLoadCount: 0,
        packageFetchProcessCount: 0,
        runtimeRootsCreated: 0,
        ownedRegistryCreated: false,
        registeredOwnedProcessCount: 0,
        signalAttempts: 0,
        remainingOwnedPids: [],
        residue: 'none-created',
        wrapperSubstituted: false,
        idempotent: true,
      };
  writeJson(join(outputDir, 'cleanup-proof.json'), cleanupProof, evidenceOptions);

  const endedAtUtc = new Date().toISOString();
  const verification = {
    kind: 'story-run',
    command: EXACT_COMMANDS[options.story],
    story: options.story,
    candidate: options.candidate,
    status: 'PASS',
    result: aggregateResult.status,
    exitCode: 0,
    startedAtUtc,
    endedAtUtc,
    durationNs: (process.hrtime.bigint() - startedNs).toString(),
    manifestHashBefore: manifestHash,
    manifestHashAfter,
    frozenManifestUnchanged: manifestHash === EXPECTED_MANIFEST_HASH,
    networkIsolation: network.status,
    notRunReason: network.status === 'NOT RUN' ? network.reason : null,
    networkProofCommand: network.command,
    networkProbeExitCode: network.probeExitCode ?? 0,
    candidateLaunchCount: result.candidateLaunchCount,
    candidateLaunched: result.candidateLaunchCount > 0,
    pm2DaemonLaunched: false,
    piLaunched: false,
    wrapperLaunched: false,
    wrapperSubstituted: false,
    ptyUtilityLaunched: false,
    providerModelTurnCount: 0,
    liveModelTurnCount: 0,
    productionExtensionLoadCount: 0,
    productionSettingsLoadCount: 0,
    utilityMetadataDetected: aggregateResult.compatibilityMetadataDetected ?? false,
    observationPerformed: result.rows.some((row) => row.status === 'MEASURED'),
    requestedRepetitions: 3,
    measuredRepetitions: result.rows.filter((row) => row.status === 'MEASURED').length,
    notRunRepetitions: result.rows.filter((row) => row.status === 'NOT RUN').length,
    productionMetadataOnly: true,
    productionContentRead: false,
    productionMetadataUnchanged: metadataDelta.unchanged,
    cleanupStatus: cleanupProof.status,
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
