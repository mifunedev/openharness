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

// --- --no-git ground-truth stub path (bonus = 0) ---------------------------

test("--no-git stubs the ground-truth bonus to 0 even when a PR URL is present", () => {
  const events = [
    { kind: "human", isHuman: true, text: "ship it", ts: "2026-01-01T00:00:00Z" },
    {
      kind: "assistant",
      stopReason: "end_turn",
      text: "Opened https://github.com/ryaneggz/openharness/pull/7",
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
