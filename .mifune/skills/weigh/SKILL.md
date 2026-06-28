---
name: weigh
argument-hint: "<task | --cohort <path>> [--n N] [--method best-of-n|vote|softmax|synthesis] [--weights <json>] [--soft] [--dry-run]"
disable-model-invocation: true
allowed-tools: Read, Grep, Bash, Agent
description: |
  Weighted-trajectory selection: sample N candidate trajectories for one task,
  attach deterministic signals to each, then weight + select among them with a
  pure, version-controlled scorer we own (score-trajectories.mjs) rather than a
  model black box. The Workflow tool's judge-panel / adversarial-verify patterns
  PROPOSE the trajectories; this skill owns the weight function that PICKS among
  them (frozen DEFAULT_WEIGHTS: consistency:30 evalPass:20 auditPass:15 cost:10
  judge:25, sum 100; judge:0 → fully deterministic). disable-model-invocation
  because the sampling step spawns N agents and burns tokens — manual-invoke only.
  TRIGGER when: /weigh invoked, or asked to "sample N approaches and pick the
  best", "weigh these trajectories", "best-of-n this task", "score candidate
  outputs", "self-consistency vote over samples", "ensemble these answers".
---

# weigh — weighted-trajectory selection

Run `sample → attach signals → weight → select` over one task. The model side
*proposes* candidate trajectories (this is the Workflow tool's substrate — its
judge-panel / adversarial-verify sampling); the **harness owns the weight
function that picks among them**: `scripts/score-trajectories.mjs`, a pure,
zero-dep, frozen-weights scorer. See `references/workflow-shape.md` for the seam
and `references/scoring.md` for the weighting contract.

**Core principle: the model proposes, the scorer disposes.** Selection is a
deterministic, version-controlled, reconstructable weighted sum — not a vibe.

> `disable-model-invocation: true` suppresses **auto**-invocation only — the model
> never fires `/weigh` on its own (it spawns N agents and burns tokens). A
> user-typed `/weigh` runs the full procedure below, including the Step-2 sampling
> fan-out. `allowed-tools` includes **`Agent`** because Step 2 spawns the N
> sampling agents — without it the sampling step cannot run.

## Result tag

Announce exactly one human result tag at the end of the run:

```
RESULT: SELECTED | NO-SELECTION | DRY-RUN
```

| Tag | Meaning |
|-----|---------|
| `SELECTED` | The scorer ran and returned a `selected` id (or top-K for `synthesis`). |
| `NO-SELECTION` | Every trajectory broke the hard floor — the scorer returned `{ selected: null, reason: "NO-SELECTION", floorViolations }`. Report the floor that killed them; do not promote a failure. |
| `DRY-RUN` | `--dry-run` was passed: the sampling plan was printed and the run stopped after Step 1. |

## Steps

### Step 1 — Resolve config (and `--dry-run` gate)

Parse `$ARGUMENTS`:

| Setting | Default | Notes |
|---|---|---|
| task / `--cohort <path>` | (required) | A task string to sample for, OR a pre-assembled cohort JSON to score directly (skip Steps 2–3). |
| `--n N` | **4** | Number of trajectories to sample. **Hard cap 8** (mirrors `/delegate` wave discipline + the cost risk). Clamp `N` into `[1, 8]`. |
| `--method` | `best-of-n` | One of `best-of-n` (argmax), `vote` (largest self-consistency cluster), `softmax`, `synthesis` (top-K). |
| `--weights <json>` | frozen `DEFAULT_WEIGHTS` | Passed through to the scorer verbatim (single shell token); the scorer's `validateWeights()` rejects bad vectors. `--weights '{"consistency":30,"evalPass":20,"auditPass":15,"cost":10,"judge":0}'` → a fully deterministic, judge-free weight. |
| `--soft` | off | Convert the hard eligibility floor into a down-weight (least-bad pick allowed). |
| `--dry-run` | off | Print the sampling plan (N, angles, method, weights) and **stop here** — spawn no agents. Announce `RESULT: DRY-RUN`, run Step 6's log, stop. |

If a `--cohort <path>` is supplied, the cohort is already assembled — skip Steps
2–3 and go straight to Step 4.

### Step 2 — Sample N trajectories (the Workflow-tool substrate)

Launch **N `Agent` tool calls in ONE message** (parallel), each attacking the
task from a **different angle** (e.g. minimal-diff, defensive/edge-case-first,
refactor-toward-simplicity, performance-first) so the cohort spans the solution
space rather than re-deriving one path N times. Each worker returns **structured
output conforming to `TRAJECTORY_SCHEMA`** — the named JSON-Schema object exported
by `scripts/score-trajectories.mjs` (the single source of truth for the
trajectory record shape). At minimum each trajectory emits:

- `id` (required, stable + unique), `output` (the candidate answer/artifact),
  `costTokens` (tokens consumed).

The signal fields (`evalRc`, `auditVerdict`, `clusterId`, `clusterSize`,
`judgeScore`, `judgeReason`) are attached in Step 3 — workers leave them `null`.

Cite the schema source to the workers so their output is machine-consumable:

```bash
# the published contract the sampling agents target:
node -e 'import("'"${CLAUDE_SKILL_DIR}"'/scripts/score-trajectories.mjs").then(m => process.stdout.write(JSON.stringify(m.TRAJECTORY_SCHEMA, null, 2)))'
```

> `--dry-run` already returned in Step 1; if it reaches here it was not set.

### Step 3 — Attach signals (compose `/eval` + `/audit` by reference)

For each sampled trajectory, attach the deterministic signals the scorer weights —
**compose the existing gates, do not re-derive them**:

- **`evalRc`** — run the trajectory's change through `/eval` (the regression
  floor); record the runner rc (`0` PASS · `1` REGRESSION · `2` SKIPPED · `null`
  N/A). `evalRc === 1` is a hard-floor breaker.
- **`auditVerdict`** — run `/audit` (per-unit promotability) for trajectories that
  touch code; record `"PASS"` · `"FAIL"` · `null`. `"FAIL"` is a hard-floor breaker.
- **`clusterId` / `clusterSize`** — one **clustering pass**: group the N outputs
  by semantic equivalence (a model step) and stamp each with its cluster id and
  the cluster's member count. `consistency` (the 30-weight signal) is
  `clusterSize / N`.
- **`judgeScore` / `judgeReason`** — *optional* verifier LM scoring each output
  `0..1`. Leave `null` to disable the judge (the scorer treats `null` as a neutral
  `0.5`); set `judge: 0` in `--weights` to remove its influence entirely.

Write the assembled cohort (array of `TRAJECTORY_SCHEMA` records, or a
`{ "trajectories": [...] }` wrapper) to a gitignored working file, e.g.
`memory/<UTC-date>/weigh-<slug>-<HHMMSS>.cohort.json`.

### Step 4 — Weight + select (the harness-owned step)

Run the owned scorer over the assembled cohort. **`--now` is required** (the
scorer has no `Date.now()` fallback — purity); supply it from the shell so the
scorer itself stays pure:

```bash
node "${CLAUDE_SKILL_DIR}/scripts/score-trajectories.mjs" \
  --cohort "memory/$(date -u +%F)/weigh-<slug>-<HHMMSS>.cohort.json" \
  --method "<best-of-n|vote|softmax|synthesis>" \
  --now "$(date -u +%s)" \
  [--weights '<json>'] [--soft]
```

The scorer prints a JSON report: the resolved `config`, the per-trajectory
`scored[]` rows (each with a fully reconstructable `weightBreakdown`), any
`floorViolations`, and `selected` (an id, or an array of ids for `synthesis`). If
**no** trajectory is eligible it returns `{ selected: null, reason:
"NO-SELECTION", floorViolations: [...] }` — surface the floor that killed the
cohort and announce `RESULT: NO-SELECTION`. **Never hand-pick a least-bad
trajectory** the scorer rejected (use `--soft` if a least-bad pick is genuinely
wanted).

### Step 5 — Aggregate (for `synthesis`)

For `--method synthesis` the scorer returns the **top-K eligible ids** (`selected`
is an array, `topK` carries their weights) rather than one winner. Spawn one
**synthesis `Agent`** that reads the top-K outputs and **grafts** them into a
single best answer (take the strongest element of each). For the other three
methods `selected` is already the single chosen id — no aggregation step.

### Step 6 — Persist + log

1. **Persist** the run artifacts to the **gitignored** `memory/<UTC-date>/`
   directory (matched by `.gitignore` `memory/[0-9]*/`) — never stage them:
   - `weigh-<slug>-<HHMMSS>.json` — the full scorer report (config + scored rows +
     selection), the audit trail.
   - `weigh-<slug>-<HHMMSS>.md` — a short human summary: the task, N, method,
     weights, the selected id(s) + why (cite the winning `weightBreakdown`), and
     any `floorViolations`.

2. **Log** per the Memory Improvement Protocol — append to
   `memory/<UTC-date>/log.md` (today = `date -u +%Y-%m-%d`):

   ```markdown
   ## weigh -- HH:MM UTC
   - **Result**: SELECTED | NO-SELECTION | DRY-RUN
   - **Task**: "<task or --cohort source>"
   - **Cohort**: N=<n>, method=<m>, weights=<frozen|custom(judge=<j>)>
   - **Selected**: <id(s) or "NO-SELECTION (<floor cause>)">
   - **Observation**: <one sentence>
   ```

   See `.mifune/skills/retro/references/memory-protocol.md` for the canonical
   Memory Improvement Protocol.

Announce the `RESULT:` tag once Step 6 completes.

## Anti-patterns

- **Hand-picking the scorer's reject.** If `select()` returns `NO-SELECTION`, the
  hard floor killed every trajectory — report it, do not promote a failure. Use
  `--soft` deliberately if a least-bad pick is wanted.
- **Sampling the same path N times.** Step 2's angles must differ, or the cohort
  has no diversity to select over and `consistency` is meaningless.
- **Calling `Date.now()` for `--now`.** The scorer is pure by design; the *skill*
  supplies `--now "$(date -u +%s)"` from the shell. Never patch a fallback into
  the scorer.
- **Exceeding the cap.** `N > 8` is rejected — cost grows linearly with N (plus
  `/eval` + `/audit` per trajectory). Preview with `--dry-run` first.
- **Committing the artifacts.** `memory/<UTC-date>/` is gitignored; never stage a
  cohort, report, or summary.
- **Editing the scorer to change weights inline.** `DEFAULT_WEIGHTS` is
  `Object.freeze`d and probe-pinned; pass `--weights` for a one-off, and route any
  durable change through review (as `/benchmark`).

## References

- `references/scoring.md` — the weighting formula, sub-signal table,
  `validateWeights` rules, hard-floor + `--soft` semantics, and the
  judge:0-vs-judge:25 tuning signal.
- `references/workflow-shape.md` — the seam: which steps are the Workflow tool's
  sampling/judging substrate and which step (the scorer) is the part we own, plus
  the illustrative runtime workflow-script shape.
- `scripts/score-trajectories.mjs` — the harness-owned scorer (exports
  `validateWeights`, `weight`, `select`, `clamp`, `DEFAULT_WEIGHTS`,
  `TRAJECTORY_SCHEMA`).
