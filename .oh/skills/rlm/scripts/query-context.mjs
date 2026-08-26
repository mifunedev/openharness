#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";


export const MAX_SLICE_BYTES = 32 * 1024;

export const DEFAULT_CHUNK_SIZE = 100;

const NEWLINE = 0x0a;

const USAGE = `usage: query-context.mjs <path> [options]
  --grep <re>        report match locations ({line, col, byteOffset}) for a regex
  --slice L1:L2      return the addressed line span (1-based, inclusive)
  --chunk <size>     chunk-map granularity in lines (default ${DEFAULT_CHUNK_SIZE})
  --map              return ONLY the chunk map (line ranges + byte offsets); no content
  --max-bytes <n>    override the max-bytes guard (default ${MAX_SLICE_BYTES})
  -h | --help

Output is JSON on stdout. A slice/grep result is capped at the max-bytes guard:
when exceeded it is truncated at a line boundary with truncated:true + bytesOmitted.`;


export function buildLineIndex(buf) {
  const lines = [];
  let start = 0;
  for (let i = 0; i < buf.length; i += 1) {
    if (buf[i] === NEWLINE) {
      lines.push({ start, end: i + 1, text: buf.toString("utf8", start, i) });
      start = i + 1;
    }
  }
  if (start < buf.length) {
    lines.push({ start, end: buf.length, text: buf.toString("utf8", start, buf.length) });
  }
  return lines;
}


export function buildChunkMap(lines, chunkSize) {
  const size = Math.max(1, Math.floor(chunkSize));
  const chunks = [];
  for (let lo = 0; lo < lines.length; lo += size) {
    const hi = Math.min(lo + size, lines.length);
    const startByte = lines[lo].start;
    const endByte = lines[hi - 1].end;
    chunks.push({
      index: chunks.length,
      startLine: lo + 1,
      endLine: hi,
      lineCount: hi - lo,
      startByte,
      endByte,
      byteLength: endByte - startByte,
    });
  }
  return chunks;
}


export function buildBoundedSlice(buf, lines, loIdx, hiIdx, maxBytes = MAX_SLICE_BYTES) {
  const cap = Math.max(1, Math.floor(maxBytes));
  const startByte = lines[loIdx].start;
  const requestedEndByte = lines[hiIdx].end;
  const requestedBytes = requestedEndByte - startByte;

  let endByte = startByte;
  let lastLineIdx = loIdx - 1;
  let truncated = false;

  for (let i = loIdx; i <= hiIdx; i += 1) {
    const cumulative = lines[i].end - startByte;
    if (cumulative > cap) {
      truncated = true;
      if (i === loIdx) {
        endByte = startByte + cap;
        lastLineIdx = loIdx;
      }
      break;
    }
    endByte = lines[i].end;
    lastLineIdx = i;
  }

  const returnedBytes = endByte - startByte;
  return {
    requestedStartLine: loIdx + 1,
    requestedEndLine: hiIdx + 1,
    startLine: loIdx + 1,
    endLine: lastLineIdx + 1,
    startByte,
    endByte,
    requestedBytes,
    returnedBytes,
    bytesOmitted: requestedBytes - returnedBytes,
    truncated,
    content: buf.toString("utf8", startByte, endByte),
  };
}


export function grepLines(lines, pattern, chunkSize, maxBytes = MAX_SLICE_BYTES) {
  const cap = Math.max(1, Math.floor(maxBytes));
  const size = Math.max(1, Math.floor(chunkSize));
  const re = new RegExp(pattern, "g");
  const matches = [];
  let totalMatches = 0;
  let usedBytes = 0;
  let omittedBytes = 0;
  let truncated = false;

  for (let li = 0; li < lines.length; li += 1) {
    const { text, start } = lines[li];
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      totalMatches += 1;
      const preview = text.length > 256 ? `${text.slice(0, 256)}…` : text;
      const previewBytes = Buffer.byteLength(preview, "utf8");
      if (usedBytes + previewBytes > cap) {
        truncated = true;
        omittedBytes += previewBytes;
      } else {
        usedBytes += previewBytes;
        matches.push({
          line: li + 1,
          col: m.index + 1,
          byteOffset: start + Buffer.byteLength(text.slice(0, m.index), "utf8"),
          chunkIndex: Math.floor(li / size),
          match: m[0],
          text: preview,
        });
      }
      if (m.index === re.lastIndex) re.lastIndex += 1;
    }
  }

  return {
    pattern,
    matchCount: totalMatches,
    returnedMatches: matches.length,
    truncated,
    returnedBytes: usedBytes,
    bytesOmitted: omittedBytes,
    matches,
  };
}


export function analyze(buf, opts) {
  const chunkSize = opts.chunk != null ? opts.chunk : DEFAULT_CHUNK_SIZE;
  const maxBytes = opts.maxBytes != null ? opts.maxBytes : MAX_SLICE_BYTES;
  const lines = buildLineIndex(buf);
  const chunkMap = buildChunkMap(lines, chunkSize);

  const out = {
    path: opts.path,
    totalLines: lines.length,
    totalBytes: buf.length,
    chunkSize,
    maxSliceBytes: maxBytes,
    chunkMap,
  };

  if (opts.map) {
    out.mode = "map";
    return out;
  }

  if (opts.grep != null) {
    out.mode = opts.slice ? "grep+slice" : "grep";
    out.grep = grepLines(lines, opts.grep, chunkSize, maxBytes);
  }

  if (opts.slice || opts.grep == null) {
    if (lines.length === 0) {
      out.mode = out.mode || "slice";
      out.slice = {
        requestedStartLine: 0,
        requestedEndLine: 0,
        startLine: 0,
        endLine: 0,
        startByte: 0,
        endByte: 0,
        requestedBytes: 0,
        returnedBytes: 0,
        bytesOmitted: 0,
        truncated: false,
        content: "",
      };
      return out;
    }
    const loIdx = opts.slice ? clampLine(opts.slice.from, lines.length) - 1 : 0;
    const hiIdx = opts.slice ? clampLine(opts.slice.to, lines.length) - 1 : lines.length - 1;
    out.mode = out.mode || "slice";
    out.slice = buildBoundedSlice(buf, lines, loIdx, hiIdx, maxBytes);
  }

  return out;
}

function clampLine(n, total) {
  if (!Number.isFinite(n)) return 1;
  return Math.min(Math.max(1, Math.floor(n)), total);
}


export function parseArgs(argv) {
  const args = {
    path: null,
    grep: null,
    slice: null,
    chunk: null,
    map: false,
    maxBytes: null,
  };
  const need = (i, flag) => {
    if (i + 1 >= argv.length) throw new Error(`${flag} requires a value`);
    return argv[i + 1];
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    switch (a) {
      case "--grep":
        args.grep = need(i, a);
        i += 1;
        break;
      case "--slice": {
        const raw = need(i, a);
        i += 1;
        args.slice = parseSlice(raw);
        break;
      }
      case "--chunk":
        args.chunk = Number(need(i, a));
        i += 1;
        if (!Number.isInteger(args.chunk) || args.chunk <= 0) {
          throw new Error("--chunk must be a positive integer");
        }
        break;
      case "--map":
        args.map = true;
        break;
      case "--max-bytes":
        args.maxBytes = Number(need(i, a));
        i += 1;
        if (!Number.isInteger(args.maxBytes) || args.maxBytes <= 0) {
          throw new Error("--max-bytes must be a positive integer");
        }
        break;
      case "-h":
      case "--help":
        process.stdout.write(`${USAGE}\n`);
        process.exit(0);
        break;
      default:
        if (a.startsWith("-")) throw new Error(`unknown flag: ${a}`);
        if (args.path != null) throw new Error(`unexpected extra positional: ${a}`);
        args.path = a;
        break;
    }
  }
  if (args.path == null) throw new Error("a <path> argument is required");
  return args;
}

export function parseSlice(raw) {
  const m = /^(\d+):(\d+)$/.exec(raw.trim());
  if (!m) throw new Error(`--slice must be L1:L2 (got '${raw}')`);
  const from = Number(m[1]);
  const to = Number(m[2]);
  if (from < 1 || to < 1) throw new Error("--slice line numbers are 1-based (>= 1)");
  if (from > to) throw new Error(`--slice start (${from}) must be <= end (${to})`);
  return { from, to };
}


function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`error: ${err.message}\n\n${USAGE}\n`);
    process.exit(64);
  }

  let buf;
  try {
    buf = fs.readFileSync(args.path);
  } catch (err) {
    process.stderr.write(`error: cannot read '${args.path}': ${err.message}\n`);
    process.exit(1);
  }

  let result;
  try {
    result = analyze(buf, args);
  } catch (err) {
    process.stderr.write(`error: ${err.message}\n`);
    process.exit(1);
  }

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (path.basename(process.argv[1] || "") === "query-context.mjs") {
  main();
}
