#!/usr/bin/env node
// weigh engine: the harness-owned weighted-trajectory scorer. Given a cohort of
// candidate trajectories (the Workflow tool *proposes* them; this scorer *owns the
// weight function that picks among them*), normalize each sub-signal to [0,1],
// weight by a frozen, tunable DEFAULT_WEIGHTS vector, apply the hard eligibility
// floor, and select/aggregate via best-of-n | vote | softmax | synthesis.
//
// PURE: zero npm deps (node v22 built-ins only), and ZERO impurity — no `git`, no
// `Date.now()`, no model call. `--now <ts>` is REQUIRED (it stamps the report's
// generatedAt); there is no Date.now() fallback, which keeps the scorer perfectly
// deterministic for the eval probe and unit tests. See references/scoring.md for
// the contract this engine implements.

import fs from "node:fs";
import process from "node:process";

// ---------------------------------------------------------------------------
// Constants & contracts
// ---------------------------------------------------------------------------

// Deterministic-first frozen weights (sum 100). 75 of the 100 are signals WE own
// (consistency + evalPass + auditPass + cost); `judge` is the one model-side
// coefficient — set it to 0 for a fully deterministic, judge-free weight. Every
// key here is REQUIRED when --weights is supplied; values must be finite and
// non-negative. See references/scoring.md.
export const DEFAULT_WEIGHTS = Object.freeze({
  consistency: 30, // self-consistency cluster membership   ┐
  evalPass: 20, //    /eval regression floor                 │ 75 = signals WE own
  auditPass: 15, //   /audit promotability verdict           │  (deterministic)
  cost: 10, //        token-cost efficiency (cheaper→higher) ┘
  judge: 25, //       model-judge verifier — set 0 → fully deterministic weight
});

// The weight keys, in canonical order (single source for iteration + the probe).
export const WEIGHT_KEYS = Object.freeze(Object.keys(DEFAULT_WEIGHTS));

// The four selection methods this scorer supports.
export const SELECTION_METHODS = Object.freeze(["best-of-n", "vote", "softmax", "synthesis"]);

// In --soft mode, a floor-violating trajectory stays eligible but its weight is
// scaled by this factor (a down-weight, not an exclusion) so a least-bad pick is
// allowed while still ranking below any clean trajectory of comparable signals.
export const SOFT_FLOOR_FACTOR = 0.25;

// TRAJECTORY_SCHEMA — the single source of truth for the trajectory record shape.
// US-002's sampling step cites this so spawned agents emit structured output the
// scorer can consume. It is a named JSON-Schema object (draft 2020-12); the scorer
// does not runtime-validate against it (zero-dep), it is the published contract.
export const TRAJECTORY_SCHEMA = Object.freeze({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://openharness.dev/weigh/trajectory.schema.json",
  title: "Trajectory",
  description:
    "One candidate trajectory in a /weigh cohort. The Workflow tool proposes these; " +
    "score-trajectories.mjs owns the weight function that selects among them.",
  type: "object",
  required: ["id"],
  additionalProperties: false,
  properties: {
    id: { type: "string", description: "Stable unique id for this trajectory." },
    output: {
      type: ["string", "object", "array", "null"],
      description: "The candidate answer/artifact this trajectory produced.",
    },
    costTokens: {
      type: ["number", "null"],
      minimum: 0,
      description: "Total tokens this trajectory consumed (cohort-relative; cheaper scores higher).",
    },
    evalRc: {
      type: ["integer", "null"],
      enum: [0, 1, 2, null],
      description: "/eval runner rc: 0 PASS · 1 REGRESSION (hard-floor breaker) · 2 SKIPPED · null N/A.",
    },
    auditVerdict: {
      type: ["string", "null"],
      enum: ["PASS", "FAIL", null],
      description: "/audit promotability verdict: PASS · FAIL (hard-floor breaker) · null N/A.",
    },
    clusterId: {
      type: ["string", "number", "null"],
      description: "Self-consistency cluster id (semantic-equivalence grouping).",
    },
    clusterSize: {
      type: ["integer", "null"],
      minimum: 0,
      description: "Number of cohort members in this trajectory's self-consistency cluster.",
    },
    judgeScore: {
      type: ["number", "null"],
      minimum: 0,
      maximum: 1,
      description: "Optional verifier-LM score 0..1 (null when the judge is disabled → neutral 0.5).",
    },
    judgeReason: {
      type: ["string", "null"],
      description: "Optional one-line rationale from the verifier LM.",
    },
  },
});

const USAGE = `usage: score-trajectories.mjs --cohort <path> --now <ts> [options]
  --cohort <path>   JSON cohort: an array of trajectory records, or { "trajectories": [...] }
  --now <ts>        REQUIRED — unix-seconds or ISO; stamps report.generatedAt (no Date.now() fallback)
  --weights <json>  override the frozen weight vector (all keys required, finite, non-negative)
  --method <m>      best-of-n (default) | vote | softmax | synthesis
  --soft            convert the hard eligibility floor into a down-weight (allow a least-bad pick)
  --k <n>           top-K for synthesis / softmax aggregation (default 3)
  --tau <n>         softmax temperature (default 1)
  --dry-run         print the resolved config + cohort preview; do not select
  -h | --help`;

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

function round(value, dp = 4) {
  if (!Number.isFinite(value)) return value;
  const f = 10 ** dp;
  return Math.round(value * f) / f;
}

// Accept an array cohort or a { trajectories: [...] } wrapper; return the list.
function asTrajectoryList(cohort) {
  if (Array.isArray(cohort)) return cohort;
  if (isPlainObject(cohort) && Array.isArray(cohort.trajectories)) return cohort.trajectories;
  throw new Error("cohort must be an array of trajectories or { trajectories: [...] }");
}

// ---------------------------------------------------------------------------
// Weights
// ---------------------------------------------------------------------------

// validateWeights mirrors prompt-miner semantics: must be an object; every key
// present; finite non-negative; any unknown key is an error.
export function validateWeights(obj) {
  if (!isPlainObject(obj)) {
    throw new Error("--weights must be a JSON object");
  }
  for (const key of Object.keys(obj)) {
    if (!WEIGHT_KEYS.includes(key)) {
      throw new Error(`--weights: unknown key '${key}' (allowed: ${WEIGHT_KEYS.join(", ")})`);
    }
  }
  for (const key of WEIGHT_KEYS) {
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
// Cohort statistics (pure)
// ---------------------------------------------------------------------------

// cohortStats computes the cohort-relative context weight() needs: N, and the
// min/max token cost over the trajectories that declare a finite costTokens.
export function cohortStats(cohort) {
  const list = asTrajectoryList(cohort);
  const n = list.length;
  const costs = list.map((t) => t && t.costTokens).filter((c) => Number.isFinite(c));
  const minCost = costs.length ? Math.min(...costs) : 0;
  const maxCost = costs.length ? Math.max(...costs) : 0;
  return { n, minCost, maxCost };
}

// ---------------------------------------------------------------------------
// Sub-signal normalization + weight (pure)
// ---------------------------------------------------------------------------

// Returns the floor-violation cause string for a trajectory, or null if clean.
// A trajectory may break the floor two ways at once; both are reported, joined.
function floorCause(traj) {
  const causes = [];
  if (traj.evalRc === 1) causes.push("eval-regression");
  if (traj.auditVerdict === "FAIL") causes.push("audit-fail");
  return causes.length ? causes.join("+") : null;
}

// weight() scores ONE trajectory against the cohort context `ctx` (from
// cohortStats). Each sub-signal is normalized to [0,1]; the weighted sum (Σ W.k ·
// signal_k) is the raw weight. Emits a fully reconstructable weightBreakdown
// (raw signals, normalized signals, per-term contributions, weights used). The
// hard floor (evalRc===1 || auditVerdict==='FAIL') sets eligible=false; --soft
// (opts.soft) instead keeps it eligible and scales the weight by SOFT_FLOOR_FACTOR.
export function weight(traj, ctx, weights = DEFAULT_WEIGHTS, opts = {}) {
  if (!isPlainObject(traj)) throw new Error("weight(): trajectory must be an object");
  const w = weights;
  const n = ctx && Number.isFinite(ctx.n) && ctx.n > 0 ? ctx.n : 1;
  const minCost = ctx && Number.isFinite(ctx.minCost) ? ctx.minCost : 0;
  const maxCost = ctx && Number.isFinite(ctx.maxCost) ? ctx.maxCost : 0;
  const soft = opts.soft === true;

  // --- raw signals -----------------------------------------------------------
  const clusterSize = Number.isFinite(traj.clusterSize) ? traj.clusterSize : 1;
  const judgeScore = Number.isFinite(traj.judgeScore) ? traj.judgeScore : null;
  const costTokens = Number.isFinite(traj.costTokens) ? traj.costTokens : null;
  const evalRc = traj.evalRc;
  const auditVerdict = traj.auditVerdict ?? null;

  // --- normalize each sub-signal to [0,1] ------------------------------------
  // consistency: cluster membership as a fraction of the cohort.
  const consistency = clamp(clusterSize / n, 0, 1);
  // judge: verifier score, neutral 0.5 when the judge is disabled (null).
  const judge = clamp(judgeScore ?? 0.5, 0, 1);
  // evalPass: 0 PASS → 1.0 · 2|null SKIPPED/NA → 0.5 · 1 REGRESSION → 0.0.
  const evalPass = evalRc === 0 ? 1 : evalRc === 1 ? 0 : 0.5;
  // auditPass: PASS → 1.0 · null NA → 0.5 · FAIL → 0.0.
  const auditPass = auditVerdict === "PASS" ? 1 : auditVerdict === "FAIL" ? 0 : 0.5;
  // cost: cohort-relative; cheapest → 1, most expensive → 0; neutral 0.5 if absent.
  const cost =
    costTokens === null ? 0.5 : clamp(1 - (costTokens - minCost) / Math.max(maxCost - minCost, 1), 0, 1);

  const signals = { consistency, evalPass, auditPass, cost, judge };

  // --- weighted sum (per-term contributions kept full-precision) -------------
  const contributions = {};
  let rawWeight = 0;
  for (const k of WEIGHT_KEYS) {
    const c = w[k] * signals[k];
    contributions[k] = c;
    rawWeight += c;
  }

  const cause = floorCause(traj);
  const floorViolated = cause !== null;
  // Hard floor (default): eligibility excludes floor-violators. --soft: everyone
  // is eligible, but a violator's weight is scaled down (least-bad pick allowed).
  const eligible = soft ? true : !floorViolated;
  const finalWeight = soft && floorViolated ? rawWeight * SOFT_FLOOR_FACTOR : rawWeight;

  return {
    id: traj.id,
    weight: round(finalWeight),
    eligible,
    floorViolated,
    floorCause: cause,
    weightBreakdown: {
      raw: { clusterSize, n, evalRc: evalRc ?? null, auditVerdict, costTokens, minCost, maxCost, judgeScore },
      signals,
      contributions,
      weights: { ...w },
      rawWeight,
      soft,
      softFactor: soft && floorViolated ? SOFT_FLOOR_FACTOR : 1,
    },
  };
}

// ---------------------------------------------------------------------------
// Selection (pure)
// ---------------------------------------------------------------------------

// Deterministic argmax over scored rows: highest weight wins; ties broken by id
// ascending so the result is reproducible (no Math.random anywhere in the scorer).
function argmaxRow(rows) {
  return [...rows].sort((a, b) => b.weight - a.weight || String(a.id).localeCompare(String(b.id)))[0];
}

// select() scores the whole cohort with weight(), applies the eligibility floor,
// and picks/aggregates per `method`. When NOTHING is eligible it returns the
// explicit NO-SELECTION shape — never a silent least-bad pick.
//   opts: { method, weights, soft, k, tau }
export function select(cohort, opts = {}) {
  const list = asTrajectoryList(cohort);
  const weights = opts.weights || DEFAULT_WEIGHTS;
  const method = opts.method || "best-of-n";
  const soft = opts.soft === true;
  const k = Number.isInteger(opts.k) && opts.k > 0 ? opts.k : 3;
  const tau = Number.isFinite(opts.tau) && opts.tau > 0 ? opts.tau : 1;
  if (!SELECTION_METHODS.includes(method)) {
    throw new Error(`unknown --method '${method}' (allowed: ${SELECTION_METHODS.join(", ")})`);
  }

  const ctx = cohortStats(list);
  const scored = list.map((t) => weight(t, ctx, weights, { soft }));
  const floorViolations = scored
    .filter((r) => r.floorViolated)
    .map((r) => ({ id: r.id, cause: r.floorCause }));

  const eligible = scored.filter((r) => r.eligible);
  if (eligible.length === 0) {
    // Honest 3-state: no eligible trajectory → name the floor that killed them.
    return { selected: null, reason: "NO-SELECTION", method, weights: { ...weights }, soft, floorViolations, scored };
  }

  const base = { method, reason: "selected", weights: { ...weights }, soft, scored, floorViolations };

  if (method === "best-of-n") {
    return { ...base, selected: argmaxRow(eligible).id };
  }

  if (method === "vote") {
    // Largest self-consistency cluster among eligible (by member count); tie → the
    // cluster whose best member has the max weight. Selected = that best member.
    const clusters = new Map();
    for (const r of eligible) {
      const traj = list.find((t) => t.id === r.id);
      const cid = traj && traj.clusterId != null ? String(traj.clusterId) : `__singleton:${r.id}`;
      if (!clusters.has(cid)) clusters.set(cid, []);
      clusters.get(cid).push(r);
    }
    let bestClusterId = null;
    let bestRows = [];
    for (const [cid, rows] of clusters) {
      const bestMaxW = argmaxRow(rows).weight;
      const curMaxW = bestRows.length ? argmaxRow(bestRows).weight : -Infinity;
      if (
        rows.length > bestRows.length ||
        (rows.length === bestRows.length &&
          (bestMaxW > curMaxW || (bestMaxW === curMaxW && String(cid).localeCompare(String(bestClusterId)) < 0)))
      ) {
        bestClusterId = cid;
        bestRows = rows;
      }
    }
    return { ...base, selected: argmaxRow(bestRows).id, cluster: { id: bestClusterId, size: bestRows.length } };
  }

  if (method === "softmax") {
    // Deterministic softmax distribution over eligible weights (temperature tau).
    // Selection is the argmax of the distribution (no random sampling → pure).
    const maxW = Math.max(...eligible.map((r) => r.weight));
    const exps = eligible.map((r) => Math.exp((r.weight - maxW) / tau));
    const sum = exps.reduce((a, b) => a + b, 0) || 1;
    const distribution = eligible
      .map((r, i) => ({ id: r.id, p: round(exps[i] / sum, 6) }))
      .sort((a, b) => b.p - a.p || String(a.id).localeCompare(String(b.id)));
    return { ...base, selected: distribution[0].id, tau, distribution };
  }

  // synthesis: return the top-K eligible (by weight) for a synth agent to graft.
  const ranked = [...eligible].sort((a, b) => b.weight - a.weight || String(a.id).localeCompare(String(b.id)));
  const topRows = ranked.slice(0, Math.min(k, ranked.length));
  return {
    ...base,
    reason: "synthesis",
    selected: topRows.map((r) => r.id),
    topK: topRows.map((r) => ({ id: r.id, weight: r.weight })),
  };
}

// ---------------------------------------------------------------------------
// CLI parsing (pure)
// ---------------------------------------------------------------------------

export function parseArgs(argv) {
  const args = {
    cohort: null,
    weights: { ...DEFAULT_WEIGHTS },
    method: "best-of-n",
    now: null,
    soft: false,
    dryRun: false,
    k: null,
    tau: null,
  };
  const need = (i, flag) => {
    if (i + 1 >= argv.length) throw new Error(`${flag} requires a value`);
    return argv[i + 1];
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    switch (a) {
      case "--cohort":
        args.cohort = need(i, a);
        i += 1;
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
      case "--method":
        args.method = need(i, a);
        i += 1;
        if (!SELECTION_METHODS.includes(args.method)) {
          throw new Error(`bad --method: ${args.method} (allowed: ${SELECTION_METHODS.join(", ")})`);
        }
        break;
      case "--now":
        args.now = need(i, a);
        i += 1;
        break;
      case "--soft":
        args.soft = true;
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--k":
        args.k = Number(need(i, a));
        i += 1;
        if (!Number.isInteger(args.k) || args.k <= 0) throw new Error("--k must be a positive integer");
        break;
      case "--tau":
        args.tau = Number(need(i, a));
        i += 1;
        if (!Number.isFinite(args.tau) || args.tau <= 0) throw new Error("--tau must be > 0");
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

// Resolve --now (unix-seconds or ISO) into an ISO timestamp WITHOUT Date.now().
function resolveNow(now) {
  if (now == null || now === "") throw new Error("--now <ts> is required (no Date.now() fallback)");
  const ms = /^\d+$/.test(String(now)) ? Number(now) * 1000 : Date.parse(now);
  if (!Number.isFinite(ms)) throw new Error(`--now: could not parse '${now}' as unix-seconds or ISO`);
  return new Date(ms).toISOString();
}

// ---------------------------------------------------------------------------
// main (impure: reads the cohort file, writes stdout)
// ---------------------------------------------------------------------------

function main(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    process.stderr.write(`error: ${err.message}\n\n${USAGE}\n`);
    process.exit(64);
  }

  // --now is REQUIRED — there is NO Date.now() fallback (purity + determinism).
  let generatedAt;
  try {
    generatedAt = resolveNow(args.now);
  } catch (err) {
    process.stderr.write(`error: ${err.message}\n\n${USAGE}\n`);
    process.exit(1);
  }

  if (!args.cohort) {
    process.stderr.write(`error: --cohort <path> is required\n\n${USAGE}\n`);
    process.exit(1);
  }

  let cohort;
  try {
    cohort = JSON.parse(fs.readFileSync(args.cohort, "utf8"));
  } catch (err) {
    process.stderr.write(`error: could not read cohort '${args.cohort}': ${err.message}\n`);
    process.exit(1);
  }

  let list;
  try {
    list = asTrajectoryList(cohort);
  } catch (err) {
    process.stderr.write(`error: ${err.message}\n`);
    process.exit(1);
  }

  const config = {
    generatedAt,
    method: args.method,
    soft: args.soft,
    weights: args.weights,
    cohortSize: list.length,
  };

  if (args.dryRun) {
    // --dry-run: show the resolved config + cohort preview; do NOT select.
    process.stdout.write(
      `${JSON.stringify(
        { dryRun: true, ...config, trajectoryIds: list.map((t) => (t ? t.id : null)) },
        null,
        2,
      )}\n`,
    );
    return;
  }

  let result;
  try {
    result = select(list, { method: args.method, weights: args.weights, soft: args.soft, k: args.k, tau: args.tau });
  } catch (err) {
    process.stderr.write(`error: ${err.message}\n`);
    process.exit(1);
  }

  process.stdout.write(`${JSON.stringify({ ...config, ...result }, null, 2)}\n`);
}

// CLI-entrypoint detection: BASENAME match — process.argv[1] ends with
// score-trajectories.mjs. Do NOT use `import.meta.url === pathToFileURL(argv[1])`:
// node resolves the symlink for import.meta.url but not for argv[1] when this is
// invoked through the `.claude/skills` → `.mifune/skills` symlink, so the guard
// silently no-ops (see memory: prompt-miner-engine-symlink-guard-bug).
if ((process.argv[1] || "").endsWith("score-trajectories.mjs")) {
  main(process.argv.slice(2));
}
