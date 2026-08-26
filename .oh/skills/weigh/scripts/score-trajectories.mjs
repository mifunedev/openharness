#!/usr/bin/env node

import fs from "node:fs";
import process from "node:process";


export const DEFAULT_WEIGHTS = Object.freeze({
  consistency: 30,
  evalPass: 20,
  auditPass: 15,
  cost: 10,
  judge: 25,
});

export const WEIGHT_KEYS = Object.freeze(Object.keys(DEFAULT_WEIGHTS));

export const SELECTION_METHODS = Object.freeze(["best-of-n", "vote", "softmax", "synthesis"]);

export const SOFT_FLOOR_FACTOR = 0.25;

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

function asTrajectoryList(cohort) {
  if (Array.isArray(cohort)) return cohort;
  if (isPlainObject(cohort) && Array.isArray(cohort.trajectories)) return cohort.trajectories;
  throw new Error("cohort must be an array of trajectories or { trajectories: [...] }");
}


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


export function cohortStats(cohort) {
  const list = asTrajectoryList(cohort);
  const n = list.length;
  const costs = list.map((t) => t && t.costTokens).filter((c) => Number.isFinite(c));
  const minCost = costs.length ? Math.min(...costs) : 0;
  const maxCost = costs.length ? Math.max(...costs) : 0;
  return { n, minCost, maxCost };
}


function floorCause(traj) {
  const causes = [];
  if (traj.evalRc === 1) causes.push("eval-regression");
  if (traj.auditVerdict === "FAIL") causes.push("audit-fail");
  return causes.length ? causes.join("+") : null;
}

export function weight(traj, ctx, weights = DEFAULT_WEIGHTS, opts = {}) {
  if (!isPlainObject(traj)) throw new Error("weight(): trajectory must be an object");
  const w = weights;
  const n = ctx && Number.isFinite(ctx.n) && ctx.n > 0 ? ctx.n : 1;
  const minCost = ctx && Number.isFinite(ctx.minCost) ? ctx.minCost : 0;
  const maxCost = ctx && Number.isFinite(ctx.maxCost) ? ctx.maxCost : 0;
  const soft = opts.soft === true;

  const clusterSize = Number.isFinite(traj.clusterSize) ? traj.clusterSize : 1;
  const judgeScore = Number.isFinite(traj.judgeScore) ? traj.judgeScore : null;
  const costTokens = Number.isFinite(traj.costTokens) ? traj.costTokens : null;
  const evalRc = traj.evalRc;
  const auditVerdict = traj.auditVerdict ?? null;

  const consistency = clamp(clusterSize / n, 0, 1);
  const judge = clamp(judgeScore ?? 0.5, 0, 1);
  const evalPass = evalRc === 0 ? 1 : evalRc === 1 ? 0 : 0.5;
  const auditPass = auditVerdict === "PASS" ? 1 : auditVerdict === "FAIL" ? 0 : 0.5;
  const cost =
    costTokens === null ? 0.5 : clamp(1 - (costTokens - minCost) / Math.max(maxCost - minCost, 1), 0, 1);

  const signals = { consistency, evalPass, auditPass, cost, judge };

  const contributions = {};
  let rawWeight = 0;
  for (const k of WEIGHT_KEYS) {
    const c = w[k] * signals[k];
    contributions[k] = c;
    rawWeight += c;
  }

  const cause = floorCause(traj);
  const floorViolated = cause !== null;
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


function argmaxRow(rows) {
  return [...rows].sort((a, b) => b.weight - a.weight || String(a.id).localeCompare(String(b.id)))[0];
}

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
    return { selected: null, reason: "NO-SELECTION", method, weights: { ...weights }, soft, floorViolations, scored };
  }

  const base = { method, reason: "selected", weights: { ...weights }, soft, scored, floorViolations };

  if (method === "best-of-n") {
    return { ...base, selected: argmaxRow(eligible).id };
  }

  if (method === "vote") {
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
    const maxW = Math.max(...eligible.map((r) => r.weight));
    const exps = eligible.map((r) => Math.exp((r.weight - maxW) / tau));
    const sum = exps.reduce((a, b) => a + b, 0) || 1;
    const distribution = eligible
      .map((r, i) => ({ id: r.id, p: round(exps[i] / sum, 6) }))
      .sort((a, b) => b.p - a.p || String(a.id).localeCompare(String(b.id)));
    return { ...base, selected: distribution[0].id, tau, distribution };
  }

  const ranked = [...eligible].sort((a, b) => b.weight - a.weight || String(a.id).localeCompare(String(b.id)));
  const topRows = ranked.slice(0, Math.min(k, ranked.length));
  return {
    ...base,
    reason: "synthesis",
    selected: topRows.map((r) => r.id),
    topK: topRows.map((r) => ({ id: r.id, weight: r.weight })),
  };
}


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

function resolveNow(now) {
  if (now == null || now === "") throw new Error("--now <ts> is required (no Date.now() fallback)");
  const ms = /^\d+$/.test(String(now)) ? Number(now) * 1000 : Date.parse(now);
  if (!Number.isFinite(ms)) throw new Error(`--now: could not parse '${now}' as unix-seconds or ISO`);
  return new Date(ms).toISOString();
}


function main(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    process.stderr.write(`error: ${err.message}\n\n${USAGE}\n`);
    process.exit(64);
  }

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

if ((process.argv[1] || "").endsWith("score-trajectories.mjs")) {
  main(process.argv.slice(2));
}
