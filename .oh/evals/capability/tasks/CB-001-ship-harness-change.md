---
id: CB-001
slug: ship-harness-change
title: "Ship a harness-infra change end-to-end"
axes: [success, cost-time, unattended]
skills: [/spec, /prd, /ralph, /eval, /audit pr]
datasets: [DS-001, DS-002]
created: 2026-06-15
---

# CB-001 · Ship a harness-infra change end-to-end

## Task
Given a small harness-infra change request (a skill, rule, doc, script, or cron edit — never sandbox application code), drive it from a one-line ask to a promotable, ready-for-review pull request: write the spec, get it approved, implement it in an isolated worktree, run the eval floor, and confirm CI green. This is the harness's core "turn an idea into a reviewable change without a human babysitting each step" capability.

## Success signal
- A PR exists on branch `feat/<issue#>-<slug>` whose body links the issue (`Closes #N`).
- A task scaffold is present at `.oh/tasks/<slug>/` containing both `prd.md` and `prd.json`.
- `/eval` reports **no new green→red regression** versus the prior `.oh/evals/RESULTS.md` benchmark.
- All CI checks on the PR are green.
- The PR is marked **ready-for-review** (not draft).

## Rubric
| Axis | PASS | PARTIAL | FAIL |
|------|------|---------|------|
| success | Ready-for-review PR with `Closes #N`, `.oh/tasks/<slug>/` scaffold (`prd.md`+`prd.json`), CI green, no new eval regression | PR exists but stuck in draft, or scaffold incomplete, or CI not yet green | No PR, or the change introduces a green→red eval regression |
| cost-time | One clean pass: no failed CI re-runs and ≤1 implementation retry | 2–3 retries or CI re-runs before green | Repeated thrash / abandoned attempt, or wall-clock far beyond a comparable real PR |
| unattended | Reached ready-for-review with zero human intervention after the initial ask | Completed but needed ≥1 human nudge (re-run, conflict resolution) | Required hands-on human authoring/fixing to finish |

## Evidence basis
Recent ready-for-review PRs demonstrate the end-to-end path: e.g. #147 (default Pi monitor support) and #141, plus the executable-loop series #157/#163. `/spec plan` composes `/prd` → `/ralph` into the four-file folder; `/spec execute` then holds the build mechanics itself — issue → branch → draft PR → `.oh/scripts/spec-build.sh` → `build ⇄ audit` (with `/eval` inside it) → `/audit pr` → ready PR.

**Re-authored 2026-08-24 (spec-simplification US-003)** when `/ship-spec` was absorbed into
`/spec execute` and deleted. The capability under test is unchanged; only the surface that
provides it moved, so historical scores stay comparable. `/delegate` left the skill list
because it is no longer a build arm — it survives only as optional within-story fan-out.

**Baseline reset 0.3.0 (autopilot removal).** The `unattended` axis previously had an
hourly unattended runner behind it; it no longer does. Scores from before 0.3.0 are NOT
comparable on that axis — a human now initiates every run. DS-010 left the dataset list
with the `autopilot-runs` corpus it belonged to.

## Scoring method
v1: inspect the most-recent real instance of this capability — the latest `/spec execute`-shipped PR — against the rubric. Confirm the branch name shape, `Closes #N`, the `.oh/tasks/<slug>/` scaffold (`prd.md`+`prd.json`), CI status via `gh pr checks`, and ready (non-draft) state via `gh pr view --json isDraft`. For the eval axis, diff the PR's `.oh/evals/RESULTS.md` against its base to confirm no green→red row. Alternatively, run a fresh request through `/spec plan` + `/spec execute` and score the produced PR.
