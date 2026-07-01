---
id: CB-001
slug: ship-harness-change
title: "Ship a harness-infra change end-to-end"
axes: [success, cost-time, unattended]
skills: [/ship-spec, /prd, /critique, /approve, /ralph, /delegate, /eval, /pr-audit]
datasets: [DS-001, DS-002, DS-010]
created: 2026-06-15
---

# CB-001 · Ship a harness-infra change end-to-end

## Task
Given a small harness-infra change request (a skill, rule, doc, script, or cron edit — never sandbox application code), drive it from a one-line ask to a promotable, ready-for-review pull request: write the spec, gate it through the critics, implement it in an isolated worktree, run the eval floor, and confirm CI green. This is the harness's core "turn an idea into a reviewable change without a human babysitting each step" capability.

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
Recent ready-for-review PRs demonstrate the end-to-end path: e.g. #147 (default Pi monitor support) and #141, plus the executable-loop series #157/#163. `.oh/crons/autopilot.md` ships exactly this class of PR unattended on an hourly cadence (oldest open `autopilot`-labeled issue → `/ship-spec --issue` → ready PR), and `/ship-spec` itself composes `/prd` → critics → `/ralph` → branch → draft PR → eval/CI gates → ready PR.

## Scoring method
v1: inspect the most-recent real instance of this capability — the latest autopilot-shipped or `/ship-spec`-shipped PR — against the rubric. Confirm the branch name shape, `Closes #N`, the `.oh/tasks/<slug>/` scaffold (`prd.md`+`prd.json`), CI status via `gh pr checks`, and ready (non-draft) state via `gh pr view --json isDraft`. For the eval axis, diff the PR's `.oh/evals/RESULTS.md` against its base to confirm no green→red row. Alternatively, run a fresh request through `/ship-spec` and score the produced PR.
