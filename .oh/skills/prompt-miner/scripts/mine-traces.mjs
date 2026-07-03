#!/usr/bin/env node
// prompt-miner engine: parse Claude+Pi session traces, score each session by a
// friction+ground-truth outcome proxy, extract prompt feature vectors, and emit a
// ranked, redacted report (json + md). Zero npm deps; node v22 built-ins only.
// The `git` binary is the single allowed external (ground-truth cross-ref), gated
// behind --no-git. See references/scoring.md, references/markers.md,
// references/report-schema.md for the contracts this engine implements.

import fs from "node:fs";
import readline from "node:readline";
import path from "node:path";
import os from "node:os";
import process from "node:process";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

// ---------------------------------------------------------------------------
// Constants & contracts
// ---------------------------------------------------------------------------

// Friction coefficients (the formula in references/scoring.md). Every key here is
// REQUIRED when --weights is supplied; values must be finite, non-negative numbers.
export const DEFAULT_WEIGHTS = Object.freeze({
  toolErrorRate: 35,
  correctionDensity: 30,
  abandoned: 20,
  incomplete: 10,
  turnBloat: 5,
  groundTruthBonus: 15,
});

// Turn-bloat reference point: assistantTurns beyond K saturate the penalty.
export const TURN_BLOAT_K = 40;

// Corrective-follow-up lexicon (highest-variance signal — see references/scoring.md).
export const NEGATION_LEXICON = Object.freeze([
  "no",
  "wrong",
  "revert",
  "undo",
  "actually",
  "stop",
  "don't",
  "instead",
  "not what",
  "that's not",
  "try again",
  "fix",
]);

// Hedging lexicon for the prompt feature vector.
const HEDGING_LEXICON = [
  "maybe",
  "perhaps",
  "might",
  "i think",
  "possibly",
  "probably",
  "sort of",
  "kind of",
  "not sure",
  "could",
  "i guess",
];

// Imperative verbs that mark an action-first prompt (startsImperative, impl type).
const IMPERATIVE_VERBS = new Set([
  "add",
  "build",
  "create",
  "fix",
  "implement",
  "write",
  "update",
  "remove",
  "refactor",
  "make",
  "run",
  "check",
  "review",
  "plan",
  "ship",
  "delete",
  "rename",
  "move",
  "wire",
  "scaffold",
  "generate",
  "convert",
  "port",
  "investigate",
  "extract",
  "split",
  "merge",
  "rebase",
  "audit",
  "draft",
  "design",
]);

// The feature keys the marker step correlates against outcome.
export const MARKER_FEATURE_KEYS = Object.freeze([
  "lenChars",
  "lenWords",
  "startsImperative",
  "hasFilePath",
  "hasAcceptanceCriteria",
  "hasCodeFence",
  "hasInlineCode",
  "briefingStructure",
  "referencesSkill",
  "mentionsIssuePr",
  "questionCount",
  "urlCount",
  "hedgingCount",
]);

export const SCORE_MODEL =
  "100 - 35*toolErrorRate - 30*correctionDensity - 20*abandoned - 10*incomplete - 5*turnBloat (+15 ground-truth, capped 100)";

const PR_URL_RE = /github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+/i;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

export function clamp(value, lo, hi) {
  if (!Number.isFinite(value)) return lo;
  return Math.min(hi, Math.max(lo, value));
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// Concatenate Claude/Pi content blocks into a single plain-text string.
function blocksToText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts = [];
  for (const block of content) {
    if (typeof block === "string") {
      parts.push(block);
    } else if (isPlainObject(block) && typeof block.text === "string") {
      parts.push(block.text);
    }
  }
  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Weights
// ---------------------------------------------------------------------------

export function validateWeights(obj) {
  if (!isPlainObject(obj)) {
    throw new Error("--weights must be a JSON object");
  }
  const required = Object.keys(DEFAULT_WEIGHTS);
  for (const key of Object.keys(obj)) {
    if (!required.includes(key)) {
      throw new Error(`--weights: unknown key '${key}' (allowed: ${required.join(", ")})`);
    }
  }
  for (const key of required) {
    if (!(key in obj)) {
      throw new Error(`--weights: missing required key '${key}'`);
    }
    const v = obj[key];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) {
      throw new Error(`--weights: '${key}' must be a non-negative finite number`);
    }
  }
  return { ...obj };
}

// ---------------------------------------------------------------------------
// Line classification (pure, per single JSONL line)
// ---------------------------------------------------------------------------

// classifyLine normalizes ONE parsed JSONL object into a common event shape:
//   { kind, ts, isError, stopReason, usage, text, isHuman, sessionId, gitBranch }
// kind ∈ "human" | "assistant" | "tool_result" | "meta" | "other".
// Session identity for Pi is resolved at the file layer (Pi message lines carry
// none), so sessionId/gitBranch may be null here for Pi.
export function classifyLine(line, harness) {
  const base = {
    kind: "other",
    ts: null,
    isError: false,
    stopReason: null,
    usage: null,
    text: "",
    isHuman: false,
    sessionId: null,
    gitBranch: null,
  };
  if (!isPlainObject(line)) return base;

  if (harness === "claude") {
    base.ts = typeof line.timestamp === "string" ? line.timestamp : null;
    base.sessionId = typeof line.sessionId === "string" ? line.sessionId : null;
    base.gitBranch = typeof line.gitBranch === "string" ? line.gitBranch : null;
    const msg = isPlainObject(line.message) ? line.message : null;

    if (line.type === "assistant" && msg) {
      base.kind = "assistant";
      base.stopReason = typeof msg.stop_reason === "string" ? msg.stop_reason : null;
      base.usage = isPlainObject(msg.usage) ? msg.usage : null;
      base.text = blocksToText(msg.content);
      return base;
    }

    if (line.type === "user" && msg) {
      const content = msg.content;
      if (typeof content === "string") {
        // Real typed human prompt vs. meta/command wrappers.
        const isExternal = line.userType === "external";
        const notMeta = line.isMeta !== true;
        const roleUser = msg.role === "user";
        const notWrapper = !content.startsWith("<");
        const notSdk = !("promptSource" in line) || line.promptSource !== "sdk";
        if (isExternal && notMeta && roleUser && notWrapper && notSdk) {
          base.kind = "human";
          base.isHuman = true;
          base.text = content;
        } else {
          base.kind = "meta";
          base.text = content;
        }
        return base;
      }
      if (Array.isArray(content)) {
        // Array-valued user content = tool results, NOT a prompt. Errors are NESTED.
        base.kind = "tool_result";
        base.isError = content.some(
          (b) => isPlainObject(b) && b.type === "tool_result" && b.is_error === true,
        );
        return base;
      }
      base.kind = "meta";
      return base;
    }

    return base; // last-prompt, attachment, pr-link, ai-title, mode, etc.
  }

  if (harness === "pi") {
    base.ts = typeof line.timestamp === "string" ? line.timestamp : null;
    if (line.type === "session") {
      // Carry session id so the file layer can resolve it.
      base.kind = "other";
      base.sessionId = typeof line.id === "string" ? line.id : null;
      base.gitBranch = typeof line.cwd === "string" ? null : null; // Pi has no branch
      return base;
    }
    if (line.type !== "message" || !isPlainObject(line.message)) return base;
    const msg = line.message;
    const role = msg.role;

    if (role === "user") {
      base.kind = "human";
      base.isHuman = true;
      base.text = blocksToText(msg.content);
      return base;
    }
    if (role === "assistant") {
      base.kind = "assistant";
      base.stopReason = typeof msg.stopReason === "string" ? msg.stopReason : null;
      base.usage = isPlainObject(msg.usage) ? msg.usage : null;
      base.text = blocksToText(msg.content);
      return base;
    }
    if (role === "toolResult") {
      base.kind = "tool_result";
      // Real Pi traces put the flag at message.isError; the documented schema also
      // allows message.toolResult.isError — accept either.
      const nested = isPlainObject(msg.toolResult) ? msg.toolResult.isError === true : false;
      base.isError = nested || msg.isError === true;
      return base;
    }
    return base;
  }

  return base;
}

// ---------------------------------------------------------------------------
// Session aggregation (pure, over a merged list of normalized events)
// ---------------------------------------------------------------------------

function matchesLexicon(text, lexicon) {
  const lower = text.toLowerCase();
  for (const term of lexicon) {
    if (term.includes(" ") || /[^a-z]/.test(term)) {
      if (lower.includes(term)) return true;
    } else {
      const re = new RegExp(`\\b${term}\\b`, "i");
      if (re.test(lower)) return true;
    }
  }
  return false;
}

// aggregateSession folds normalized events (already merged across resumed files for
// one sessionId) into the per-session counts scoring needs.
export function aggregateSession(events, meta = {}) {
  const humanPrompts = [];
  let assistantTurns = 0;
  let toolResults = 0;
  let toolErrors = 0;
  let lastAssistantStop = null;
  const prUrls = [];
  let firstTs = null;
  let lastTs = null;
  let gitBranch = meta.gitBranch || null;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (const ev of events) {
    if (ev.ts) {
      if (firstTs === null || ev.ts < firstTs) firstTs = ev.ts;
      if (lastTs === null || ev.ts > lastTs) lastTs = ev.ts;
    }
    if (ev.gitBranch && !gitBranch) gitBranch = ev.gitBranch;
    if (ev.kind === "human" && ev.isHuman) {
      humanPrompts.push(ev.text || "");
    } else if (ev.kind === "assistant") {
      assistantTurns += 1;
      lastAssistantStop = ev.stopReason;
      if (ev.text && PR_URL_RE.test(ev.text)) {
        const m = ev.text.match(PR_URL_RE);
        if (m) prUrls.push(m[0]);
      }
      if (isPlainObject(ev.usage)) {
        const inTok = ev.usage.input_tokens ?? ev.usage.input ?? 0;
        const outTok = ev.usage.output_tokens ?? ev.usage.output ?? 0;
        if (Number.isFinite(inTok)) totalInputTokens += inTok;
        if (Number.isFinite(outTok)) totalOutputTokens += outTok;
      }
    } else if (ev.kind === "tool_result") {
      toolResults += 1;
      if (ev.isError) toolErrors += 1;
    }
  }

  const humanCount = humanPrompts.length;
  const followups = humanPrompts.slice(1);
  const corrective = followups.filter((t) => matchesLexicon(t, NEGATION_LEXICON)).length;
  const correctionDensity = humanCount > 0 ? corrective / humanCount : 0;
  const toolErrorRate = toolResults > 0 ? toolErrors / toolResults : 0;

  const clean = lastAssistantStop === "end_turn" || lastAssistantStop === "stop";
  const abandoned = lastAssistantStop === "aborted" ? 1 : 0;
  // No clean final assistant turn (and not explicitly aborted) ⇒ incomplete.
  const incomplete = !clean && !abandoned ? 1 : 0;
  const turnBloat = clamp((assistantTurns - TURN_BLOAT_K) / TURN_BLOAT_K, 0, 1);

  return {
    sessionId: meta.sessionId || null,
    harness: meta.harness || null,
    gitBranch,
    firstTs,
    lastTs,
    humanPromptCount: humanCount,
    assistantTurns,
    turns: humanCount + assistantTurns,
    toolResults,
    toolErrors,
    toolErrorRate: clamp(toolErrorRate, 0, 1),
    correctiveFollowups: corrective,
    correctionDensity: clamp(correctionDensity, 0, 1),
    abandoned,
    incomplete,
    lastAssistantStop,
    turnBloat,
    prUrls,
    totalInputTokens,
    totalOutputTokens,
    noHumanPrompt: humanCount === 0,
    firstHumanPrompt: humanCount > 0 ? humanPrompts[0] : null,
    humanPrompts,
  };
}

// ---------------------------------------------------------------------------
// Scoring (pure: ground-truth resolution is injected)
// ---------------------------------------------------------------------------

// scoreSession applies the friction formula. groundTruth = { hasBonus, reason }.
export function scoreSession(agg, weights = DEFAULT_WEIGHTS, groundTruth = { hasBonus: false }) {
  const w = weights;
  const penalties = {
    toolErrorRate: w.toolErrorRate * agg.toolErrorRate,
    correctionDensity: w.correctionDensity * agg.correctionDensity,
    abandoned: w.abandoned * agg.abandoned,
    incomplete: w.incomplete * agg.incomplete,
    turnBloat: w.turnBloat * agg.turnBloat,
  };
  const base =
    100 -
    penalties.toolErrorRate -
    penalties.correctionDensity -
    penalties.abandoned -
    penalties.incomplete -
    penalties.turnBloat;
  const bonus = groundTruth.hasBonus ? w.groundTruthBonus : 0;
  const score = clamp(base + bonus, 0, 100);

  return {
    score: Number(score.toFixed(2)),
    scoreBreakdown: {
      base: Number(base.toFixed(2)),
      groundTruthBonus: bonus,
      groundTruthReason: groundTruth.reason || (bonus > 0 ? "ground-truth" : "none"),
      signals: {
        toolErrorRate: Number(agg.toolErrorRate.toFixed(4)),
        correctionDensity: Number(agg.correctionDensity.toFixed(4)),
        abandoned: agg.abandoned,
        incomplete: agg.incomplete,
        turnBloat: Number(agg.turnBloat.toFixed(4)),
      },
      penalties: {
        toolErrorRate: Number(penalties.toolErrorRate.toFixed(2)),
        correctionDensity: Number(penalties.correctionDensity.toFixed(2)),
        abandoned: Number(penalties.abandoned.toFixed(2)),
        incomplete: Number(penalties.incomplete.toFixed(2)),
        turnBloat: Number(penalties.turnBloat.toFixed(2)),
      },
      weights: { ...w },
    },
  };
}

// ---------------------------------------------------------------------------
// Prompt feature extraction & session-type detection (pure)
// ---------------------------------------------------------------------------

function countMatches(text, re) {
  const m = text.match(re);
  return m ? m.length : 0;
}

export function extractFeatures(text) {
  const t = typeof text === "string" ? text : "";
  const words = t.split(/\s+/).filter(Boolean);
  const firstWord = (words[0] || "").toLowerCase().replace(/[^a-z']/g, "");
  let hedgingCount = 0;
  const lower = t.toLowerCase();
  for (const h of HEDGING_LEXICON) {
    hedgingCount += countMatches(lower, new RegExp(h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"));
  }
  return {
    lenChars: t.length,
    lenWords: words.length,
    startsImperative: IMPERATIVE_VERBS.has(firstWord),
    hasFilePath: /(^|\s|`)[\w./-]*\/[\w./-]+|\b[\w-]+\.(mjs|cjs|js|ts|tsx|jsx|md|json|sh|bash|zsh|py|ya?ml|toml|txt|html|css)\b/.test(
      t,
    ),
    hasAcceptanceCriteria: /acceptance criteria|\bAC-?\d|- \[[ x]\]|\bmust\b.*\bnot\b/i.test(t),
    hasCodeFence: /```/.test(t),
    hasInlineCode: /`[^`\n]+`/.test(t),
    briefingStructure:
      countMatches(t, /\*\*[^*\n]+\*\*\s*:?/g) >= 2 ||
      /\*\*(goal|constraints|acceptance criteria|start here|out of scope)\*\*/i.test(t),
    referencesSkill: /(^|\s)\/[a-z][a-z0-9-]{2,}/.test(t),
    mentionsIssuePr: /#\d+|github\.com\/[\w.-]+\/[\w.-]+\/(issues|pull)\/\d+/i.test(t),
    questionCount: countMatches(t, /\?/g),
    urlCount: countMatches(t, /https?:\/\//g),
    hedgingCount,
  };
}

export function detectSessionType(text) {
  const t = typeof text === "string" ? text : "";
  if (!t.trim()) return "other";
  const lower = t.toLowerCase();
  if (/heartbeat|\bcron\b|scheduled run|autopilot/.test(lower)) return "cron";
  if (/\bretro\b|retrospect/.test(lower)) return "retro";
  if (/\baudit\b|\bcritique\b|\breview\b|pr-audit/.test(lower)) return "audit";
  const firstWord = (lower.split(/\s+/).filter(Boolean)[0] || "").replace(/[^a-z']/g, "");
  if (IMPERATIVE_VERBS.has(firstWord)) return "impl";
  if (/\?\s*$/.test(t.trim()) || /^(what|how|why|where|when|who|which|explain|show me|is |are |does |can )/.test(lower)) {
    return "query";
  }
  return "other";
}

// ---------------------------------------------------------------------------
// Weakness records (pure) — cluster repeated harness-level failure signals into
// metadata-only WH-<NNN> records. A weakness record NEVER carries prompt text in
// ANY mode (not even --include-prompt-text); supporting_traces holds session-id
// metadata only. See references/report-schema.md and rfc-selfimprove-roadmap.md
// items 4 + 6 (the likely_harness_layer / recommended_repair_surface vocab).
// ---------------------------------------------------------------------------

// A single occurrence is not a pattern: a signal must recur in at least this many
// sessions before it earns a weakness record.
export const WEAKNESS_MIN_FREQUENCY = 2;

// Fixed failure-signal taxonomy. Declaration order is the deterministic tiebreak
// when two clusters share a frequency, so WH-001 never flips across identical
// runs. `likely_harness_layer` and `recommended_repair_surface` use the exact
// RFC item 4 + 6 enum terms (harness layer: artifact contract | audit gate |
// handoff | terminal status; repair surface: skill rule | probe | verifier).
const WEAKNESS_SIGNALS = Object.freeze([
  {
    key: "tool_error",
    match: (s) => Number(s?.toolErrors) > 0,
    summary: "Recurring tool-call errors surfaced during execution",
    likely_harness_layer: "terminal status",
    recommended_repair_surface: "verifier",
  },
  {
    key: "correction_churn",
    match: (s) => Number(s?.scoreBreakdown?.signals?.correctionDensity) > 0,
    summary: "Repeated user corrections point to an unclear task handoff",
    likely_harness_layer: "handoff",
    recommended_repair_surface: "skill rule",
  },
  {
    key: "abandoned",
    match: (s) => Number(s?.abandoned) > 0,
    summary: "Sessions abandoned before a clean terminal status",
    likely_harness_layer: "terminal status",
    recommended_repair_surface: "probe",
  },
  {
    key: "incomplete",
    match: (s) => Number(s?.incomplete) > 0,
    summary: "Sessions ended without a clean terminal status",
    likely_harness_layer: "terminal status",
    recommended_repair_surface: "probe",
  },
]);

// buildWeaknessRecords clusters sessions by the fixed failure-signal taxonomy and
// emits one metadata-only WH-<NNN> record per signal met by >= minFrequency
// sessions. Pure + deterministic: clusters sort by frequency desc then taxonomy
// order, so WH-001 is stable across byte-identical inputs.
export function buildWeaknessRecords(sessions, opts = {}) {
  const list = Array.isArray(sessions) ? sessions : [];
  const total = list.length;
  const minFrequency = Number.isInteger(opts.minFrequency)
    ? opts.minFrequency
    : WEAKNESS_MIN_FREQUENCY;

  const clusters = [];
  for (let order = 0; order < WEAKNESS_SIGNALS.length; order += 1) {
    const signal = WEAKNESS_SIGNALS[order];
    const matched = list.filter((s) => signal.match(s));
    if (matched.length < minFrequency) continue;

    // affected agents: distinct harness values, sorted (deterministic).
    const affected_agents = [...new Set(matched.map((s) => s?.harness).filter(Boolean))].sort();

    // supporting traces: session-id METADATA ONLY — never prompt text, in any mode.
    const supporting_traces = matched
      .map((s) => ({
        sessionId: s?.sessionId ?? null,
        harness: s?.harness ?? null,
        gitBranch: s?.gitBranch ?? null,
      }))
      .sort((a, b) => String(a.sessionId).localeCompare(String(b.sessionId)));

    clusters.push({
      order,
      count: matched.length,
      summary: signal.summary,
      frequency: `${matched.length}/${total}`,
      affected_agents,
      likely_harness_layer: signal.likely_harness_layer,
      supporting_traces,
      recommended_repair_surface: signal.recommended_repair_surface,
    });
  }

  // Deterministic ordering: frequency desc, then taxonomy declaration order asc.
  clusters.sort((a, b) => b.count - a.count || a.order - b.order);

  return clusters.map((c, i) => ({
    weakness_id: `WH-${String(i + 1).padStart(3, "0")}`,
    summary: c.summary,
    frequency: c.frequency,
    affected_agents: c.affected_agents,
    likely_harness_layer: c.likely_harness_layer,
    supporting_traces: c.supporting_traces,
    recommended_repair_surface: c.recommended_repair_surface,
  }));
}

// ---------------------------------------------------------------------------
// Redaction (pure)
// ---------------------------------------------------------------------------

export function redact(text) {
  if (typeof text !== "string") return text;
  let out = text;
  // Block-level first: PEM key bodies (multiline) then long base64/hex runs.
  out = out.replace(/-----BEGIN [A-Z0-9 ]*KEY-----[\s\S]*?-----END [A-Z0-9 ]*KEY-----/g, "[REDACTED]");
  // Line-level token shapes (run before the generic >=40 run so they read cleanly).
  out = out.replace(/sk-ant-[A-Za-z0-9_-]+/g, "[REDACTED]");
  out = out.replace(/sk-[A-Za-z0-9_-]+/g, "[REDACTED]");
  out = out.replace(/github_pat_[A-Za-z0-9_]+/g, "[REDACTED]");
  out = out.replace(/\bgh[opsu]_[A-Za-z0-9]+/g, "[REDACTED]");
  out = out.replace(/\bAKIA[0-9A-Z]{12,}/g, "[REDACTED]");
  out = out.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer [REDACTED]");
  // Generic high-entropy runs (≥40 base64/hex chars) last.
  out = out.replace(/[A-Za-z0-9+/=]{40,}/g, "[REDACTED]");
  return out;
}

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

const USAGE = `usage: mine-traces.mjs [options]
  --harness all|claude|pi   (default all)
  --since YYYY-MM-DD         window start (UTC)
  --until YYYY-MM-DD         window end (UTC, inclusive)
  --hours N                  sub-day window (takes precedence over --since)
  --last-n N                 keep only the N most-recent sessions
  --min-turns N             (default 2) minimum turns to rank a session
  --top N                   (default 15) top/bottom N in the markdown report
  --attribution first|all   (default first) which human prompt to attribute
  --include-prompt-text     emit redacted prompt text (default off)
  --no-git                  stub the ground-truth bonus to 0
  --weights <json>          override friction weights (all keys required)
  --out <dir>               output dir (default .oh/memory/<UTC-date>/)
  --report-only             write the report only (no MEMORY/IDENTITY mutation)
  --dry-run                 print to stdout; write nothing
  --max-file-mb N          (default 50) skip files larger than this
  --fixtures-dir <dir>      read *.jsonl fixtures from <dir> instead of real traces
  --now <iso>               inject generatedAt timestamp (determinism for tests)
  -h | --help`;

export function parseArgs(argv) {
  const args = {
    harness: "all",
    since: null,
    until: null,
    hours: null,
    lastN: null,
    minTurns: 2,
    top: 15,
    attribution: "first",
    includePromptText: false,
    noGit: false,
    weights: { ...DEFAULT_WEIGHTS },
    out: null,
    reportOnly: false,
    dryRun: false,
    maxFileMb: 50,
    fixturesDir: process.env.PROMPT_MINER_FIXTURES_DIR || null,
    now: process.env.PROMPT_MINER_NOW || null,
  };
  const need = (i, flag) => {
    if (i + 1 >= argv.length) throw new Error(`${flag} requires a value`);
    return argv[i + 1];
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    switch (a) {
      case "--harness":
        args.harness = need(i, a);
        i += 1;
        if (!["all", "claude", "pi"].includes(args.harness)) throw new Error(`bad --harness: ${args.harness}`);
        break;
      case "--since":
        args.since = need(i, a);
        i += 1;
        break;
      case "--until":
        args.until = need(i, a);
        i += 1;
        break;
      case "--hours":
        args.hours = Number(need(i, a));
        i += 1;
        if (!Number.isFinite(args.hours) || args.hours <= 0) throw new Error("--hours must be > 0");
        break;
      case "--last-n":
        args.lastN = Number(need(i, a));
        i += 1;
        if (!Number.isInteger(args.lastN) || args.lastN <= 0) throw new Error("--last-n must be a positive integer");
        break;
      case "--min-turns":
        args.minTurns = Number(need(i, a));
        i += 1;
        if (!Number.isInteger(args.minTurns) || args.minTurns < 0) throw new Error("--min-turns must be >= 0");
        break;
      case "--top":
        args.top = Number(need(i, a));
        i += 1;
        if (!Number.isInteger(args.top) || args.top <= 0) throw new Error("--top must be a positive integer");
        break;
      case "--attribution":
        args.attribution = need(i, a);
        i += 1;
        if (!["first", "all"].includes(args.attribution)) throw new Error(`bad --attribution: ${args.attribution}`);
        break;
      case "--include-prompt-text":
        args.includePromptText = true;
        break;
      case "--no-git":
        args.noGit = true;
        break;
      case "--weights": {
        const raw = need(i, a);
        i += 1;
        let parsed;
        try {
          parsed = JSON.parse(raw);
        } catch (err) {
          throw new Error(`--weights is not valid JSON: ${err.message}`);
        }
        args.weights = validateWeights(parsed);
        break;
      }
      case "--out":
        args.out = need(i, a);
        i += 1;
        break;
      case "--report-only":
        args.reportOnly = true;
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--max-file-mb":
        args.maxFileMb = Number(need(i, a));
        i += 1;
        if (!Number.isFinite(args.maxFileMb) || args.maxFileMb <= 0) throw new Error("--max-file-mb must be > 0");
        break;
      case "--fixtures-dir":
        args.fixturesDir = need(i, a);
        i += 1;
        break;
      case "--now":
        args.now = need(i, a);
        i += 1;
        break;
      case "-h":
      case "--help":
        process.stdout.write(`${USAGE}\n`);
        process.exit(0);
        break;
      default:
        throw new Error(`unknown flag: ${a}`);
    }
  }
  return args;
}

// ---------------------------------------------------------------------------
// File enumeration & windowing (impure)
// ---------------------------------------------------------------------------

function expandHome(p) {
  if (p.startsWith("~")) return path.join(os.homedir(), p.slice(1));
  return p;
}

function resolveWindow(args, nowIso) {
  let start = null;
  let end = null;
  if (args.hours != null) {
    const now = new Date(nowIso).getTime();
    start = new Date(now - args.hours * 3600 * 1000).toISOString();
    end = nowIso;
    return { start, end };
  }
  if (args.since) start = `${args.since}T00:00:00.000Z`;
  if (args.until) end = `${args.until}T23:59:59.999Z`;
  return { start, end };
}

function listFiles(dir, predicate) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...listFiles(full, predicate));
    } else if (e.isFile() && predicate(e.name)) {
      out.push(full);
    }
  }
  return out;
}

// Returns [{file, harness}]. Fixtures override real traces when --fixtures-dir set.
function enumerateFiles(args) {
  if (args.fixturesDir) {
    const dir = expandHome(args.fixturesDir);
    const files = listFiles(dir, (n) => n.endsWith(".jsonl"));
    return files.map((file) => {
      const base = path.basename(file).toLowerCase();
      const harness = base.includes("pi") ? "pi" : "claude";
      return { file, harness };
    });
  }
  const result = [];
  if (args.harness === "all" || args.harness === "claude") {
    const cdir = path.join(os.homedir(), ".claude", "projects", "-home-sandbox-harness");
    for (const f of listFiles(cdir, (n) => n.endsWith(".jsonl"))) result.push({ file: f, harness: "claude" });
  }
  if (args.harness === "all" || args.harness === "pi") {
    const piRoot = expandHome(process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), ".pi", "agent"));
    const pdir = path.join(piRoot, "sessions");
    for (const f of listFiles(pdir, (n) => n.endsWith(".jsonl"))) result.push({ file: f, harness: "pi" });
  }
  return result;
}

// Pi filename: <ts>_<uuid>.jsonl → uuid segment is the session id fallback.
function piSessionIdFromFile(file) {
  const base = path.basename(file).replace(/\.jsonl$/, "");
  const idx = base.indexOf("_");
  return idx >= 0 ? base.slice(idx + 1) : base;
}

// ---------------------------------------------------------------------------
// Ground-truth (git)
// ---------------------------------------------------------------------------

// Fetch origin/development once and return a list of commit unix-timestamps.
function loadGitCommitTimes() {
  try {
    execFileSync("git", ["fetch", "origin", "development", "--depth=200"], {
      stdio: "ignore",
      timeout: 60000,
    });
  } catch {
    // best-effort fetch; fall through to whatever ref exists locally
  }
  try {
    const out = execFileSync("git", ["log", "--format=%ct", "origin/development", "-n", "200"], {
      encoding: "utf8",
      timeout: 30000,
    });
    return out
      .split("\n")
      .map((s) => Number(s.trim()) * 1000)
      .filter((n) => Number.isFinite(n) && n > 0);
  } catch {
    return [];
  }
}

export function resolveGroundTruth(agg, { noGit, commitTimes = [] }) {
  if (noGit) return { hasBonus: false, reason: "git-stubbed (--no-git)" };
  if (agg.prUrls.length > 0) return { hasBonus: true, reason: `pr-url:${agg.prUrls[0]}` };
  if (agg.gitBranch && agg.firstTs && agg.lastTs && commitTimes.length > 0) {
    const start = new Date(agg.firstTs).getTime();
    const end = new Date(agg.lastTs).getTime();
    const hit = commitTimes.some((t) => t >= start && t <= end);
    if (hit) return { hasBonus: true, reason: "commit-in-window" };
  }
  return { hasBonus: false, reason: "none" };
}

// ---------------------------------------------------------------------------
// Pipeline (impure): read → aggregate → score → feature → rank → report
// ---------------------------------------------------------------------------

async function readFileEvents(file, harness, store, counters) {
  // Pi: resolve one sessionId per file (from a `session` line or filename).
  let piSessionId = harness === "pi" ? piSessionIdFromFile(file) : null;

  const events = [];
  const stream = fs.createReadStream(file, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const raw of rl) {
    const ln = raw.trim();
    if (!ln) continue;
    let parsed;
    try {
      parsed = JSON.parse(ln);
    } catch {
      counters.malformedLines += 1;
      continue;
    }
    const ev = classifyLine(parsed, harness);
    if (harness === "pi" && parsed && parsed.type === "session" && ev.sessionId) {
      piSessionId = ev.sessionId;
    }
    if (ev.kind === "other" && !ev.sessionId) continue;
    events.push(ev);
  }

  // Group into the store, keyed by sessionId (merge resumed sessions across files).
  if (harness === "claude") {
    for (const ev of events) {
      const sid = ev.sessionId;
      if (!sid) continue;
      const key = `claude:${sid}`;
      if (!store.has(key)) store.set(key, { harness, sessionId: sid, gitBranch: ev.gitBranch, events: [] });
      const bucket = store.get(key);
      if (ev.gitBranch && !bucket.gitBranch) bucket.gitBranch = ev.gitBranch;
      bucket.events.push(ev);
    }
  } else {
    const key = `pi:${piSessionId}`;
    if (!store.has(key)) store.set(key, { harness, sessionId: piSessionId, gitBranch: null, events: [] });
    store.get(key).events.push(...events);
  }
}

function withinWindow(agg, window) {
  if (!window.start && !window.end) return true;
  const ref = agg.firstTs || agg.lastTs;
  if (!ref) return false;
  if (window.start && ref < window.start) return false;
  if (window.end && ref > window.end) return false;
  return true;
}

async function run(args) {
  const generatedAt = args.now ? new Date(args.now).toISOString() : new Date().toISOString();
  const utcDate = generatedAt.slice(0, 10);
  const window = resolveWindow(args, generatedAt);
  const counters = { malformedLines: 0, skippedFiles: 0 };
  const store = new Map();

  const files = enumerateFiles(args);
  for (const { file, harness } of files) {
    let size = 0;
    try {
      size = fs.statSync(file).size;
    } catch {
      continue;
    }
    if (size > args.maxFileMb * 1024 * 1024) {
      counters.skippedFiles += 1;
      continue;
    }
    await readFileEvents(file, harness, store, counters);
  }

  // Aggregate + score every session.
  const commitTimes = args.noGit ? [] : loadGitCommitTimes();
  let sessions = [];
  for (const bucket of store.values()) {
    const agg = aggregateSession(bucket.events, {
      sessionId: bucket.sessionId,
      harness: bucket.harness,
      gitBranch: bucket.gitBranch,
    });
    const gt = resolveGroundTruth(agg, { noGit: args.noGit, commitTimes });
    const scored = scoreSession(agg, args.weights, gt);
    const attributedText =
      args.attribution === "all" ? agg.humanPrompts.join("\n\n") : agg.firstHumanPrompt;
    const features = agg.noHumanPrompt ? null : extractFeatures(attributedText);
    const sessionType = agg.noHumanPrompt ? null : detectSessionType(agg.firstHumanPrompt);
    const record = {
      sessionId: agg.sessionId,
      harness: agg.harness,
      gitBranch: agg.gitBranch,
      window: { firstTs: agg.firstTs, lastTs: agg.lastTs },
      turns: agg.turns,
      humanPromptCount: agg.humanPromptCount,
      assistantTurns: agg.assistantTurns,
      toolResults: agg.toolResults,
      toolErrors: agg.toolErrors,
      lastAssistantStop: agg.lastAssistantStop,
      abandoned: agg.abandoned,
      incomplete: agg.incomplete,
      noHumanPrompt: agg.noHumanPrompt,
      sessionType,
      score: scored.score,
      scoreBreakdown: scored.scoreBreakdown,
      groundTruth: gt,
      features,
      totalInputTokens: agg.totalInputTokens,
      totalOutputTokens: agg.totalOutputTokens,
    };
    if (args.includePromptText && !agg.noHumanPrompt) {
      record.promptText = redact(attributedText);
    }
    sessions.push(record);
  }

  // Window filter, then last-n (most-recent firstTs), then ranking.
  sessions = sessions.filter((s) => withinWindow({ firstTs: s.window.firstTs, lastTs: s.window.lastTs }, window));
  const sessionsScanned = sessions.length;
  const toolErrorsTotal = sessions.reduce((sum, s) => sum + s.toolErrors, 0);
  const toolResultsTotal = sessions.reduce((sum, s) => sum + s.toolResults, 0);
  sessions.sort((a, b) => String(b.window.firstTs).localeCompare(String(a.window.firstTs)));
  if (args.lastN != null) sessions = sessions.slice(0, args.lastN);

  const rankable = sessions.filter((s) => !s.noHumanPrompt && s.turns >= args.minTurns);
  rankable.sort((a, b) => b.score - a.score || String(a.sessionId).localeCompare(String(b.sessionId)));

  // Weakness records cluster harness-level failure signals across ALL in-window
  // sessions (ranked + unranked) — metadata only, never prompt text.
  const weaknesses = buildWeaknessRecords(sessions);

  const manifest = {
    generatedAt,
    harnessFilter: args.harness,
    window,
    sessionsScanned,
    sessionsRanked: rankable.length,
    toolErrorsTotal,
    toolResultsTotal,
    malformedLines: counters.malformedLines,
    skippedFiles: counters.skippedFiles,
    weights: args.weights,
    scoreModel: SCORE_MODEL,
    includePromptText: args.includePromptText,
    reportOnly: args.reportOnly,
    minTurns: args.minTurns,
    attribution: args.attribution,
  };

  const dataset = {
    manifest,
    markerFeatureKeys: MARKER_FEATURE_KEYS,
    sessions: rankable,
    unranked: sessions.filter((s) => s.noHumanPrompt || s.turns < args.minTurns),
    weaknesses,
  };

  return { dataset, manifest, rankable, utcDate };
}

// ---------------------------------------------------------------------------
// Report rendering
// ---------------------------------------------------------------------------

function renderMarkdown(dataset, top) {
  const { manifest, sessions, weaknesses = [] } = dataset;
  const lines = [];
  lines.push(`# prompt-miner report — ${manifest.generatedAt.slice(0, 10)}`);
  lines.push("");
  lines.push("## Manifest");
  lines.push("");
  lines.push(`- generatedAt: ${manifest.generatedAt}`);
  lines.push(`- harnessFilter: ${manifest.harnessFilter}`);
  lines.push(`- window: ${manifest.window.start || "(open)"} → ${manifest.window.end || "(open)"}`);
  lines.push(`- sessionsScanned: ${manifest.sessionsScanned}`);
  lines.push(`- sessionsRanked: ${manifest.sessionsRanked}`);
  lines.push(`- malformedLines: ${manifest.malformedLines}`);
  lines.push(`- skippedFiles: ${manifest.skippedFiles}`);
  lines.push(`- scoreModel: ${manifest.scoreModel}`);
  lines.push("");
  const fmtRow = (s) =>
    `| ${s.score.toFixed(1)} | ${s.harness} | ${s.sessionType || "-"} | ${s.turns} | ${s.toolErrors}/${s.toolResults} | ${s.groundTruth.hasBonus ? "yes" : "no"} | ${(s.sessionId || "").slice(0, 8)} |`;
  const header = "| score | harness | type | turns | toolErr | gt | session |";
  const sep = "|---|---|---|---|---|---|---|";
  lines.push(`## Top ${Math.min(top, sessions.length)} sessions`);
  lines.push("");
  lines.push(header);
  lines.push(sep);
  for (const s of sessions.slice(0, top)) lines.push(fmtRow(s));
  lines.push("");
  lines.push(`## Bottom ${Math.min(top, sessions.length)} sessions`);
  lines.push("");
  lines.push(header);
  lines.push(sep);
  for (const s of sessions.slice(-top).reverse()) lines.push(fmtRow(s));
  lines.push("");
  // Weakness records: metadata-only WH-<NNN> clusters. No prompt text is
  // rendered — only the fixed taxonomy summary + session-id counts.
  lines.push("## Weakness records");
  lines.push("");
  if (!weaknesses.length) {
    lines.push("_None — no failure signal recurred across enough sessions._");
    lines.push("");
  } else {
    lines.push("| id | frequency | affected agents | likely harness layer | recommended repair surface | summary |");
    lines.push("|---|---|---|---|---|---|");
    for (const w of weaknesses) {
      lines.push(
        `| ${w.weakness_id} | ${w.frequency} | ${w.affected_agents.join(", ")} | ${w.likely_harness_layer} | ${w.recommended_repair_surface} | ${w.summary} |`,
      );
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function writeReports(outDir, utcDate, dataset, top) {
  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, `prompt-miner-${utcDate}.json`);
  const mdPath = path.join(outDir, `prompt-miner-${utcDate}.md`);
  fs.writeFileSync(jsonPath, `${JSON.stringify(dataset, null, 2)}\n`);
  fs.writeFileSync(mdPath, renderMarkdown(dataset, top));
  return { jsonPath, mdPath };
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`error: ${err.message}\n\n${USAGE}\n`);
    process.exit(64);
  }

  if (args.includePromptText) {
    process.stderr.write("WARNING: prompt text may contain secrets (redaction applied, but verify before sharing)\n");
  }

  let result;
  try {
    result = await run(args);
  } catch (err) {
    process.stderr.write(`error: ${err.message}\n`);
    process.exit(1);
  }

  const { dataset, manifest, utcDate } = result;

  if (args.dryRun) {
    process.stdout.write(`${JSON.stringify(dataset, null, 2)}\n`);
    process.stderr.write(
      `dry-run: scanned=${manifest.sessionsScanned} ranked=${manifest.sessionsRanked} malformed=${manifest.malformedLines} skipped=${manifest.skippedFiles}\n`,
    );
    return;
  }

  const outDir = args.out || path.join(process.env.MEMORY_DIR || ".oh/memory", utcDate);
  const { jsonPath, mdPath } = writeReports(outDir, utcDate, dataset, args.top);
  process.stdout.write(
    `wrote ${jsonPath}\nwrote ${mdPath}\nscanned=${manifest.sessionsScanned} ranked=${manifest.sessionsRanked} malformed=${manifest.malformedLines} skipped=${manifest.skippedFiles}\n`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main();
}
