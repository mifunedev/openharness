import { appendFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export const MAX_RETAINED_LOG_BYTES = 1024 * 1024;

export function sanitizeText(value, { runtimeRoot, worktreeRoot } = {}) {
  let text = String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
  if (runtimeRoot) text = text.split(resolve(runtimeRoot)).join('<FIXTURE_ROOT>');
  if (worktreeRoot) text = text.split(resolve(worktreeRoot)).join('<WORKTREE_ROOT>');
  return text;
}

export function boundedText(value, options = {}) {
  const sanitized = sanitizeText(value, options);
  const bytes = Buffer.from(sanitized);
  if (bytes.length <= MAX_RETAINED_LOG_BYTES) return sanitized;
  return `${bytes.subarray(0, MAX_RETAINED_LOG_BYTES - 64).toString('utf8')}\n<TRUNCATED:1MiB-CAP>\n`;
}

export function writeBoundedFile(path, value, options = {}) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, boundedText(value, options), { encoding: 'utf8', mode: 0o600 });
  if (statSync(path).size > MAX_RETAINED_LOG_BYTES) throw new Error('bounded evidence cap failure');
}

export function appendVerification(path, row) {
  mkdirSync(dirname(path), { recursive: true });
  const safe = JSON.parse(JSON.stringify(row, (_key, value) => typeof value === 'string' ? sanitizeText(value) : value));
  appendFileSync(path, `${JSON.stringify(safe)}\n`, { encoding: 'utf8', mode: 0o600 });
}

export function readVerification(path) {
  return readFileSync(path, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
}
