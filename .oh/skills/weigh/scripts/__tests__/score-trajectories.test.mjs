// node --test suite for the weigh scorer. Pure node:test + node:assert — no
// vitest/tsx. Run: node --test .oh/skills/weigh/scripts/__tests__/
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

import {
  validateWeights,
  weight,
  select,
  clamp,
  cohortStats,
  DEFAULT_WEIGHTS,
  WEIGHT_KEYS,
  SELECTION_METHODS,
  SOFT_FLOOR_FACTOR,
  TRAJECTORY_SCHEMA,
} from "../score-trajectories.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCORER = path.join(HERE, "..", "score-trajectories.mjs");
const FIXTURE = path.join(HERE, "fixtures", "cohort-sample.json");

// A reusable cohort matching the fixture (so unit tests don't read the file).
const COHORT = [
  { id: "t-alpha", costTokens: 1200, evalRc: 0, auditVerdict: "PASS", clusterId: "c1", clusterSize: 3, judgeScore: 0.9 },
  { id: "t-bravo", costTokens: 2400, evalRc: 0, auditVerdict: null, clusterId: "c1", clusterSize: 3, judgeScore: 0.7 },
  { id: "t-charlie", costTokens: 800, evalRc: 2, auditVerdict: "PASS", clusterId: "c2", clusterSize: 1, judgeScore: 0.5 },
  { id: "t-delta", costTokens: 1500, evalRc: 1, auditVerdict: "FAIL", clusterId: "c3", clusterSize: 1, judgeScore: 0.3 },
];

// --- frozen contract --------------------------------------------------------

test("DEFAULT_WEIGHTS is frozen, has the exact keys, and sums to 100", () => {
  assert.ok(Object.isFrozen(DEFAULT_WEIGHTS));
  assert.deepEqual(WEIGHT_KEYS, ["consistency", "evalPass", "auditPass", "cost", "judge"]);
  const sum = WEIGHT_KEYS.reduce((s, k) => s + DEFAULT_WEIGHTS[k], 0);
  assert.equal(sum, 100);
});

test("TRAJECTORY_SCHEMA is a named JSON-Schema describing the trajectory record", () => {
  assert.equal(TRAJECTORY_SCHEMA.type, "object");
  for (const k of [
    "id",
    "output",
    "costTokens",
    "evalRc",
    "auditVerdict",
    "clusterId",
    "clusterSize",
    "judgeScore",
    "judgeReason",
  ]) {
    assert.ok(k in TRAJECTORY_SCHEMA.properties, `schema describes ${k}`);
  }
  assert.deepEqual(TRAJECTORY_SCHEMA.required, ["id"]);
});

// --- weight() normalization + breakdown reconstructability ------------------

test("weight() normalizes each sub-signal to [0,1]", () => {
  const ctx = cohortStats(COHORT);
  const alpha = weight(COHORT[0], ctx);
  const s = alpha.weightBreakdown.signals;
  for (const k of WEIGHT_KEYS) {
    assert.ok(s[k] >= 0 && s[k] <= 1, `signal ${k} in [0,1]`);
  }
  // consistency = clusterSize/N = 3/4; evalPass(0)=1; auditPass(PASS)=1; judge=0.9
  assert.equal(s.consistency, 0.75);
  assert.equal(s.evalPass, 1);
  assert.equal(s.auditPass, 1);
  assert.equal(s.judge, 0.9);
  // cost cohort-relative: alpha=1200, min=800, max=2400 → 1-(400/1600)=0.75
  assert.equal(s.cost, 0.75);
});

test("weightBreakdown is fully reconstructable (contributions = weight*signal, sum = rawWeight)", () => {
  const ctx = cohortStats(COHORT);
  const r = weight(COHORT[0], ctx);
  const bd = r.weightBreakdown;
  let sum = 0;
  for (const k of WEIGHT_KEYS) {
    assert.equal(bd.contributions[k], bd.weights[k] * bd.signals[k], `contribution ${k} reconstructs`);
    sum += bd.contributions[k];
  }
  assert.ok(Math.abs(sum - bd.rawWeight) < 1e-9, "contributions sum to rawWeight");
  // alpha hand-computed: 30*.75 + 20*1 + 15*1 + 10*.75 + 25*.9 = 87.5
  assert.equal(r.weight, 87.5);
});

test("evalPass/auditPass/judge default mappings (null/skipped → neutral)", () => {
  const ctx = { n: 1, minCost: 0, maxCost: 0 };
  assert.equal(weight({ id: "a", evalRc: 0 }, ctx).weightBreakdown.signals.evalPass, 1);
  assert.equal(weight({ id: "b", evalRc: 1 }, ctx).weightBreakdown.signals.evalPass, 0);
  assert.equal(weight({ id: "c", evalRc: 2 }, ctx).weightBreakdown.signals.evalPass, 0.5);
  assert.equal(weight({ id: "d", evalRc: null }, ctx).weightBreakdown.signals.evalPass, 0.5);
  assert.equal(weight({ id: "e", auditVerdict: "PASS" }, ctx).weightBreakdown.signals.auditPass, 1);
  assert.equal(weight({ id: "f", auditVerdict: "FAIL" }, ctx).weightBreakdown.signals.auditPass, 0);
  assert.equal(weight({ id: "g", auditVerdict: null }, ctx).weightBreakdown.signals.auditPass, 0.5);
  // judge disabled (null) → neutral 0.5
  assert.equal(weight({ id: "h", judgeScore: null }, ctx).weightBreakdown.signals.judge, 0.5);
});

// --- the hard eligibility floor ---------------------------------------------

test("hard floor: evalRc===1 || auditVerdict==='FAIL' marks a trajectory ineligible", () => {
  const ctx = cohortStats(COHORT);
  const delta = weight(COHORT[3], ctx); // evalRc:1 AND FAIL
  assert.equal(delta.eligible, false);
  assert.equal(delta.floorViolated, true);
  assert.equal(delta.floorCause, "eval-regression+audit-fail");

  const evalOnly = weight({ id: "x", evalRc: 1, auditVerdict: "PASS" }, ctx);
  assert.equal(evalOnly.eligible, false);
  assert.equal(evalOnly.floorCause, "eval-regression");

  const auditOnly = weight({ id: "y", evalRc: 0, auditVerdict: "FAIL" }, ctx);
  assert.equal(auditOnly.eligible, false);
  assert.equal(auditOnly.floorCause, "audit-fail");
});

test("--soft converts the hard floor into a down-weight (eligible, scaled weight)", () => {
  const ctx = cohortStats(COHORT);
  const hard = weight(COHORT[3], ctx, DEFAULT_WEIGHTS, { soft: false });
  const soft = weight(COHORT[3], ctx, DEFAULT_WEIGHTS, { soft: true });
  assert.equal(hard.eligible, false);
  assert.equal(soft.eligible, true);
  assert.equal(soft.weightBreakdown.softFactor, SOFT_FLOOR_FACTOR);
  // soft.weight is the raw weight scaled by SOFT_FLOOR_FACTOR (within display rounding)
  assert.ok(soft.weight < hard.weightBreakdown.rawWeight, "soft weight is down-weighted");
  assert.ok(Math.abs(soft.weight - hard.weightBreakdown.rawWeight * SOFT_FLOOR_FACTOR) < 1e-3);
});

// --- selection methods ------------------------------------------------------

test("select best-of-n (default) picks the argmax eligible — never the floor-breaker", () => {
  const r = select(COHORT);
  assert.equal(r.method, "best-of-n");
  assert.equal(r.selected, "t-alpha");
  assert.notEqual(r.selected, "t-delta");
  assert.deepEqual(
    r.floorViolations,
    [{ id: "t-delta", cause: "eval-regression+audit-fail" }],
  );
});

test("select vote picks the largest self-consistency cluster's best member", () => {
  const r = select(COHORT, { method: "vote" });
  // c1 (alpha+bravo) is the largest eligible cluster; best member = alpha.
  assert.equal(r.selected, "t-alpha");
  assert.equal(r.cluster.size, 2);
  assert.notEqual(r.selected, "t-delta");
});

test("select softmax returns a normalized distribution and an argmax selection", () => {
  const r = select(COHORT, { method: "softmax" });
  assert.equal(r.selected, "t-alpha");
  const total = r.distribution.reduce((s, d) => s + d.p, 0);
  assert.ok(Math.abs(total - 1) < 1e-6, "softmax distribution sums to ~1");
  // the floor-breaker is excluded from the distribution
  assert.ok(!r.distribution.some((d) => d.id === "t-delta"));
});

test("select synthesis returns the top-K eligible ids", () => {
  const r = select(COHORT, { method: "synthesis", k: 2 });
  assert.equal(r.reason, "synthesis");
  assert.deepEqual(r.selected, ["t-alpha", "t-bravo"]);
  assert.ok(!r.selected.includes("t-delta"));
});

test("select rejects an unknown method", () => {
  assert.throws(() => select(COHORT, { method: "bogus" }), /unknown --method/);
});

// --- NO-SELECTION shape (all-floor-fail cohort) -----------------------------

test("select returns the explicit NO-SELECTION shape when nothing is eligible", () => {
  const allFail = [
    { id: "f1", evalRc: 1, auditVerdict: "PASS", clusterSize: 1, judgeScore: 0.9 },
    { id: "f2", evalRc: 0, auditVerdict: "FAIL", clusterSize: 1, judgeScore: 0.8 },
    { id: "f3", evalRc: 1, auditVerdict: "FAIL", clusterSize: 1, judgeScore: 0.7 },
  ];
  const r = select(allFail);
  assert.equal(r.selected, null);
  assert.equal(r.reason, "NO-SELECTION");
  assert.deepEqual(r.floorViolations, [
    { id: "f1", cause: "eval-regression" },
    { id: "f2", cause: "audit-fail" },
    { id: "f3", cause: "eval-regression+audit-fail" },
  ]);
});

// --- judge:0 full determinism ----------------------------------------------

test("judge:0 yields a fully deterministic, judge-free weight (identical across runs)", () => {
  const w0 = { ...DEFAULT_WEIGHTS, judge: 0 };
  const a = select(COHORT, { weights: w0 });
  const b = select(COHORT, { weights: w0 });
  assert.equal(a.selected, b.selected);
  assert.equal(a.selected, "t-alpha");
  // every judge contribution is exactly 0 → the judge signal cannot move the pick
  for (const row of a.scored) {
    assert.equal(row.weightBreakdown.contributions.judge, 0);
  }
  // a wildly different judgeScore on the same deterministic signals changes nothing
  const tampered = COHORT.map((t) => ({ ...t, judgeScore: 0 }));
  const c = select(tampered, { weights: w0 });
  assert.equal(c.selected, "t-alpha");
});

// --- validateWeights() rejections -------------------------------------------

test("validateWeights rejects non-object/missing/negative/non-finite/unknown-key", () => {
  assert.throws(() => validateWeights("not-an-object"), /JSON object/);
  assert.throws(() => validateWeights(null), /JSON object/);
  assert.throws(() => validateWeights([1, 2]), /JSON object/);
  assert.throws(() => validateWeights({ ...DEFAULT_WEIGHTS, bogus: 1 }), /unknown key/);
  assert.throws(() => validateWeights({ ...DEFAULT_WEIGHTS, consistency: -1 }), /non-negative/);
  assert.throws(() => validateWeights({ ...DEFAULT_WEIGHTS, judge: Infinity }), /non-negative/);
  assert.throws(() => validateWeights({ ...DEFAULT_WEIGHTS, cost: "x" }), /non-negative/);
  const partial = { ...DEFAULT_WEIGHTS };
  delete partial.judge;
  assert.throws(() => validateWeights(partial), /missing required key/);
  const ok = validateWeights({ ...DEFAULT_WEIGHTS, judge: 0 });
  assert.equal(ok.judge, 0);
});

test("clamp coerces non-finite to lo and bounds the range", () => {
  assert.equal(clamp(5, 0, 1), 1);
  assert.equal(clamp(-5, 0, 1), 0);
  assert.equal(clamp(NaN, 0, 1), 0);
  assert.equal(clamp(0.4, 0, 1), 0.4);
});

// --- CLI: absent --now throws + exits 1 -------------------------------------

test("CLI throws and exits non-zero when --now is absent (no Date.now() fallback)", () => {
  assert.throws(
    () => execFileSync("node", [SCORER, "--cohort", FIXTURE], { encoding: "utf8", stdio: "pipe" }),
    /required/i,
  );
});

test("CLI --cohort --now over the fixture selects t-alpha and never the evalRc:1 breaker", () => {
  const out = execFileSync("node", [SCORER, "--cohort", FIXTURE, "--now", "1750000000"], { encoding: "utf8" });
  const data = JSON.parse(out);
  assert.equal(data.selected, "t-alpha");
  assert.notEqual(data.selected, "t-delta");
  assert.equal(data.method, "best-of-n");
  assert.ok(data.generatedAt.startsWith("2025-"), "generatedAt is derived from --now, not Date.now()");
});

test("CLI --dry-run prints the resolved config + cohort ids without selecting", () => {
  const out = execFileSync("node", [SCORER, "--cohort", FIXTURE, "--now", "1750000000", "--dry-run"], {
    encoding: "utf8",
  });
  const data = JSON.parse(out);
  assert.equal(data.dryRun, true);
  assert.equal(data.cohortSize, 4);
  assert.equal(data.selected, undefined, "dry-run does not select");
  assert.ok(data.trajectoryIds.includes("t-delta"));
});

test("the four documented method names are all recognized", () => {
  assert.deepEqual(SELECTION_METHODS, ["best-of-n", "vote", "softmax", "synthesis"]);
});
