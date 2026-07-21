# weigh — Scoring Contract

The deterministic-first weighting model `score-trajectories.mjs` implements. The
Workflow tool *proposes* candidate trajectories (its judge-panel / adversarial-verify
sampling); this scorer **owns the weight function that picks among them**. It is the
part of RLM-style weighted-trajectory selection the harness controls — a transparent,
version-controlled, tunable weight rather than a model black box.

**Purity:** zero npm deps (node v22 built-ins only) and ZERO impurity — no `git`, no
`Date.now()`, no model call. `--now <ts>` is **required** (it stamps `report.generatedAt`);
there is **no `Date.now()` fallback**, so the scorer is perfectly deterministic for the
eval probe and unit tests.

## Formula

```
weight_i   = Σ_k  W.k · signal_k,i               (k ∈ consistency, evalPass, auditPass, cost, judge)
eligible_i = !(evalRc_i === 1 || auditVerdict_i === "FAIL")     // HARD floor (default)
```

Each `signal_k,i` is normalized to `[0,1]`; with the default weights (sum 100) a
trajectory's `weight` is on a 0–100 scale. Every row carries a `weightBreakdown`
recording the raw signals, the normalized `signals`, the per-term `contributions`
(`contributions[k] === weights[k] * signals[k]`), the `weights` used, and `rawWeight`
(`Σ contributions`) — so **every number is reconstructable** (mirrors prompt-miner's
`scoreBreakdown`).

### Sub-signal definitions (each normalized to [0,1])

| Signal | Weight | Normalization | Notes |
|--------|:--:|---|---|
| `consistency` | 30 | `clusterSize / N` | Self-consistency cluster membership as a fraction of the cohort (N = cohort size). Missing `clusterSize` → singleton (1). **Highest-variance signal** — clustering is a *model* step; the scorer only consumes `clusterSize`. Set `consistency: 0` for open-ended outputs where clustering is unreliable. |
| `evalPass` | 20 | `{0→1.0, 2|null→0.5, 1→0.0}` | `/eval` runner rc: 0 PASS, 1 REGRESSION, 2 SKIPPED, null N/A. A regression (1) is the hard-floor breaker. |
| `auditPass` | 15 | `{PASS→1.0, null→0.5, FAIL→0.0}` | `/audit implementation <slug>` promotability verdict. A FAIL is the hard-floor breaker. |
| `cost` | 10 | `1 − (cost − minCost)/max(maxCost−minCost, 1)` | Cohort-relative token cost; cheapest → 1, most expensive → 0. Missing `costTokens` → neutral 0.5. The `max(…, 1)` guard makes all-equal-cost cohorts score 1. |
| `judge` | 25 | `judgeScore ?? 0.5` | Optional verifier-LM score 0..1; **neutral 0.5 when the judge is disabled** (null). The one model-side coefficient — see *judge:0 determinism* below. |

The trajectory record shape is the exported **`TRAJECTORY_SCHEMA`** (a named JSON-Schema
draft-2020-12 object) — the single source of truth US-002's sampling step cites so spawned
agents emit structured output this scorer can consume: `id`, `output`, `costTokens`,
`evalRc`, `auditVerdict`, `clusterId`, `clusterSize`, `judgeScore`, `judgeReason`.

## The frozen, deterministic-first weights

```js
export const DEFAULT_WEIGHTS = Object.freeze({
  consistency: 30,   // ┐
  evalPass:    20,   // │ 75 = signals WE own (deterministic)
  auditPass:   15,   // │
  cost:        10,   // ┘
  judge:       25,   // model-judge — set 0 → fully deterministic weight
});
```

75 of the 100 points are **signals we own** (self-consistency, `/eval` rc, `/audit implementation`
verdict, cost); the remaining 25 is the one model-judge coefficient. The vector is
`Object.freeze`d and version-controlled so tuning goes through review (as `/benchmark`);
`.oh/evals/probes/weigh-scorer-contract.sh` pins the frozen keys + the 100-sum.

## Weights validation (`validateWeights`)

`--weights '<json>'` overrides the coefficients. Validation rules (copied from
prompt-miner): the value must be a JSON object; **every** required key must be present
(`consistency`, `evalPass`, `auditPass`, `cost`, `judge`); each value must be a finite,
non-negative number; any unknown key is an error. Pass it as a single shell token so the
JSON is not word-split.

## Hard floor + `--soft` semantics

By default the floor is **hard**: any trajectory with `evalRc === 1` (eval regression) or
`auditVerdict === "FAIL"` (audit fail) is marked `eligible: false` and is **never
selected**, regardless of how high its other signals score. Its `floorCause` records the
reason(s), joined when both fire (`"eval-regression+audit-fail"`).

`--soft` converts the hard floor into a **down-weight**: a floor-violator stays
`eligible: true` but its weight is scaled by `SOFT_FLOOR_FACTOR` (0.25), so a *least-bad*
pick is allowed while still ranking below any clean trajectory of comparable signals. Use
`--soft` only when you must return *something* and a clean candidate may not exist.

### NO-SELECTION (honest 3-state)

When **no** trajectory is eligible (hard floor, all violated), `select()` returns the
explicit shape — never a silent least-bad pick:

```json
{ "selected": null, "reason": "NO-SELECTION",
  "floorViolations": [{ "id": "…", "cause": "eval-regression" }, …] }
```

Same posture as `/audit implementation` and `/benchmark`: name the floor that killed the cohort rather
than promote a failure.

## Selection methods

| `--method` | Rule |
|---|---|
| `best-of-n` (default) | `argmax weight` over eligible (ties → id ascending, deterministic). |
| `vote` | Largest self-consistency cluster among eligible (by member count; tie → the cluster whose best member has the max weight). Selected = that best member. |
| `softmax` | Deterministic softmax distribution over eligible weights (temperature `--tau`, default 1); `selected` = the distribution argmax. No random sampling → pure. |
| `synthesis` | Return the top-`--k` eligible ids (default 3) for a synthesis agent to graft. `selected` is an array. |

## judge:0 determinism note

Setting `judge: 0` (via `--weights`) zeroes every `judge` contribution, yielding a
**fully deterministic, judge-free weight** driven only by signals we own. In this mode a
trajectory's `judgeScore` cannot move the selection at all — the result is byte-identical
across runs and independent of any verifier LM. This is the recommended posture when the
verifier is unavailable, untrusted, or you want a reproducible audit trail.

## The judge:0-vs-judge:25 selection signal (tuning)

Judge-coefficient calibration is **out of scope** for the initial ship — the tunable
`judge` weight is delivered, but choosing a project-specific value is a later, data-driven
exercise. The signal an operator watches when tuning: **run the same cohort at `judge: 0`
and at `judge: 25` and compare the selected id(s).**

- If the selection is **stable** across `judge: 0` and `judge: 25`, the deterministic
  signals already dominate — the judge is decorative and can be safely lowered (toward a
  cheaper, more reproducible weight).
- If the selection **flips**, the model judge is the swing vote — inspect *which* trajectory
  it elevated and whether that matches ground truth (`/eval` + `/audit implementation <slug>` on the picked path)
  before trusting a high `judge` weight. A judge that routinely overrides a green-eval,
  PASS-audit, high-consistency candidate is a Goodhart risk, not a signal.

Tune the `judge` coefficient toward the smallest value at which selections stop changing
for the *right* reasons — never higher than the deterministic floor it is meant to break ties on.

## Why `.mjs`, not `jq`

The task is a cohort-relative weighted scoring with min/max normalization, an eligibility
floor, a reconstructable per-term breakdown, and four selection strategies (argmax / cluster
vote / softmax / top-K). Expressing that in `jq` would be unreadable and untestable; a
zero-dependency Node engine with `node --test` unit coverage is the maintainable choice —
and unlike prompt-miner's `mine-traces.mjs` (which shells out to `git`), this scorer has
**no external dependency at all**, so it is perfectly deterministic.

## See Also

- `workflow-shape.md` (US-002) — how `/weigh` composes the Workflow tool's sampling
  substrate around this owned weight function.
- `../scripts/score-trajectories.mjs` — the engine this contract documents.
- `../../prompt-miner/references/scoring.md` — the post-hoc session scorer this
  prospective trajectory scorer is modeled on.
