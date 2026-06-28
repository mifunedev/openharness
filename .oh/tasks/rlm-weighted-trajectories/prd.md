# PRD — RLM weighted trajectories + context-as-environment

## Summary

Integrate the **Recursive Language Models (RLM)** pattern into Open Harness as two
composable, harness-owned layers: **`/weigh`** (sample N candidate trajectories, score each
with a deterministic-first weighting function we own, select/aggregate) and **`/rlm`** (treat
a large artifact as a REPL/filesystem the root agent greps/slices and recurses sub-LM calls
over narrowed chunks). Chosen as trajectory **T7** from a ranked field of 7 integration
options (default criteria weights). Built for `mifunedev/openharness`, issue #533.

## Problem

The exploration found the harness already owns the RLM *substrate* — the Workflow tool
(judge-panel / adversarial-verify patterns = weighted-trajectory selection in JS),
`ralph.sh` + `.worktrees/` (filesystem-as-REPL), and the fan-out nodes. The **one genuine
gap** is an explicit, harness-*owned* weighting primitive: nothing scores candidate paths
*prospectively* with a transparent, tunable weight WE control. The closest precedent —
`prompt-miner`'s frozen-`DEFAULT_WEIGHTS` scorer — scores finished sessions *post-hoc*. The
operator wants to "determine the weighted trajectories ourselves."

## Goals

- Ship `/weigh`: a manual-invoke skill that samples N trajectories (Workflow-tool judge-panel
  substrate), then weights + selects them via a **pure, version-controlled scorer we own**.
- Ship `/rlm`: a sibling skill that decomposes a large artifact into addressable chunks and
  recurses sub-LM calls, reusing `ralph.sh` + `.worktrees/` + the recursive-delegation budget.
- Keep weighting **deterministic-first**: 75% deterministic signals (self-consistency, `/eval`
  rc, `/audit` verdict, cost) + a 25% model-judge coefficient that can be set to `0` for a
  fully deterministic weight.
- Prove `/weigh` end-to-end on one live seam (`/critique` weighted by self-consistency).
- Guard both primitives with 3-state eval probes; capture the concept in the wiki.

## Non-Goals

- **No sandbox application code** — harness-infra only (skills/scripts/probes/wiki).
- **Do not edit the protected `/ship-spec`-composed build path** — the `spec-execute`
  best-of-N seam is explicitly deferred to a follow-on.
- **Do not edit `.oh/scripts/ralph.sh`** — Layer B *reuses* it by reference for recursion.
- No external RLM library vendored (dspy/ax) — the weighting stays ours.
- **No change to `/critique`'s default cost model.** The US-007 seam defaults to **K=1**
  (exact current 2-critic behavior); the multi-sample path (K>1) is **opt-in, default-off,
  and capped at K=2** — total critique cost never exceeds 2× the current 2-agent baseline.
- **Judge-coefficient calibration is out of scope.** This PR ships the tunable `judge` weight
  and documents the signal to watch (judge:0 vs judge:25 selections on the sample cohort);
  choosing a project-specific value is a later, data-driven exercise.
- **`/rlm` caller acknowledgment.** Both critics noted `/rlm` has no heavy caller yet. It is
  built as *foundational substrate* per the operator's explicit T7 (both-layers) choice;
  `disable-model-invocation` + manual-invoke means it costs nothing until called. First
  callers: `/weigh` sampling over large cohorts + the wiki worked example. Not deferred.

## Wiki Alignment

- **Impact**: REQUIRED
- **Local entries**: `.mifune/skills/wiki/corpus/recursive-language-models.md` (new, provisional)
- **Spec alignment**: RLM is a net-new harness concept (context-as-environment + weighted
  trajectories); it warrants a provisional corpus entry cross-linked to existing entries.
- **DeepWiki comparison**: no public DeepWiki page covers this harness's RLM integration;
  the entry summarizes the external RLM ecosystem (alexzhang13/rlm, dspy.RLM, ax, unix-rlm,
  prose) and how the harness adapts it. Cite the source snapshot under `corpus/raw/`.
- **Acceptance criteria**: carried by **US-008** (entry created with valid frontmatter,
  raw snapshot captured, `corpus/README.md` regenerated, `wiki-readme-index.sh` green).

## User Stories

### US-001 — `/weigh` deterministic scorer + contract

As a harness operator, I want a pure, version-controlled scorer that owns the trajectory
weighting, so weighting is transparent and tunable rather than a model black box.

Acceptance criteria:
- `.mifune/skills/weigh/scripts/score-trajectories.mjs` is pure (no `git`, no `Date.now()`, no
  model call), zero-dep, node-built-ins only; exports `validateWeights`, `weight`, `select`,
  `clamp`, **`DEFAULT_WEIGHTS`, and `TRAJECTORY_SCHEMA`** (a named JSON-Schema object — the
  single source of truth for the trajectory record shape that US-002's sampling cites); frozen
  `DEFAULT_WEIGHTS` = `consistency:30, evalPass:20, auditPass:15, cost:10, judge:25` (sum 100);
  CLI `--cohort <path> --weights <json> --method <m> --now <ts> --soft --dry-run`. **When
  `--now` is absent the scorer throws a usage error and exits 1 — no `Date.now()` fallback**
  (preserves purity + test determinism). **CLI-entrypoint detection uses a basename match
  (`process.argv[1]` ends with `score-trajectories.mjs`), NOT `import.meta.url ===
  pathToFileURL(argv[1])`** — the latter silently no-ops when invoked through the
  `.claude/skills` symlink (prompt-miner-engine-symlink-guard-bug).
- `weight()` normalizes each sub-signal to [0,1] (consistency=clusterSize/N; judge=score??0.5;
  evalPass {0→1,2|null→.5,1→0}; auditPass {PASS→1,null→.5,FAIL→0}; cost=cohort-relative cheap→1)
  and emits a reconstructable `weightBreakdown`; `eligible` excludes `evalRc===1 || auditVerdict==="FAIL"` (hard floor; `--soft` down-weights instead).
- `select()` supports `best-of-n` (default, argmax), `vote` (largest cluster), `softmax`,
  `synthesis` (top-K); when no trajectory is eligible it returns the explicit shape
  `{ selected: null, reason: "NO-SELECTION", floorViolations: [{id, cause}] }` (never a
  least-bad silent pick).
- `validateWeights()` rejects non-objects, missing keys, negative/non-finite values, unknown keys.
- `.mifune/skills/weigh/scripts/__tests__/score-trajectories.test.mjs` (`node --test`) covers
  weight/floor/each-method/breakdown/`judge:0`-determinism, the `NO-SELECTION` shape (all-floor-fail
  cohort), and the absent-`--now` throw + `__tests__/fixtures/cohort-sample.json` (a cohort incl.
  one `evalRc:1` floor-breaker); the suite passes.
- `.mifune/skills/weigh/references/scoring.md` documents the formula, sub-signal table, weights
  validation rules, the hard-floor + `--soft` semantics, the `judge:0` determinism note, and the
  judge:0-vs-judge:25 selection signal an operator watches when tuning.

### US-002 — `/weigh` skill + workflow-shape reference

As a harness operator, I want a `/weigh` skill that runs the sample→score→select procedure
over the Workflow tool.

Acceptance criteria:
- `.mifune/skills/weigh/SKILL.md` has valid frontmatter (`name: weigh`, description with
  TRIGGER, `disable-model-invocation: true`, **`allowed-tools: Read, Grep, Bash, Agent`** — the
  sampling step spawns agents, so the `Agent` tool is required — and an argument-hint),
  and a numbered procedure: resolve config (N default 4, cap 8) → sample N agents (one message,
  different angles, against **`TRAJECTORY_SCHEMA` exported by `score-trajectories.mjs`** (US-001);
  `--dry-run` stops here) → attach signals (`/eval`, `/audit` by reference + clustering + optional
  verifier) → weight+select via the scorer → aggregate for `synthesis` → persist + log to
  gitignored `.oh/memory/<UTC-date>/weigh-*`.
- `.mifune/skills/weigh/references/workflow-shape.md` documents the seam: sampling/judging are
  the Workflow tool's substrate; the weight function (the scorer) is the part we own.
- `/skill-lint` passes on `weigh`; the skill name does not collide with built-ins or Pi packages.

### US-003 — `/weigh` eval probe

As a future maintainer, I want CI-visible coverage of the scorer's frozen-weights + hard-floor contract.

Acceptance criteria:
- `.oh/evals/probes/weigh-scorer-contract.sh` is a 3-state oracle (PASS=0 / REGRESSION=1 / SKIPPED=2)
  asserting **structural facts of the scorer source** (not SKILL.md prose, to avoid
  eval-probe-literal-token-coupling): the frozen weight keys are exact and sum to 100; the scorer
  exports `validateWeights`/`weight`/`select`/`clamp`/`DEFAULT_WEIGHTS`/`TRAJECTORY_SCHEMA`; the
  four method names (`best-of-n`/`vote`/`softmax`/`synthesis`) appear in the `.mjs` source; and
  running the scorer on the fixture, the `evalRc:1` trajectory is never the selected id. `SKIPPED`
  only if node/scorer/fixture is **absent** — a scorer runtime/parse error is a real `REGRESSION`,
  not a SKIP (a broken committed scorer must fail the gate).
- The probe passes locally via `bash .claude/skills/eval/run.sh` (no new regressions).

### US-004 — `/rlm` query-context primitive + tests

As a harness operator, I want a pure helper that addresses a large artifact without ingesting
it, so a root agent can grep/slice context instead of suffering context rot.

Acceptance criteria:
- `.mifune/skills/rlm/scripts/query-context.mjs` is pure, zero-dep, node-built-ins; CLI
  `<path> [--grep <re>] [--slice L1:L2] [--chunk <size>] [--map]`; returns the addressed slice
  + a chunk map (line ranges, byte offsets, match locations); enforces a **max-bytes guard**
  (never returns an unbounded slice).
- `.mifune/skills/rlm/scripts/__tests__/query-context.test.mjs` (`node --test`) covers
  chunk-map, slice, grep, and the max-bytes guard + a fixture; the suite passes.

### US-005 — `/rlm` skill + recursion-budget reference

As a harness operator, I want a `/rlm` skill that decomposes a large artifact and recurses
sub-LM calls under a bounded budget, reusing the existing recursion substrate.

Acceptance criteria:
- `.mifune/skills/rlm/SKILL.md` has valid frontmatter (`name: rlm`, TRIGGER,
  `disable-model-invocation: true`) and a numbered procedure: take artifact + query → chunk-map
  via `query-context.mjs --map` → recurse sub-agents over relevant chunks (bounded by
  depth/children/step budget) → aggregate (pipe competing per-chunk answers through `/weigh`)
  → persist the recursion trace to gitignored `.oh/memory/<UTC-date>/rlm-*`.
- `.mifune/skills/rlm/references/recursion-budget.md` points at the `Max depth N / children M /
  step S` triple in `.mifune/skills/advisor/references/recursive-delegation.md` and adds a
  per-run token ceiling. The procedure reuses `.oh/scripts/ralph.sh` and `.worktrees/` **by
  reference** (no edits to either).
- `/skill-lint` passes on `rlm`; the name does not collide.

### US-006 — `/rlm` eval probe

As a future maintainer, I want CI-visible coverage of the recursion-budget + max-bytes contract.

Acceptance criteria:
- `.oh/evals/probes/rlm-context-budget.sh` is a 3-state oracle asserting `recursion-budget.md`
  declares depth/children/step ceilings AND `query-context.mjs` enforces a max-bytes guard;
  `SKIPPED` if absent. Passes locally.

### US-007 — `/critique` weighted by self-consistency (live seam)

As a harness operator, I want `/critique` to *optionally* down-weight flaky findings, proving
`/weigh` end-to-end on a real node **without changing default behavior or cost**.

> **Override note (protected skill):** `/spec critique` (in `.claude/protected-paths.txt`)
> dispatches to `.mifune/skills/critique/SKILL.md`. This story edits that file **additively and
> default-off**: it does NOT delete the skill, does NOT touch the `critique.md` output headings
> that `/approve` + `/ship-spec` Stage 4 parse, and does NOT alter the default 2-critic run.
> The edit is an opt-in paragraph, not a behavior change at default.

Acceptance criteria:
- `.mifune/skills/critique/SKILL.md` gains an **opt-in, default-off** "self-consistency weighting
  (optional)" subsection: when the operator passes a `--weigh` flag (or sets a documented env
  var), each lens samples **K critics (K default 1 = exact current behavior; opt-in K=2, hard
  cap 2)** and routes them through `/weigh` (`vote` method) so a finding firing 1/K is
  down-weighted vs. K/K **before** the SEVERITY tally. **Default (no flag) = today's behavior,
  byte-for-byte in effect** — zero added agent calls.
- The `critique.md` output schema (`## Critic A`, `## Critic B`, `## Synthesis`, the SEVERITY tally
  line, the `Recommendation`) is **unchanged**; `/approve`'s parser still reads it.
- `.oh/evals/probes/spec-family-contract.sh` (the existing critique-guarding probe) gains a concrete
  assertion that `critique.md`'s required headings are still emitted (the seam is schema-preserving);
  the `/eval` suite stays green. The PR description names this protected-skill edit explicitly.

### US-008 — Wiki entry (compound knowledge)

As a future maintainer, I want the RLM concept captured so it is reused, not re-derived.

Acceptance criteria:
- `.mifune/skills/wiki/corpus/recursive-language-models.md` exists with valid frontmatter
  (`confidence: provisional`, `updated:` date, `related:` cross-links), ≤600 words covering
  RLM context-as-environment + weighted-trajectory selection and how the harness adapts it.
- An immutable snapshot exists under `.mifune/skills/wiki/corpus/raw/<date>-recursive-language-models.md`.
- `.mifune/skills/wiki/corpus/README.md` is regenerated; `bash .oh/evals/probes/wiki-readme-index.sh`
  passes. Curated entry + raw snapshot are force-added (`git add -f`) and **verified tracked**:
  `git ls-files .mifune/skills/wiki/corpus/recursive-language-models.md .mifune/skills/wiki/corpus/raw/*recursive-language-models.md`
  lists both (the corpus is gitignored-by-default, so a forgotten force-add passes CI silently).

### US-009 — CHANGELOG + RESULTS.md + collision verification

As a future maintainer, I want the change recorded and the probe benchmark current.

Acceptance criteria:
- `CHANGELOG.md` records the RLM `/weigh` + `/rlm` addition under `## [Unreleased]` (`### Added`).
- `.oh/evals/RESULTS.md` gains rows for `weigh-scorer-contract.sh` and `rlm-context-budget.sh`
  (hand-inserted; do not churn existing timestamps).
- A name-collision check confirms `weigh` and `rlm` do not shadow built-ins or Pi packages
  (recorded in `progress.txt`).
