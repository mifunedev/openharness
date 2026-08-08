import { createHash } from 'node:crypto';
import { StringDecoder } from 'node:string_decoder';

export const MAX_LINE_BYTES = 64 * 1024;
export const MAX_FRAMES = 10_000;
export const MAX_TOTAL_BYTES = 8 * 1024 * 1024;

export function frameType(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'unknown';
  if (value.type === 'extension_ui_request') {
    if (typeof value.id !== 'string' || typeof value.method !== 'string') throw new Error('invalid extension_ui_request frame');
    return 'extension_ui_request';
  }
  return typeof value.type === 'string' ? value.type : 'unknown';
}

export class BoundedJsonlDecoder {
  constructor({ maxLineBytes = MAX_LINE_BYTES, maxFrames = MAX_FRAMES, maxTotalBytes = MAX_TOTAL_BYTES } = {}) {
    this.maxLineBytes = maxLineBytes;
    this.maxFrames = maxFrames;
    this.maxTotalBytes = maxTotalBytes;
    this.decoder = new StringDecoder('utf8');
    this.buffer = '';
    this.totalBytes = 0;
    this.frames = [];
    this.hash = createHash('sha256');
  }

  push(chunk) {
    if (!Buffer.isBuffer(chunk)) chunk = Buffer.from(chunk);
    this.totalBytes += chunk.length;
    if (this.totalBytes > this.maxTotalBytes) throw new Error('JSONL total byte limit exceeded');
    this.hash.update(chunk);
    this.buffer += this.decoder.write(chunk);
    const out = [];
    for (;;) {
      const newline = this.buffer.indexOf('\n');
      if (newline < 0) break;
      const line = this.buffer.slice(0, newline);
      this.buffer = this.buffer.slice(newline + 1);
      if (Buffer.byteLength(line, 'utf8') > this.maxLineBytes) throw new Error('JSONL line byte limit exceeded');
      if (line.length === 0) throw new Error('empty JSONL frame');
      let value;
      try { value = JSON.parse(line); } catch { throw new Error('malformed JSONL frame'); }
      if (++this.frames.length > this.maxFrames) throw new Error('JSONL frame count limit exceeded');
      const summary = { sequence: this.frames.length, type: frameType(value), byteLength: Buffer.byteLength(line, 'utf8') };
      this.frames[this.frames.length - 1] = summary;
      out.push({ value, summary });
    }
    if (Buffer.byteLength(this.buffer, 'utf8') > this.maxLineBytes) throw new Error('JSONL line byte limit exceeded');
    return out;
  }

  finish() {
    this.buffer += this.decoder.end();
    if (this.buffer.length !== 0) throw new Error('unterminated JSONL frame');
    return { count: this.frames.length, types: this.frames.map((frame) => frame.type), sha256: this.hash.digest('hex'), totalBytes: this.totalBytes };
  }
}

export function encodeFrame(value) {
  const line = `${JSON.stringify(value)}\n`;
  if (Buffer.byteLength(line.slice(0, -1), 'utf8') > MAX_LINE_BYTES) throw new Error('JSONL line byte limit exceeded');
  return line;
}
