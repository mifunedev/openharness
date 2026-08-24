// node --test suite for the prompt-miner engine. Pure node:test + node:assert —
// no vitest/tsx. Run: node --test .claude/skills/prompt-miner/scripts/__tests__/
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

import {
  classifyLine,
  aggregateSession,
  scoreSession,
  extractFeatures,
  detectSessionType,
  redact,
  validateWeights,
  resolveGroundTruth,
  buildWeaknessRecords,
  computeCeilingSaturation,
  withinWindow,
  DEFAULT_WEIGHTS,
  MARKER_FEATURE_KEYS,
} from "../mine-traces.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENGINE = path.join(HERE, "..", "mine-traces.mjs");
const FIXTURES = path.join(HERE, "fixtures");

// --- Claude string-vs-array human-prompt detection -------------------------

test("Claude: string user content is a human prompt; array content is a tool_result", () => {
  const human = classifyLine(
    {
      type: "user",
      userType: "external",
      isMeta: null,
      sessionId: "s1",
      message: { role: "user", content: "Implement the thing." },
    },
    "claude",
  );
  assert.equal(human.kind, "human");
  assert.equal(human.isHuman, true);

  const toolResult = classifyLine(
    {
      type: "user",
      userType: "external",
      sessionId: "s1",
      message: { role: "user", content: [{ type: "tool_result", is_error: false, content: "ok" }] },
    },
    "claude",
  );
  assert.equal(toolResult.kind, "tool_result");
  assert.equal(toolResult.isHuman, false);
});

test("Claude: <command-name>, isMeta, and non-external lines are excluded as meta", () => {
  const wrapper = classifyLine(
    { type: "user", userType: "external", sessionId: "s", message: { role: "user", content: "<command-name>/compact</command-name>" } },
    "claude",
  );
  assert.equal(wrapper.kind, "meta");
  assert.equal(wrapper.isHuman, false);

  const meta = classifyLine(
    { type: "user", userType: "external", isMeta: true, sessionId: "s", message: { role: "user", content: "A session-scoped Stop hook is now active." } },
    "claude",
  );
  assert.equal(meta.kind, "meta");

  const internal = classifyLine(
    { type: "user", userType: "internal", sessionId: "s", message: { role: "user", content: "internal prompt" } },
    "claude",
  );
  assert.equal(internal.isHuman, false);

  const sdk = classifyLine(
    { type: "user", userType: "external", promptSource: "sdk", sessionId: "s", message: { role: "user", content: "sdk prompt" } },
    "claude",
  );
  assert.equal(sdk.isHuman, false);
});

// --- nested is_error (Claude) vs toolResult.isError (Pi) -------------------

test("Claude tool error is nested in the array; Pi error is on the toolResult message", () => {
  const claudeErr = classifyLine(
    { type: "user", userType: "external", sessionId: "s", message: { role: "user", content: [{ type: "tool_result", is_error: true }] } },
    "claude",
  );
  assert.equal(claudeErr.kind, "tool_result");
  assert.equal(claudeErr.isError, true);

  // Real Pi shape: message.isError
  const piErrFlat = classifyLine(
    { type: "message", message: { role: "toolResult", isError: true, content: [] } },
    "pi",
  );
  assert.equal(piErrFlat.kind, "tool_result");
  assert.equal(piErrFlat.isError, true);

  // Documented Pi shape: message.toolResult.isError
  const piErrNested = classifyLine(
    { type: "message", message: { role: "toolResult", toolResult: { isError: true } } },
    "pi",
  );
  assert.equal(piErrNested.isError, true);

  const piOk = classifyLine(
    { type: "message", message: { role: "toolResult", isError: false } },
    "pi",
  );
  assert.equal(piOk.isError, false);
});

test("Pi: type=message role=user is a human prompt with joined text blocks", () => {
  const ev = classifyLine(
    { type: "message", message: { role: "user", content: [{ type: "text", text: "Create the baz module." }] } },
    "pi",
  );
  assert.equal(ev.kind, "human");
  assert.equal(ev.isHuman, true);
  assert.match(ev.text, /Create the baz module/);
});

// --- abandonment / incompleteness from last assistant stop -----------------

test("abandonment via aborted; incompleteness via non-end_turn/stop; clean via end_turn", () => {
  const aborted = aggregateSession(
    [
      { kind: "human", isHuman: true, text: "go", ts: "2026-01-01T00:00:00Z" },
      { kind: "assistant", stopReason: "aborted", ts: "2026-01-01T00:01:00Z" },
    ],
    { sessionId: "a", harness: "pi" },
  );
  assert.equal(aborted.abandoned, 1);
  assert.equal(aborted.incomplete, 0);

  const incomplete = aggregateSession(
    [
      { kind: "human", isHuman: true, text: "go", ts: "2026-01-01T00:00:00Z" },
      { kind: "assistant", stopReason: "tool_use", ts: "2026-01-01T00:01:00Z" },
    ],
    { sessionId: "b", harness: "claude" },
  );
  assert.equal(incomplete.abandoned, 0);
  assert.equal(incomplete.incomplete, 1);

  const clean = aggregateSession(
    [
      { kind: "human", isHuman: true, text: "go", ts: "2026-01-01T00:00:00Z" },
      { kind: "assistant", stopReason: "end_turn", ts: "2026-01-01T00:01:00Z" },
    ],
    { sessionId: "c", harness: "claude" },
  );
  assert.equal(clean.abandoned, 0);
  assert.equal(clean.incomplete, 0);
});

// --- score-breakdown arithmetic on a known input ---------------------------

test("score-breakdown arithmetic matches the documented formula", () => {
  // Build: 2 human prompts (1 corrective), 1 tool error of 1 result, incomplete end.
  const events = [
    { kind: "human", isHuman: true, text: "Add the bar feature.", ts: "2026-01-01T00:00:00Z" },
    { kind: "assistant", stopReason: "tool_use", ts: "2026-01-01T00:01:00Z" },
    { kind: "tool_result", isError: true, ts: "2026-01-01T00:02:00Z" },
    { kind: "human", isHuman: true, text: "No, that's wrong. Revert.", ts: "2026-01-01T00:03:00Z" },
    { kind: "assistant", stopReason: "tool_use", ts: "2026-01-01T00:04:00Z" },
  ];
  const agg = aggregateSession(events, { sessionId: "k", harness: "claude" });
  assert.equal(agg.toolErrorRate, 1); // 1/1
  assert.equal(agg.correctionDensity, 0.5); // 1 corrective / 2 human
  assert.equal(agg.incomplete, 1);
  assert.equal(agg.abandoned, 0);

  const { score, scoreBreakdown } = scoreSession(agg, DEFAULT_WEIGHTS, { hasBonus: false });
  // 100 - 35*1 - 30*0.5 - 20*0 - 10*1 - 5*0 = 40
  assert.equal(score, 40);
  assert.equal(scoreBreakdown.penalties.toolErrorRate, 35);
  assert.equal(scoreBreakdown.penalties.correctionDensity, 15);
  assert.equal(scoreBreakdown.penalties.incomplete, 10);
  assert.equal(scoreBreakdown.groundTruthBonus, 0);
});

test("ground-truth bonus is added and the total is capped at 100", () => {
  const clean = aggregateSession(
    [
      { kind: "human", isHuman: true, text: "go", ts: "2026-01-01T00:00:00Z" },
      { kind: "assistant", stopReason: "end_turn", ts: "2026-01-01T00:01:00Z" },
    ],
    { sessionId: "g", harness: "claude" },
  );
  const { score } = scoreSession(clean, DEFAULT_WEIGHTS, { hasBonus: true });
  assert.equal(score, 100); // 100 + 15 capped at 100
});

// --- scoreUncapped: the uncensored sibling of score ------------------------

test("scoreUncapped carries the uncensored total while score stays clamped at 100", () => {
  const clean = aggregateSession(
    [
      { kind: "human", isHuman: true, text: "go", ts: "2026-01-01T00:00:00Z" },
      { kind: "assistant", stopReason: "end_turn", ts: "2026-01-01T00:01:00Z" },
    ],
    { sessionId: "u", harness: "claude" },
  );
  const scored = scoreSession(clean, DEFAULT_WEIGHTS, { hasBonus: true });
  assert.equal(scored.score, 100, "score is still clamped");
  assert.equal(scored.scoreUncapped, 115, "base 100 + bonus 15, uncensored");
  assert.ok(scored.scoreUncapped > 100, "the ceiling does not censor scoreUncapped");
  // Sibling of score, not nested in the breakdown.
  assert.ok(!("scoreUncapped" in scored.scoreBreakdown), "not nested in scoreBreakdown");
});

test("a maximally-penalized session floors scoreUncapped at 0 without going negative", () => {
  // Built as a literal agg: aggregateSession can never emit all five signals at
  // their maximum at once (abandoned and incomplete are mutually exclusive, and
  // correctionDensity counts follow-ups only, so it is (n-1)/n < 1). scoreSession
  // is pure, so the worst case the weights permit is exercised directly.
  const worst = {
    toolErrorRate: 1,
    correctionDensity: 1,
    abandoned: 1,
    incomplete: 1,
    turnBloat: 1,
  };
  const scored = scoreSession(worst, DEFAULT_WEIGHTS, { hasBonus: false });
  // 100 - 35 - 30 - 20 - 10 - 5 = 0
  assert.equal(scored.scoreUncapped, 0, "lower bound is unaffected by the change");
  assert.equal(scored.score, 0);
  assert.ok(scored.scoreUncapped >= 0, "current weights cannot produce a negative");
});

test("scoreUncapped is emitted on both sessions[] and unranked[] of a fixture run", () => {
  // --min-turns 4 splits the fixtures: the 3-turn session falls to unranked[].
  const out = execFileSync(
    "node",
    [ENGINE, "--dry-run", "--no-git", "--harness", "all", "--fixtures-dir", FIXTURES, "--min-turns", "4", "--now", "2026-06-19T00:00:00.000Z"],
    { encoding: "utf8" },
  );
  const data = JSON.parse(out);
  assert.ok(data.sessions.length > 0, "ranked population is non-empty");
  assert.ok(data.unranked.length > 0, "unranked population is non-empty");
  for (const r of [...data.sessions, ...data.unranked]) {
    assert.equal(typeof r.scoreUncapped, "number", `scoreUncapped on ${r.sessionId}`);
  }
});

test("sessions[] ranking still sorts on the clamped score, not scoreUncapped", () => {
  const out = execFileSync(
    "node",
    [ENGINE, "--dry-run", "--no-git", "--harness", "all", "--fixtures-dir", FIXTURES, "--now", "2026-06-19T00:00:00.000Z"],
    { encoding: "utf8" },
  );
  const data = JSON.parse(out);
  const expected = [...data.sessions]
    .sort((a, b) => b.score - a.score || String(a.sessionId).localeCompare(String(b.sessionId)))
    .map((s) => s.sessionId);
  assert.deepEqual(data.sessions.map((s) => s.sessionId), expected);
});

// --- --no-git ground-truth stub path (bonus = 0) ---------------------------

test("--no-git stubs the ground-truth bonus to 0 even when a PR URL is present", () => {
  const events = [
    { kind: "human", isHuman: true, text: "ship it", ts: "2026-01-01T00:00:00Z" },
    {
      kind: "assistant",
      stopReason: "end_turn",
      text: "Opened https://github.com/mifunedev/openharness/pull/7",
      ts: "2026-01-01T00:01:00Z",
    },
  ];
  const agg = aggregateSession(events, { sessionId: "p", harness: "claude", gitBranch: "feat/x" });
  assert.equal(agg.prUrls.length, 1);

  const stubbed = resolveGroundTruth(agg, { noGit: true });
  assert.equal(stubbed.hasBonus, false);

  // With git enabled, the same PR URL earns the bonus (no git calls needed).
  const live = resolveGroundTruth(agg, { noGit: false, commitTimes: [] });
  assert.equal(live.hasBonus, true);
});

// --- redaction (line-level + block-level key) ------------------------------

test("redact scrubs line-level tokens and a block-level PEM key body", () => {
  const pem = "-----BEGIN RSA PRIVATE KEY-----\nMIIabc123lineone\nlinetwoXYZ\n-----END RSA PRIVATE KEY-----";
  const input = [
    "key sk-ant-abc123DEF456ghi here",
    "token ghp_ABCdef123456 and github_pat_AAAA1111bbbb",
    "aws AKIAIOSFODNN7EXAMPLE creds",
    "auth Bearer abc.def.ghi-jkl",
    pem,
  ].join("\n");
  const out = redact(input);
  assert.ok(!out.includes("sk-ant-abc123DEF456ghi"), "sk-ant token scrubbed");
  assert.ok(!out.includes("ghp_ABCdef123456"), "ghp token scrubbed");
  assert.ok(!out.includes("github_pat_AAAA1111bbbb"), "github_pat scrubbed");
  assert.ok(!out.includes("AKIAIOSFODNN7EXAMPLE"), "AKIA scrubbed");
  assert.ok(!out.includes("abc.def.ghi-jkl"), "bearer scrubbed");
  assert.ok(out.includes("Bearer [REDACTED]"), "bearer label kept");
  assert.ok(!out.includes("MIIabc123lineone"), "PEM body line scrubbed");
  assert.ok(!out.includes("linetwoXYZ"), "PEM body line scrubbed");
  assert.ok(out.includes("[REDACTED]"));
});

// --- --weights validation ---------------------------------------------------

test("validateWeights rejects bad objects and accepts a complete one", () => {
  assert.throws(() => validateWeights("not-an-object"), /JSON object/);
  assert.throws(() => validateWeights({ ...DEFAULT_WEIGHTS, bogus: 1 }), /unknown key/);
  assert.throws(() => validateWeights({ ...DEFAULT_WEIGHTS, toolErrorRate: -1 }), /non-negative/);
  const partial = { ...DEFAULT_WEIGHTS };
  delete partial.turnBloat;
  assert.throws(() => validateWeights(partial), /missing required key/);
  const ok = validateWeights({ ...DEFAULT_WEIGHTS, toolErrorRate: 50 });
  assert.equal(ok.toolErrorRate, 50);
});

// --- feature extraction + session-type detection ---------------------------

test("extractFeatures captures the documented marker keys", () => {
  const f = extractFeatures("Implement `foo` in src/foo.mjs per the acceptance criteria. See #42 and https://x.test/y");
  for (const k of MARKER_FEATURE_KEYS) assert.ok(k in f, `feature ${k} present`);
  assert.equal(f.startsImperative, true);
  assert.equal(f.hasFilePath, true);
  assert.equal(f.hasInlineCode, true);
  assert.equal(f.hasAcceptanceCriteria, true);
  assert.equal(f.mentionsIssuePr, true);
  assert.equal(f.urlCount, 1);
});

test("detectSessionType classifies the first prompt", () => {
  assert.equal(detectSessionType("Heartbeat check-in."), "cron");
  assert.equal(detectSessionType("Run /retro on this session"), "retro");
  assert.equal(detectSessionType("Audit the open PRs"), "audit");
  assert.equal(detectSessionType("Implement the widget"), "impl");
  assert.equal(detectSessionType("What does the wiki say about X?"), "query");
});

// --- session merge / no_human_prompt ---------------------------------------

test("sessions with no human prompt are flagged no_human_prompt", () => {
  const agg = aggregateSession(
    [{ kind: "assistant", stopReason: "end_turn", ts: "2026-01-01T00:00:00Z" }],
    { sessionId: "z", harness: "claude" },
  );
  assert.equal(agg.noHumanPrompt, true);
  assert.equal(agg.firstHumanPrompt, null);
});

// --- integration: CLI dry-run over fixtures (+ malformed tolerance) ---------

test("CLI --dry-run --no-git over fixtures: non-zero sessions and tool errors", () => {
  const out = execFileSync(
    "node",
    [ENGINE, "--dry-run", "--no-git", "--harness", "all", "--fixtures-dir", FIXTURES, "--now", "2026-06-19T00:00:00.000Z"],
    { encoding: "utf8" },
  );
  const data = JSON.parse(out);
  assert.ok(data.manifest.sessionsScanned > 0, "scanned > 0");
  assert.ok(data.manifest.toolErrorsTotal > 0, "tool errors > 0");
  assert.equal(data.markerFeatureKeys.length, MARKER_FEATURE_KEYS.length);
});

test("CLI tolerates malformed lines without throwing", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pm-malformed-"));
  const file = path.join(tmp, "claude-sample.jsonl");
  fs.writeFileSync(
    file,
    [
      '{"type":"user","userType":"external","sessionId":"m","message":{"role":"user","content":"go build it"}}',
      "{ this is not valid json",
      '{"type":"assistant","sessionId":"m","timestamp":"2026-01-01T00:01:00Z","message":{"role":"assistant","stop_reason":"end_turn","content":[{"type":"text","text":"done"}]}}',
    ].join("\n") + "\n",
  );
  const out = execFileSync(
    "node",
    [ENGINE, "--dry-run", "--no-git", "--fixtures-dir", tmp, "--now", "2026-06-19T00:00:00.000Z"],
    { encoding: "utf8" },
  );
  const data = JSON.parse(out);
  assert.ok(data.manifest.malformedLines >= 1, "counted the malformed line");
  assert.ok(data.manifest.sessionsScanned >= 1, "still scanned the valid session");
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("CLI rejects an unknown flag with a non-zero exit", () => {
  assert.throws(() => execFileSync("node", [ENGINE, "--bogus"], { encoding: "utf8", stdio: "pipe" }));
});

// --- weakness records (WH-<NNN>): shape, determinism, privacy ---------------

// Synthetic sessions: tool_error fires in 2 of 3 (>= WEAKNESS_MIN_FREQUENCY),
// so exactly one WH-001 record is produced. Ordering is intentionally jumbled
// (sessionId z before a, harness pi before claude) to exercise the sorts.
const SYNTH_SESSIONS = [
  { sessionId: "z-sess", harness: "pi", gitBranch: "feat/z", toolErrors: 1, incomplete: 0, abandoned: 0, scoreBreakdown: { signals: { correctionDensity: 0 } } },
  { sessionId: "a-sess", harness: "claude", gitBranch: "feat/a", toolErrors: 2, incomplete: 0, abandoned: 0, scoreBreakdown: { signals: { correctionDensity: 0 } } },
  { sessionId: "m-sess", harness: "claude", gitBranch: "feat/m", toolErrors: 0, incomplete: 0, abandoned: 0, scoreBreakdown: { signals: { correctionDensity: 0 } } },
];

test("buildWeaknessRecords returns exactly the 7 metadata fields, all non-empty, no promptText", () => {
  const records = buildWeaknessRecords(SYNTH_SESSIONS);
  assert.ok(records.length >= 1, "at least one WH record");
  const rec = records[0];
  assert.deepEqual(Object.keys(rec).sort(), [
    "affected_agents",
    "frequency",
    "likely_harness_layer",
    "recommended_repair_surface",
    "summary",
    "supporting_traces",
    "weakness_id",
  ]);
  assert.match(rec.weakness_id, /^WH-\d{3}$/);
  assert.match(rec.frequency, /^\d+\/\d+$/);
  assert.ok(typeof rec.summary === "string" && rec.summary.length > 0);
  assert.ok(typeof rec.likely_harness_layer === "string" && rec.likely_harness_layer.length > 0);
  assert.ok(typeof rec.recommended_repair_surface === "string" && rec.recommended_repair_surface.length > 0);
  assert.ok(Array.isArray(rec.affected_agents) && rec.affected_agents.length > 0);
  assert.ok(Array.isArray(rec.supporting_traces) && rec.supporting_traces.length > 0);
  // Privacy: no promptText key on the record OR on any supporting trace; traces
  // are session-id metadata only.
  assert.equal("promptText" in rec, false);
  for (const t of rec.supporting_traces) {
    assert.equal("promptText" in t, false);
    assert.deepEqual(Object.keys(t).sort(), ["gitBranch", "harness", "sessionId"]);
  }
});

test("buildWeaknessRecords is byte-identical across two calls and stable under input reordering", () => {
  const a = JSON.stringify(buildWeaknessRecords(SYNTH_SESSIONS));
  const b = JSON.stringify(buildWeaknessRecords(SYNTH_SESSIONS));
  assert.equal(a, b, "two calls on the same input are byte-identical");
  // WH-001 must not flip when the same sessions arrive in a different order.
  const shuffled = [SYNTH_SESSIONS[2], SYNTH_SESSIONS[0], SYNTH_SESSIONS[1]];
  assert.equal(JSON.stringify(buildWeaknessRecords(shuffled)), a, "stable under reorder");
});

test("weakness records serialize no raw human-prompt substring from the fixtures", () => {
  const out = execFileSync(
    "node",
    [ENGINE, "--dry-run", "--no-git", "--harness", "all", "--fixtures-dir", FIXTURES, "--now", "2026-06-19T00:00:00.000Z"],
    { encoding: "utf8" },
  );
  const data = JSON.parse(out);
  assert.ok(Array.isArray(data.weaknesses) && data.weaknesses.length >= 1, ">= 1 WH record");
  const serialized = JSON.stringify(data.weaknesses);
  // Distinctive human-prompt substrings that live verbatim in the fixture .jsonl.
  const humanPromptSubstrings = [
    "Implement the foo widget",
    "Add the bar feature",
    "No, that's wrong",
    "Create the baz module",
  ];
  for (const needle of humanPromptSubstrings) {
    assert.ok(!serialized.includes(needle), `weakness records leaked prompt text: ${needle}`);
  }
  for (const w of data.weaknesses) assert.equal("promptText" in w, false);
});

// ---------------------------------------------------------------------------
// #692 — window overlap semantics and sidechain exclusion
// ---------------------------------------------------------------------------

const T = (iso) => Date.parse(iso);
const WINDOW = { start: T("2026-08-02T00:00:00Z"), end: T("2026-08-03T00:00:00Z") };

test("withinWindow admits a session that STARTED before the window but was active inside it", () => {
  // The regression this pins. Events are merged across resumed files keyed by
  // sessionId, so a long-lived session keeps its ORIGINAL firstTs. The old
  // implementation compared that single point against both bounds, so a session
  // started 30h ago and worked in continuously was invisible to --hours 24 —
  // and the daily cron runs a windowed query. Those resumed sessions are the
  // high-signal ones.
  const resumed = { firstTs: T("2026-07-24T17:48:00Z"), lastTs: T("2026-08-02T20:00:00Z") };
  assert.equal(withinWindow(resumed, WINDOW), true);
});

test("withinWindow admits a session that starts inside the window and runs past its end", () => {
  const straddlesEnd = { firstTs: T("2026-08-02T23:00:00Z"), lastTs: T("2026-08-04T01:00:00Z") };
  assert.equal(withinWindow(straddlesEnd, WINDOW), true);
});

test("withinWindow admits a session fully contained in the window", () => {
  const inside = { firstTs: T("2026-08-02T04:00:00Z"), lastTs: T("2026-08-02T06:00:00Z") };
  assert.equal(withinWindow(inside, WINDOW), true);
});

test("withinWindow still excludes sessions that do not overlap at all", () => {
  const before = { firstTs: T("2026-07-01T00:00:00Z"), lastTs: T("2026-07-02T00:00:00Z") };
  const after = { firstTs: T("2026-08-05T00:00:00Z"), lastTs: T("2026-08-06T00:00:00Z") };
  assert.equal(withinWindow(before, WINDOW), false);
  assert.equal(withinWindow(after, WINDOW), false);
});

test("withinWindow admits everything when no bounds are set", () => {
  const any = { firstTs: T("2020-01-01T00:00:00Z"), lastTs: T("2020-01-02T00:00:00Z") };
  assert.equal(withinWindow(any, {}), true);
});

test("withinWindow rejects a session with no usable timestamps", () => {
  assert.equal(withinWindow({ firstTs: null, lastTs: null }, WINDOW), false);
});

test("classifyLine flags Claude sidechain records so they can be excluded", () => {
  // Sidechain records carry the PARENT's sessionId and message.role "user", so
  // without this flag a delegate briefing is counted as a human turn and
  // corrupts correctionDensity / turnBloat / toolErrorRate for exactly the
  // delegating sessions worth mining.
  const sidechain = classifyLine(
    {
      type: "user",
      timestamp: "2026-08-02T12:00:00Z",
      sessionId: "parent-session-id",
      isSidechain: true,
      message: { role: "user", content: "You are a subagent. Do the thing." },
    },
    "claude",
  );
  assert.equal(sidechain.isSidechain, true);
  assert.equal(sidechain.sessionId, "parent-session-id");

  const real = classifyLine(
    {
      type: "user",
      timestamp: "2026-08-02T12:00:00Z",
      sessionId: "parent-session-id",
      message: { role: "user", content: "fix the thing" },
    },
    "claude",
  );
  assert.equal(real.isSidechain, false);

  // Absent/!== true must never be treated as sidechain.
  const weird = classifyLine(
    { type: "user", timestamp: "2026-08-02T12:00:00Z", sessionId: "s", isSidechain: "true", message: { role: "user", content: "x" } },
    "claude",
  );
  assert.equal(weird.isSidechain, false);
});

// --- ceiling-saturation census (manifest + markdown) -----------------------

test("computeCeilingSaturation counts the stored rounded score === 100, not scoreUncapped", () => {
  const census = computeCeilingSaturation([
    // On the ceiling: the clamp censored 112.5 down to exactly 100.
    { sessionType: "impl", score: 100, scoreUncapped: 112.5 },
    // NOT on the ceiling: 99.99 rounds to nothing else, it is simply below.
    { sessionType: "impl", score: 99.99, scoreUncapped: 99.99 },
    { sessionType: "other", score: 100, scoreUncapped: 100 },
  ]);
  assert.deepEqual(census, {
    impl: { atCeiling: 1, total: 2 },
    other: { atCeiling: 1, total: 1 },
  });
});

test("computeCeilingSaturation omits null session types and zero-session strata", () => {
  const census = computeCeilingSaturation([
    { sessionType: null, score: 100 },
    { sessionType: "cron", score: 50 },
  ]);
  assert.deepEqual(Object.keys(census), ["cron"]);
  assert.ok(!("null" in census), "no stringified null key");
  assert.equal(census.cron.atCeiling, 0);
});

// A fixture dir carrying a noHumanPrompt session (assistant lines only → the
// only way sessionType is null) next to the normal samples.
function fixturesWithNoHumanSession() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pm-census-"));
  for (const f of fs.readdirSync(FIXTURES)) {
    fs.copyFileSync(path.join(FIXTURES, f), path.join(tmp, f));
  }
  fs.writeFileSync(
    path.join(tmp, "claude-nohuman.jsonl"),
    [
      '{"type":"assistant","sessionId":"claude-nohuman","timestamp":"2026-06-18T09:00:00.000Z","message":{"role":"assistant","stop_reason":"tool_use","content":[{"type":"text","text":"resuming"}]}}',
      '{"type":"assistant","sessionId":"claude-nohuman","timestamp":"2026-06-18T09:00:01.000Z","message":{"role":"assistant","stop_reason":"end_turn","content":[{"type":"text","text":"done"}]}}',
    ].join("\n") + "\n",
  );
  return tmp;
}

test("manifest.ceilingSaturation is built from rankable only and carries no null key", () => {
  const tmp = fixturesWithNoHumanSession();
  const out = execFileSync(
    "node",
    [ENGINE, "--dry-run", "--no-git", "--harness", "all", "--fixtures-dir", tmp, "--now", "2026-06-19T00:00:00.000Z"],
    { encoding: "utf8" },
  );
  const data = JSON.parse(out);
  const census = data.manifest.ceilingSaturation;

  assert.ok(
    data.unranked.some((s) => s.noHumanPrompt && s.sessionType === null),
    "the fixture really did produce a null-type session",
  );
  assert.ok(!("null" in census), "no null key in ceilingSaturation");
  for (const key of Object.keys(census)) assert.notEqual(key, "null");

  // The census population is exactly sessions[] (rankable), not everything scanned.
  const totals = Object.values(census).reduce((n, c) => n + c.total, 0);
  assert.equal(totals, data.sessions.length);
  assert.ok(totals < data.manifest.sessionsScanned, "rankable is a strict subset here");

  // Shape: every value is { atCeiling: int, total: int } and matches sessions[].
  const expected = {};
  for (const s of data.sessions) {
    expected[s.sessionType] ??= { atCeiling: 0, total: 0 };
    expected[s.sessionType].total += 1;
    if (s.score === 100) expected[s.sessionType].atCeiling += 1;
  }
  assert.deepEqual(census, expected);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("the markdown report renders the census as flat bullets and adds no new heading", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pm-md-"));
  execFileSync(
    "node",
    [ENGINE, "--no-git", "--harness", "all", "--fixtures-dir", FIXTURES, "--out", tmp, "--now", "2026-06-19T00:00:00.000Z"],
    { encoding: "utf8" },
  );
  const mdPath = fs.readdirSync(tmp).find((f) => f.endsWith(".md"));
  const md = fs.readFileSync(path.join(tmp, mdPath), "utf8");
  const lines = md.split("\n");

  const census = lines.filter((l) => l.startsWith("- ceilingSaturation."));
  assert.ok(census.length > 0, "at least one census bullet rendered");
  for (const l of census) assert.match(l, /^- ceilingSaturation\.[a-z]+: \d+\/\d+$/);

  // The bullets live under the EXISTING ## Manifest heading.
  const manifestIdx = lines.indexOf("## Manifest");
  const nextHeadingIdx = lines.findIndex((l, i) => i > manifestIdx && l.startsWith("## "));
  const firstCensusIdx = lines.findIndex((l) => l.startsWith("- ceilingSaturation."));
  assert.ok(firstCensusIdx > manifestIdx && firstCensusIdx < nextHeadingIdx);

  // No new heading of any level was introduced by the census.
  const headings = lines.filter((l) => /^#{1,6} /.test(l));
  assert.ok(!headings.some((h) => /ceiling/i.test(h)), "no census heading added");
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("--dry-run writes no report files into an explicit --out dir", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pm-dryrun-"));
  execFileSync(
    "node",
    [ENGINE, "--dry-run", "--no-git", "--harness", "all", "--fixtures-dir", FIXTURES, "--out", tmp, "--now", "2026-06-19T00:00:00.000Z"],
    { encoding: "utf8" },
  );
  const written = fs.readdirSync(tmp).filter((f) => /^prompt-miner-.*\.(json|md)$/.test(f));
  assert.deepEqual(written, [], "dry-run wrote no report artifacts");
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("the privacy contract holds: no promptText key without --include-prompt-text", () => {
  const out = execFileSync(
    "node",
    [ENGINE, "--dry-run", "--no-git", "--harness", "all", "--fixtures-dir", FIXTURES, "--now", "2026-06-19T00:00:00.000Z"],
    { encoding: "utf8" },
  );
  assert.ok(!out.includes("promptText"), "no promptText key anywhere in the emitted JSON");
  const data = JSON.parse(out);
  for (const r of [...data.sessions, ...data.unranked]) {
    assert.ok(!("promptText" in r), `no promptText on ${r.sessionId}`);
  }
});
