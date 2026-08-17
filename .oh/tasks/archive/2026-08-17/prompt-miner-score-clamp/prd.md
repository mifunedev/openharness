# PRD — prompt-miner score clamp censors the statistic the marker gate reads (issue #778)

> rev 2 — revised against 2 adversarial critics (implementer lens, user lens).
> 2 high-severity findings, 7 medium, 6 low. See `critique.md` for the findings
> and their disposition. The shape is unchanged; the revisions add R8–R11, a
> stability guard (R9) that answers the "this makes the gate more permissive"
> objection, per-story acceptance criteria, and three doc surfaces the rev-1
> rules had left unassigned.

## Problem

`scoreSession` in `.oh/skills/prompt-miner/scripts/mine-traces.mjs:427` computes
`const score = clamp(base + bonus, 0, 100)`. `base` is already capped at 100 by
construction (it is `100 −` five non-negative penalties, each built from a signal
clamped to `[0,1]` — `mine-traces.mjs:37-44,376,389,391`), and `bonus` adds up to
15 more. So every low-friction session that earns the ground-truth bonus lands on
the ceiling and becomes indistinguishable from every other session on the ceiling.

This is not a rare edge case. On the 2026-08-13 run (`--hours 336`), **15 of the
37 `other`-stratum sessions (41%) sit at exactly 100**.

The marker gate (`.oh/skills/prompt-miner/references/markers.md:55-58`) promotes a
marker on `effect_size ≥ 0.3`, where `effect_size` is a standardized mean
difference in `score`. Because the upper tail of `score` has been flattened, the
gate is reading a censored variable.

### Measured consequence — the clamp changes a robustness verdict

Today's only bar-clearing marker is `lenWords >= 25` in stratum `other`
(`sessions_supporting=19`, `sessions_contradicting=18`).

| scale | mean(meets) | mean(fails) | effect size | leave-one-out range | LOO folds under the bar |
|-------|------------:|------------:|------------:|--------------------:|------------------------:|
| capped `score` (what the gate reads) | 96.35 | 94.24 | **0.332** | 0.206 .. 0.523 | **19/37** |
| uncensored `base + groundTruthBonus` | 99.21 | 95.62 | **0.423** | 0.323 .. 0.589 | **0/37** |

Same sessions, same window, same feature. On the capped scale a single dropped
session pushes the marker under the promotion bar in more than half of the folds;
uncensored, no fold crosses. The clamp — not the data — is the difference.

Two more features from the same run show the same distortion:
`hasFilePath` `d_cap=0.258` vs `d_unc=0.294`; `lenChars>=174` `d_cap=0.295` vs
`d_unc=0.285`. The clamp does not distort in a consistent direction, which is
worse than a fixed bias — it cannot be corrected by moving the bar.

### The distortion can flip a sign, not just a magnitude

Issue #730's table records `hasFilePath` at `d_cap=−0.497` / `d_unc=−0.638` on
2026-08-03 and `d_cap=+0.349` / `d_unc=+0.402` on 2026-08-10. Across windows the
two scales have disagreed by more than magnitude. A statistic whose *sign* can
depend on which scale you read is not a statistic you can promote a lesson from
without saying which scale you read. R9 below turns that disagreement into an
explicit, reported, non-promotable state instead of a silent choice.

### Prior art in the repo

Issue #730's evidence table already reports `d_cap` and `d_unc` side by side by
hand, and records that the single `referencesSkill` promotion on 2026-08-09 was
"an artifact of the score clamp" (`d_cap=0.308` cleared the bar, `d_unc=0.240`
did not). That manual workaround is the tell: the analyst has been routing around
the emitted score for weeks.

## Decision — what this task does and does not do

**Chosen shape: emit the uncensored value, name the scale the gate reads, report
saturation, and refuse to promote a marker the two scales disagree about. Do not
change the clamped `score` and do not move the bar.**

- `score` stays clamped to `[0, 100]`. It is the human-facing display number, it
  drives ranking, and changing its range would invalidate every stored artifact
  from prior runs — including the nine daily artifacts #730's table is built from.
- A new sibling field carries the uncensored value. It is **additive**; nothing
  that reads `score` changes behavior.
- `references/markers.md` currently does not say which scale `effect_size` is
  computed against. That silence is why the ambiguity survived. It is made
  explicit, and it names the uncensored scale.
- The manifest gains a per-stratum saturation census, so a future run can see at a
  glance when the display scale has stopped discriminating.

**Rejected: raising or removing the cap on `score` itself.** It breaks
comparability with every previously emitted artifact for no analytical gain the
additive field does not already provide.

**Rejected: subtracting the bonus, or rescaling to keep the range.** Any monotone
transform that keeps the ceiling keeps the censoring. The problem is the ceiling,
not the units.

### The permissiveness objection, and why R9 answers it

Critic B's high-severity finding is correct on its face: on the run that motivated
this task, moving to the uncensored scale takes `lenWords` from `d=0.332` to
`d=0.423` and from 19/37 LOO folds under the bar to 0/37. The daily cron files a
GitHub issue the moment a marker clears the bar
(`.oh/crons/prompt-miner.md` § Steps 2). Making the measurement scale more
generous, on a gate #730 has already shown to be unstable, would raise the
auto-file rate on a signal that is not yet trustworthy.

R9 is the answer, and it makes the net change **stricter, not looser**. A marker
must now be computed on **both** scales. Where the two agree, the uncensored value
is authoritative and the gate behaves as before. Where they **disagree** — on
direction, or on whether the bar is cleared — the marker is reported `UNSTABLE`
and is **not promotable at all**, on either scale. Today's `referencesSkill`
promotion on 2026-08-09 (`d_cap=0.308` cleared, `d_unc=0.240` did not) would have
been blocked by R9. The clamp-artifact promotions this task exists to prevent are
exactly the disagreement cases; R9 removes them rather than re-labelling them.

The residual permissiveness is limited to markers where both scales already agree
the bar is cleared and only the magnitude differs. Accepting that is the
deliberate decision recorded here.

### Sequencing — why this ships before #730

This is a confirmed, low-risk, additive measurement defect whose cause
(`clamp(..., 0, 100)` at one call site) is independent of #730's cause (windows
that overlap ~80% between consecutive daily runs). Fixing it first removes one
proven noise source from the statistic #730 must stabilize, and gives any future
#730 fix a scale to measure reproducibility on that is not itself censored. It
does not conflict with #730: no rule here touches window construction, promotion
thresholds, or cross-run comparison.

**Explicit non-goal: this does not close #730.** Any story proposing a K-of-N or
window-overlap promotion rule is out of scope.

## Rules

- **R1** — `scoreSession` returns a new field `scoreUncapped` = `base + bonus`,
  rounded to 2 decimals, with no clamp applied. `score` is unchanged: still
  `clamp(base + bonus, 0, 100)`, still 2 decimals.
- **R2** — `scoreUncapped` is emitted on **every scored session record** — both
  `sessions[]` and `unranked[]`, which share one record shape built from one
  `scoreSession` call before the rankable split (`mine-traces.mjs:1004-1029`,
  split at `:1040`/`:1070`). It is a sibling of `score`, not nested inside
  `scoreBreakdown` (which already carries the `base`/`groundTruthBonus` parts it
  is derived from).
- **R3** — the manifest gains `ceilingSaturation`: an object keyed by session type,
  each value `{ atCeiling: <int>, total: <int> }`. It is computed over the
  **`rankable`** population only (the same set `sessions[]` is built from), and
  `atCeiling` counts records whose **stored, rounded `score` field is exactly
  `100`** — not `scoreUncapped`, and not an unrounded intermediate. Session types
  with zero rankable sessions are omitted.
- **R4** — `references/markers.md` states that `effect_size` is computed against
  `scoreUncapped`, and says why (the clamped scale is censored above 100). The
  `sessions_supporting ≥ 10` and `effect_size ≥ 0.3` thresholds are unchanged.
- **R5** — the emitted markdown report surfaces the saturation census under the
  existing `## Manifest` section, in the same flat `- key: value` bullet style as
  the surrounding lines (`mine-traces.mjs:1086-1097`), so a `--report-only` cron
  run is self-describing without reading the JSON.
- **R6** — the privacy contract is unchanged. No new field carries prompt text;
  `scoreUncapped` and `ceilingSaturation` are numeric only.
- **R7** — no change to `DEFAULT_WEIGHTS`, to `SCORE_MODEL`'s penalty arithmetic,
  to `MARKER_FEATURE_KEYS`, or to the ranking order (ranking still sorts by
  `score`, `mine-traces.mjs:1041`).
- **R8** — `SKILL.md` is updated wherever it names the correlation scale. Step 3
  currently says "correlate each feature in `markerFeatureKeys` against the session
  `score`" (`SKILL.md:135`); it must name `scoreUncapped`. Step 2's dataset
  description (`SKILL.md:117-118`) must list the new fields. This is load-bearing:
  `SKILL.md` is the doc an agent actually executes, so leaving it pointing at the
  censored scale would reproduce the exact ambiguity R4 exists to remove.
- **R9** — **stability guard.** The marker record gains `effect_size_capped`
  (the same standardized mean difference computed against the clamped `score`)
  alongside `effect_size` (uncensored, authoritative). A marker is **`UNSTABLE`
  and not promotable** when the two scales disagree, defined as either:
  (a) `sign(effect_size) != sign(effect_size_capped)`, or
  (b) exactly one of `|effect_size| >= 0.3` and `|effect_size_capped| >= 0.3` holds.
  An `UNSTABLE` marker is reported with both values and the reason, and is never
  translated into a memory proposal or an auto-filed issue. Markers that agree are
  promoted on `effect_size` as before.
- **R10** — `references/report-schema.md` is updated in the same commit: the
  manifest field table gains a `ceilingSaturation` row and the `sessions[]` /
  `unranked[]` shape example gains a `scoreUncapped` line.
- **R11** — `references/scoring.md` is updated in the same commit to document
  `scoreUncapped` as a formula-adjacent output, next to the existing
  `score = clamp(friction + groundTruthBonus, 0, 100)` line (`scoring.md:16`), and
  to state plainly that `score` is censored above 100 while `scoreUncapped` is not.

## Wiki Alignment

- **Impact**: NOT-APPLICABLE
- **Local entries**: none
- **Spec alignment**: this task changes two numeric fields, one manifest key, and
  the prose of three reference docs plus one SKILL.md step, all inside a single
  skill. It introduces no new mechanism, no new vocabulary, no runtime-flow
  change, and no agent-role change. The skill's own `references/scoring.md`,
  `references/markers.md`, and `references/report-schema.md` are the canonical
  documentation for this behavior and are updated in place by R4, R10, and R11 —
  so a future agent can learn the model from the in-skill docs alone.
- **DeepWiki comparison**: not run — the change is confined to one skill's internal
  scoring detail and does not map to a DeepWiki subsystem page. Deferred, not
  skipped: if the follow-on #730 fix consumes `scoreUncapped` or
  `ceilingSaturation` as load-bearing inputs to a new promotion rule, **that** task
  must run the comparison and reassess wiki impact.
- **Acceptance criteria**: none added beyond the doc ACs in US-003.

## Known constraint — CI does not run these tests

`.oh/skills/**` is absent from the repository's vitest `include` globs
(`vitest.config.ts:5-9`), so the `node --test` suite at
`.oh/skills/prompt-miner/scripts/__tests__/` does **not** run in CI. A test-based
acceptance criterion here is verified by explicit invocation, not by a green CI
check. Every test AC below is written to be checked by running the suite directly,
with the command pinned in US-001. Do not write an AC that claims CI enforcement.

## User stories

### US-001 — `scoreSession` emits the uncensored value

As the analyst mining markers, I want the uncensored score emitted alongside the
clamped one, so that an effect size is computed on a variable that is not censored
at its upper bound.

**Acceptance criteria**

- `scoreSession` returns `scoreUncapped` = `Number((base + bonus).toFixed(2))`,
  with no `clamp` applied to it.
- `score` is byte-identical to its pre-change value for every input: a test feeds
  at least one session with `base + bonus > 100` and pins `score === 100` while
  `scoreUncapped > 100` on the same return value.
- A test feeds a maximally-penalized session (all five signals at their clamped
  maximum, no ground-truth bonus) and pins `scoreUncapped === 0` — proving the
  lower bound is unaffected and no negative value can be produced by the current
  weights.
- `scoreUncapped` appears on records in both `sessions[]` and `unranked[]` of the
  emitted JSON, verified against a fixture run.
- The `sessions[]` ordering is unchanged: a test asserts the ranked order is the
  same as sorting by `score` descending.
- The whole suite passes when invoked directly:
  `node --test .oh/skills/prompt-miner/scripts/__tests__/` exits `0`.
- Every new test is attributed: deleting the new `scoreUncapped` line from
  `scoreSession` makes the suite exit non-zero, proving the assertion is wired to
  the behavior under test and not passing incidentally.

### US-002 — the manifest and markdown report carry a saturation census

As the operator reading a cron report, I want to see how much of each stratum sits
on the ceiling, so that I can tell when the display scale has stopped
discriminating without recomputing anything.

**Acceptance criteria**

- `manifest.ceilingSaturation` is an object keyed by session type; each value is
  `{ atCeiling: <int>, total: <int> }`.
- It is computed over the `rankable` population only. A test with a fixture that
  contains a `noHumanPrompt` session (`sessionType` null) pins that no `null` key
  appears in `ceilingSaturation`.
- `atCeiling` counts records whose stored `score` field is exactly `100`. A test
  pins that a record with `scoreUncapped = 112.5` and `score = 100` counts, and a
  record with `score = 99.99` does not.
- Session types with zero rankable sessions are omitted from the object.
- The markdown report renders the census under the existing `## Manifest` heading,
  in the same `- key: value` bullet style as the adjacent lines, one line per
  stratum, e.g. `- ceilingSaturation.other: 15/37`.
- `--dry-run` still writes no files and its stdout summary is unchanged apart from
  any census content; a test pins that no file is created under a temp `--out`.
- No new field carries prompt-derived text (R6): a test asserts the emitted JSON
  contains no `promptText` key when `--include-prompt-text` is not passed, which
  must still hold after this change.

### US-003 — every doc that names the scale names the right one

As a future agent applying the promotion bar, I want each doc that mentions the
correlation scale to name `scoreUncapped`, so that the ambiguity that produced the
manual `d_cap`/`d_unc` workaround cannot recur — and I want the stability guard
written down where the marker contract lives.

**Acceptance criteria**

- `references/markers.md` states that `effect_size` is computed against
  `scoreUncapped` and gives the one-clause reason (the clamped scale is censored
  above 100).
- `references/markers.md` documents the R9 stability guard: the marker record
  carries both `effect_size` and `effect_size_capped`; the `UNSTABLE` condition is
  stated with both its (a) sign-disagreement and (b) bar-disagreement branches;
  and an `UNSTABLE` marker is explicitly never promotable and never translated
  into a memory proposal or an auto-filed issue.
- `references/markers.md`'s falsifiable-marker JSON example includes
  `effect_size_capped`.
- The `sessions_supporting >= 10` and `effect_size >= 0.3` thresholds and the
  mandatory session-type stratification section are unchanged, proven by
  `git diff`.
- `SKILL.md:135`'s "against the session `score`" is changed to name
  `scoreUncapped`; a grep for the phrase `against the session \`score\`` in
  `SKILL.md` returns no match.
- `SKILL.md` Step 2's dataset description lists `scoreUncapped` and
  `manifest.ceilingSaturation`.
- `SKILL.md` Step 3 instructs that an `UNSTABLE` marker is reported but not
  proposed, and Step 4's propose-then-confirm gate is otherwise unchanged, proven
  by `git diff`.
- `references/report-schema.md`'s manifest field table has a `ceilingSaturation`
  row, and its `sessions[]` / `unranked[]` shape example has a `scoreUncapped`
  line.
- `references/scoring.md` documents `scoreUncapped` beside the existing
  `score = clamp(friction + groundTruthBonus, 0, 100)` line, and states that
  `score` is censored above 100 while `scoreUncapped` is not.
- The privacy-contract sections of `SKILL.md` and `references/report-schema.md`
  are unchanged, proven by `git diff`.
- `CHANGELOG.md` gains one entry under `## [Unreleased]` → `### Fixed` covering
  the censored statistic, the measured saturation, the capped-vs-uncensored LOO
  split, the additive field, the `UNSTABLE` guard and what it would have blocked,
  and an explicit statement that this does **not** close #730 — linking #778.
- No file outside `.oh/skills/prompt-miner/`,
  `.oh/tasks/prompt-miner-score-clamp/`, and `CHANGELOG.md` is modified, proven by
  `git diff --stat`.

## Non-goals

- Changing the promotion thresholds (`sessions_supporting ≥ 10`, `effect_size ≥ 0.3`).
- Any cross-window / K-of-N / overlap-based reproducibility rule (that is #730).
- Changing the clamped `score`, the weights, the penalty terms, or the ranking order.
- Changing the privacy contract or emitting any new prompt-derived text.
- Backfilling `scoreUncapped` or `ceilingSaturation` into previously emitted artifacts.
- Adding `.oh/skills/**` to the CI test globs (a real gap, but a separate task).

## Rollback

Every change is additive to a single skill directory. `git revert` of the
implementation commit restores the prior behavior exactly; no stored artifact,
branch, or downstream consumer depends on the new fields, and prior reports remain
readable because `score` is untouched.

One caveat a revert does not cover: any issue or PR filed by the daily cron
between ship and revert will cite the uncensored scale in its evidence text. A
revert changes future runs only — it does not retract or annotate artifacts
already filed. If a revert becomes necessary, comment on any such artifact rather
than assuming the revert speaks for it.
