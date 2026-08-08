#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { BoundedJsonlDecoder, encodeFrame } from './jsonl.mjs';

// Purpose-built synthetic lifecycle surface with no external integrations.
let unhealthy = false;
let restartCount = 0;
const decoder = new BoundedJsonlDecoder();

function emit(value) {
  process.stdout.write(encodeFrame(value));
}

emit({ type: 'ready', pid: process.pid, synthetic: true });

process.stdin.on('data', (chunk) => {
  try {
    for (const { value } of decoder.push(chunk)) {
      switch (value.type) {
        case 'work':
          emit(unhealthy ? { type: 'work_blocked', reason: 'synthetic-unhealthy' } : { type: 'work_complete', sequence: value.sequence ?? null });
          break;
        case 'sentinel':
          unhealthy = true;
          process.stderr.write('SYNTHETIC_STALE_CONTEXT\n');
          emit({ type: 'sentinel_active', childPidUnchanged: true });
          break;
        case 'recover':
          unhealthy = false;
          emit({ type: 'recovered', component: value.component ?? 'fixture-watchdog', childPidUnchanged: true });
          break;
        case 'status':
          emit({ type: 'status', status: 'running', unhealthy, restartCount });
          break;
        case 'idle':
          emit({ type: 'idle_survived', seconds: 30, childPidUnchanged: true });
          break;
        case 'log':
          emit({ type: 'log', stream: 'synthetic', message: 'SYNTHETIC_LOG' });
          break;
        case 'restart-observed':
          restartCount += 1;
          emit({ type: 'restart_count', restartCount });
          break;
        case 'exit':
          emit({ type: 'exit_ack', code: Number(value.code) || 0 });
          process.exit(Number(value.code) || 0);
          break;
        default:
          throw new Error('unsupported synthetic frame type');
      }
    }
  } catch (error) {
    const digest = createHash('sha256').update(String(error.message)).digest('hex');
    process.stderr.write(`SYNTHETIC_PROTOCOL_ERROR hash=${digest}\n`);
    process.exitCode = 64;
    process.stdin.pause();
  }
});

process.stdin.on('end', () => {
  try { decoder.finish(); } catch { process.exitCode = 64; }
});
