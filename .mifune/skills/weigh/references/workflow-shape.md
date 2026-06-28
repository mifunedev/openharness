# weigh — the Workflow-tool seam

`/weigh` is deliberately split across a seam. **Sampling and model-side judging
are substrate the Workflow tool already provides** — its judge-panel /
adversarial-verify patterns *propose* candidate trajectories. **The weighting and
selection are the part the harness owns** — a pure, version-controlled scorer
(`../scripts/score-trajectories.mjs`) that *picks* among them. This file
documents that seam so the boundary is explicit: what we reuse vs. what we control.

## Which side of the seam each step lives on

| Step (see `../SKILL.md`) | Side | Owner |
|---|---|---|
| 2 — **sample** N trajectories (different angles) | Workflow-tool substrate | model (the judge-panel / fan-out pattern proposes candidates) |
| 3 — **attach signals** (clustering for `clusterSize`, optional verifier for `judgeScore`) | Workflow-tool substrate | model (semantic-equivalence judging + optional verifier LM) |
| 4 — **weight + select** | **harness-owned** | `score-trajectories.mjs` (deterministic, frozen-weights, probe-pinned) |
| 5 — aggregate (for `synthesis`) | Workflow-tool substrate | model (a synth agent grafts the top-K the scorer returned) |

The load-bearing line: **steps 2–3 (and 5) are sampling/judging the Workflow tool
already does; step 4 is the weight function — the deterministic, tunable thing we
pull OUT into version control.** The model proposes trajectories; the harness owns
the weight function that picks among them.

### Why the weight function is the part worth owning

The judge-panel pattern can *sample* N answers and even *rank* them with a model —
but that ranking is a model black box: opaque, non-reproducible, and untunable
without re-prompting. Pulling selection out into `score-trajectories.mjs` makes it:

- **Transparent** — every `selected` id is reconstructable from a `weightBreakdown`
  (raw signals → normalized signals → per-term contributions → `rawWeight`).
- **Tunable** — `DEFAULT_WEIGHTS` (`consistency:30 evalPass:20 auditPass:15 cost:10
  judge:25`, sum 100) is `Object.freeze`d and version-controlled; `judge:0` yields a
  fully deterministic weight.
- **Honest** — an all-floor-fail cohort returns `NO-SELECTION`, never a silent
  least-bad pick (same posture as `/audit` and `/benchmark`).

This mirrors `prompt-miner`'s owned, frozen-weights `mine-traces.mjs` scorer — but
scores candidate paths *prospectively* (before committing) rather than finished
sessions post-hoc.

## The runtime workflow-script SHAPE

When `/weigh` runs, Claude assembles a `sample → score → select` pipeline around
the owned scorer. The shape below is **illustrative**: it shows how the substrate
(sample/judge) wraps the owned scorer (`score → select`) and how the
`TRAJECTORY_SCHEMA` contract flows from sampling into the scorer.

> **This is the SHAPE Claude generates at runtime, NOT a committed API.** There is
> no `weigh-workflow.mjs` in this skill — only the scorer is committed code. The
> sampling/judging/aggregation are model-driven `Agent` fan-outs orchestrated by
> `SKILL.md`'s numbered procedure; the snippet only illustrates how they compose
> around the one owned, deterministic step. Do not treat it as an interface to
> import.

```js
// ── ILLUSTRATIVE SHAPE — generated at runtime, not a committed module ──────────
// meta: the run's resolved config (SKILL.md Step 1)
const meta = { task, n: 4, method: "best-of-n", weights: DEFAULT_WEIGHTS, soft: false };

// (Workflow-tool substrate) Step 2 — SAMPLE: N Agent calls in ONE message, each a
// different angle, each returning a record conforming to TRAJECTORY_SCHEMA (the
// contract exported by score-trajectories.mjs — the single source of truth):
//   { id, output, costTokens, evalRc:null, auditVerdict:null,
//     clusterId:null, clusterSize:null, judgeScore:null, judgeReason:null }
const sampled = await sampleNAgents(task, meta.n);            // model-side fan-out

// (Workflow-tool substrate) Step 3 — ATTACH SIGNALS by composing existing gates:
const cohort = sampled.map((t) => ({
  ...t,
  evalRc:       runEval(t),        // /eval rc: 0 PASS · 1 REGRESSION · 2 SKIPPED · null
  auditVerdict: runAudit(t),       // /audit: "PASS" | "FAIL" | null
  ...cluster(t, sampled),          // semantic-equivalence pass → clusterId, clusterSize
  ...maybeJudge(t),                // optional verifier LM → judgeScore 0..1 (or null)
}));

// (HARNESS-OWNED) Step 4 — WEIGHT + SELECT: the ONLY committed code in the pipeline.
// Pure, deterministic, frozen-weights; --now required (no Date.now() fallback).
import { select, DEFAULT_WEIGHTS, TRAJECTORY_SCHEMA } from "../scripts/score-trajectories.mjs";
const result = select(cohort, { method: meta.method, weights: meta.weights, soft: meta.soft });
//   → { selected: <id | [ids] | null>, reason, scored: [{ id, weight, weightBreakdown }...],
//       floorViolations: [{ id, cause }...] }

// (Workflow-tool substrate) Step 5 — AGGREGATE (synthesis only): a synth Agent
// grafts result.selected (the top-K ids) into one best answer.
```

### The `TRAJECTORY_SCHEMA` contract (the seam's interface)

The one stable contract crossing the seam is `TRAJECTORY_SCHEMA` — a named
JSON-Schema (draft 2020-12) object **exported by `score-trajectories.mjs`**. The
sampling agents (substrate) emit records against it; the scorer (owned) consumes
them. It is the single source of truth for the trajectory record shape, so the two
sides never drift:

| Field | Set by | Meaning |
|---|---|---|
| `id` (required) | Step 2 sampling | stable unique id |
| `output` | Step 2 sampling | the candidate answer/artifact |
| `costTokens` | Step 2 sampling | tokens consumed (cohort-relative; cheaper → higher `cost`) |
| `evalRc` | Step 3 `/eval` | `0`·`1`·`2`·`null` (`1` = hard-floor breaker) |
| `auditVerdict` | Step 3 `/audit` | `"PASS"`·`"FAIL"`·`null` (`"FAIL"` = hard-floor breaker) |
| `clusterId` / `clusterSize` | Step 3 clustering | self-consistency cluster → `consistency = clusterSize / N` |
| `judgeScore` / `judgeReason` | Step 3 verifier (optional) | `0..1` (or `null` → neutral `0.5`) |

To read the live contract the sampling agents target:

```bash
node -e 'import("../scripts/score-trajectories.mjs").then(m => console.log(JSON.stringify(m.TRAJECTORY_SCHEMA, null, 2)))'
```

## See Also

- `scoring.md` — the weighting formula + sub-signal table the owned step implements.
- `../scripts/score-trajectories.mjs` — the harness-owned scorer (`select`,
  `weight`, `validateWeights`, `clamp`, `DEFAULT_WEIGHTS`, `TRAJECTORY_SCHEMA`).
- `../../wiki/corpus/recursive-language-models.md` — the RLM concept (the design
  thesis that the Workflow tool supplies the sampling substrate and the harness
  owns the weight function).
