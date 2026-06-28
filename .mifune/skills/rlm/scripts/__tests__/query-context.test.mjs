// node --test suite for the rlm query-context primitive. Pure node:test +
// node:assert — no vitest/tsx. Run:
//   node --test .mifune/skills/rlm/scripts/__tests__/query-context.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

import {
  buildLineIndex,
  buildChunkMap,
  buildBoundedSlice,
  grepLines,
  analyze,
  parseArgs,
  parseSlice,
  MAX_SLICE_BYTES,
  DEFAULT_CHUNK_SIZE,
} from "../query-context.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, "..", "query-context.mjs");
const FIXTURE = path.join(HERE, "fixtures", "big-sample.txt");

// Run the CLI and parse its JSON stdout.
function runCli(extraArgs) {
  const out = execFileSync("node", [SCRIPT, FIXTURE, ...extraArgs], { encoding: "utf8" });
  return JSON.parse(out);
}

const FIXTURE_BUF = fs.readFileSync(FIXTURE);
const FIXTURE_LINES = FIXTURE_BUF.toString("utf8").split("\n");
// split() on a trailing-newline file yields a trailing "" element; drop it.
if (FIXTURE_LINES[FIXTURE_LINES.length - 1] === "") FIXTURE_LINES.pop();

// --- chunk map (--map) ------------------------------------------------------

test("--map returns ONLY the chunk map: line ranges + byte offsets, no content", () => {
  const out = runCli(["--map"]);
  assert.equal(out.mode, "map");
  assert.equal(out.totalLines, FIXTURE_LINES.length);
  assert.equal(out.totalBytes, FIXTURE_BUF.length);

  // No content anywhere in map mode.
  assert.ok(!("slice" in out), "no slice in --map output");
  assert.ok(!("grep" in out), "no grep in --map output");
  for (const c of out.chunkMap) assert.ok(!("content" in c), "chunk carries no content");

  // 600 lines / default chunk 100 = 6 chunks, contiguous & covering the whole file.
  assert.equal(out.chunkSize, DEFAULT_CHUNK_SIZE);
  assert.equal(out.chunkMap.length, Math.ceil(FIXTURE_LINES.length / DEFAULT_CHUNK_SIZE));
  assert.equal(out.chunkMap[0].startLine, 1);
  assert.equal(out.chunkMap[0].startByte, 0);
  assert.equal(out.chunkMap.at(-1).endLine, FIXTURE_LINES.length);
  assert.equal(out.chunkMap.at(-1).endByte, FIXTURE_BUF.length);
  for (let i = 1; i < out.chunkMap.length; i += 1) {
    assert.equal(out.chunkMap[i].startByte, out.chunkMap[i - 1].endByte, "byte ranges are contiguous");
    assert.equal(out.chunkMap[i].startLine, out.chunkMap[i - 1].endLine + 1, "line ranges are contiguous");
  }

  // And the raw stdout must not leak file content.
  const raw = execFileSync("node", [SCRIPT, FIXTURE, "--map"], { encoding: "utf8" });
  assert.ok(!raw.includes("lorem ipsum"), "map mode never emits file content");
});

// --- line slice -------------------------------------------------------------

test("--slice L1:L2 returns the addressed line span with correct offsets, untruncated", () => {
  const out = runCli(["--slice", "10:20"]);
  assert.equal(out.slice.startLine, 10);
  assert.equal(out.slice.endLine, 20);
  assert.equal(out.slice.truncated, false);
  assert.equal(out.slice.bytesOmitted, 0);

  // Content equals exactly lines 10..20 of the fixture (+ trailing newlines).
  const expected = `${FIXTURE_LINES.slice(9, 20).join("\n")}\n`;
  assert.equal(out.slice.content, expected);

  // Byte offsets line up with the buffer.
  assert.equal(
    FIXTURE_BUF.toString("utf8", out.slice.startByte, out.slice.endByte),
    out.slice.content,
  );
  assert.ok(out.slice.returnedBytes <= MAX_SLICE_BYTES, "well under the guard");
});

// --- grep with match locations ----------------------------------------------

test("--grep reports match locations as {line, col} (+ byteOffset, chunkIndex)", () => {
  const out = runCli(["--grep", "NEEDLE"]);
  assert.equal(out.grep.pattern, "NEEDLE");

  // Recompute expected NEEDLE locations directly from the fixture.
  const expected = [];
  FIXTURE_LINES.forEach((text, idx) => {
    const col = text.indexOf("NEEDLE");
    if (col >= 0) expected.push({ line: idx + 1, col: col + 1 });
  });
  assert.equal(expected.length, 6, "fixture sanity: six NEEDLE lines");
  assert.equal(out.grep.matchCount, expected.length);
  assert.equal(out.grep.matches.length, expected.length);
  assert.equal(out.grep.truncated, false);

  out.grep.matches.forEach((m, i) => {
    assert.equal(m.line, expected[i].line);
    assert.equal(m.col, expected[i].col);
    assert.equal(typeof m.byteOffset, "number");
    // byteOffset points at the literal match in the buffer.
    assert.equal(FIXTURE_BUF.toString("utf8", m.byteOffset, m.byteOffset + 6), "NEEDLE");
    assert.equal(m.chunkIndex, Math.floor((m.line - 1) / DEFAULT_CHUNK_SIZE));
  });
});

// --- max-bytes guard --------------------------------------------------------

test("max-bytes guard: a whole-file slice is truncated, never the full blob (default cap)", () => {
  // Default mode (no flags) addresses the WHOLE 46KB file; the 32KB guard bounds it.
  const out = runCli([]);
  assert.ok(FIXTURE_BUF.length > MAX_SLICE_BYTES, "fixture sanity: exceeds the cap");
  assert.equal(out.slice.truncated, true, "oversized slice is truncated");
  assert.ok(out.slice.returnedBytes <= MAX_SLICE_BYTES, "returned bytes never exceed the cap");
  assert.ok(out.slice.returnedBytes < FIXTURE_BUF.length, "did NOT return the whole file");
  assert.ok(out.slice.bytesOmitted > 0, "reports the withheld bytes");
  assert.equal(
    out.slice.returnedBytes + out.slice.bytesOmitted,
    out.slice.requestedBytes,
    "returned + omitted = requested",
  );
});

test("max-bytes guard: --max-bytes override truncates at a line boundary", () => {
  const out = runCli(["--slice", "1:600", "--max-bytes", "4096"]);
  assert.equal(out.maxSliceBytes, 4096);
  assert.equal(out.slice.truncated, true);
  assert.ok(out.slice.returnedBytes <= 4096, "respects the overridden cap");
  assert.ok(out.slice.bytesOmitted > 0);
  // Truncation is line-aligned: content ends on a newline (no partial line).
  assert.ok(out.slice.content.endsWith("\n"), "truncated at a line boundary");
  assert.ok(out.slice.endLine < 600, "stopped before the requested end");
});

// --- pure-function unit checks ----------------------------------------------

test("buildLineIndex byte spans include the newline and reproduce the file", () => {
  const buf = Buffer.from("alpha\nbeta\ngamma\n", "utf8");
  const lines = buildLineIndex(buf);
  assert.equal(lines.length, 3);
  assert.equal(lines[0].text, "alpha");
  assert.equal(buf.toString("utf8", lines[0].start, lines[0].end), "alpha\n");
  // Concatenating spans reproduces the buffer exactly.
  const joined = lines.map((l) => buf.toString("utf8", l.start, l.end)).join("");
  assert.equal(joined, buf.toString("utf8"));
});

test("buildBoundedSlice hard-caps even a single oversized line", () => {
  const big = "x".repeat(5000);
  const buf = Buffer.from(`${big}\nshort\n`, "utf8");
  const lines = buildLineIndex(buf);
  const slice = buildBoundedSlice(buf, lines, 0, 1, 1024);
  assert.equal(slice.truncated, true);
  assert.ok(slice.returnedBytes <= 1024, "never exceeds the cap, even on one giant line");
  assert.ok(slice.bytesOmitted > 0);
});

test("buildChunkMap partitions lines into fixed-size chunks", () => {
  const buf = Buffer.from(Array.from({ length: 250 }, (_, i) => `line ${i}`).join("\n") + "\n", "utf8");
  const lines = buildLineIndex(buf);
  const chunks = buildChunkMap(lines, 100);
  assert.equal(chunks.length, 3);
  assert.equal(chunks[0].lineCount, 100);
  assert.equal(chunks.at(-1).lineCount, 50);
});

test("analyze --map carries no content; analyze grep counts matches", () => {
  const buf = Buffer.from("foo\nbar NEEDLE\nbaz NEEDLE NEEDLE\n", "utf8");
  const mapOut = analyze(buf, { path: "x", map: true });
  assert.ok(!("slice" in mapOut) && !("grep" in mapOut));
  const lines = buildLineIndex(buf);
  const g = grepLines(lines, "NEEDLE", DEFAULT_CHUNK_SIZE);
  assert.equal(g.matchCount, 3, "two on line 3, one on line 2");
});

// --- CLI argument validation ------------------------------------------------

test("parseSlice / parseArgs reject malformed input", () => {
  assert.throws(() => parseSlice("10-20"), /L1:L2/);
  assert.throws(() => parseSlice("20:10"), /must be <=/);
  assert.throws(() => parseArgs(["--chunk", "0", "f"]), /positive integer/);
  assert.throws(() => parseArgs(["--map"]), /path.*required/);
  const ok = parseArgs(["file.txt", "--slice", "1:5", "--chunk", "10"]);
  assert.equal(ok.path, "file.txt");
  assert.deepEqual(ok.slice, { from: 1, to: 5 });
  assert.equal(ok.chunk, 10);
});

test("CLI exits non-zero on an unknown flag", () => {
  assert.throws(() => execFileSync("node", [SCRIPT, FIXTURE, "--bogus"], { encoding: "utf8", stdio: "pipe" }));
});
