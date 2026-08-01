import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BoundedJsonlDecoder } from '../jsonl.mjs';
import { scan } from '../secret-scan.mjs';

test('bounded JSONL preserves sequence/type and parses extension_ui_request', () => {
  const decoder = new BoundedJsonlDecoder();
  const input = '{"type":"ready"}\n{"type":"extension_ui_request","id":"synthetic-1","method":"confirm"}\n';
  const frames = decoder.push(Buffer.from(input));
  assert.deepEqual(frames.map((x) => x.summary.type), ['ready', 'extension_ui_request']);
  assert.equal(decoder.finish().count, 2);
});

test('malformed and unterminated JSONL fail closed', () => {
  assert.throws(() => new BoundedJsonlDecoder().push('{not-json}\n'), /malformed/);
  const decoder = new BoundedJsonlDecoder();
  decoder.push('{"type":"ready"}');
  assert.throws(() => decoder.finish(), /unterminated/);
});

test('oversized JSONL line and total stream fail closed', () => {
  const line = new BoundedJsonlDecoder({ maxLineBytes: 8 });
  assert.throws(() => line.push('{"type":"too-large"}\n'), /line byte limit/);
  const total = new BoundedJsonlDecoder({ maxTotalBytes: 5 });
  assert.throws(() => total.push('123456'), /total byte limit/);
});

test('secret scan rejects deterministic credential and personal-data fixtures', () => {
  const root = mkdtempSync(join(tmpdir(), 'secret-scan-'));
  try {
    writeFileSync(join(root, 'bad.jsonl'), 'API_KEY=not-a-real-value-1234\ncontact=person@private.invalid\n');
    const result = scan(root);
    assert.equal(result.status, 'FAIL');
    assert.deepEqual(result.findings.map((x) => x.rule).sort(), ['credential-assignment', 'personal-email']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('secret scan accepts bounded synthetic summaries', () => {
  const root = mkdtempSync(join(tmpdir(), 'secret-scan-clean-'));
  try {
    writeFileSync(join(root, 'summary.json'), JSON.stringify({ type: 'synthetic', sha256: '0'.repeat(64), contact: 'fixture@example.com' }));
    assert.equal(scan(root).status, 'PASS');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
