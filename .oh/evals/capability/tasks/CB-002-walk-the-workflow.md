---
id: CB-002
slug: walk-the-workflow
title: "Walk the canonical spec-* workflow end-to-end"
axes: [success, cost-time, unattended]
skills: [/spec]
created: 2026-06-19
---

# CB-002 · Walk the canonical spec-* workflow end-to-end

## Task
Walk the canonical operative path in `.oh/skills/spec/SKILL.md` (`spec-plan → spec-execute → merge → reset|clean`) from an issue to a ready-for-review PR, advancing each stage through its honest gate with no dead ends. The capability under test is the ability to mechanically carry one unit of work plan → build → audit while preserving the `build ⇄ audit` adversarial loop and the plan-approval commitment gate, then halting truthfully at the human merge gate rather than auto-merging.

## Success signal
- The pipeline (`/spec plan` → `/spec execute`) produces a `.oh/tasks/<slug>/` four-file folder before any build.
- The plan is written and approved on local artifacts **before** any GitHub-side issue/branch/PR (plan-approval commitment gate).
- The build reaches a promotable PR with `/eval` green, then **stops at the human merge gate** (no auto-merge).
- The `spec-family-contract` and `workflow-boundaries` probes are green.

## Rubric
| Axis | PASS | PARTIAL | FAIL |
|------|------|---------|------|
| success | A unit advances plan→execute to a ready PR; the `build ⇄ audit` loop and the pre-commitment plan-approval gate fire; halts at the human merge gate; `spec-family-contract` + `workflow-boundaries` green; every build mechanic is readable in `execute.md` without opening a second skill | Reaches a ready PR but one gate was implicit (e.g. GitHub state existed before the plan was approved) | Auto-merged, skipped the plan-approval gate, or stalled without an honest halt |
| cost-time | One pass through the pipeline ships the unit, no rework loops | One `build ⇄ audit` re-entry before promotable | Repeated audit failures before a promotable PR |
| unattended | Pipeline runs to a ready PR with zero human intervention before merge | Completed but a human had to unblock one stage | Required hands-on driving to advance the stages |

## Evidence basis
The workflow contract in `.oh/skills/spec/SKILL.md` demonstrates this capability: a human enters at `/spec plan`, `/spec execute` owns the build end-to-end, and the human owns merge. Retargeted in #263 from the removed `walk-the-loop` task (which exercised the deleted `/orchestrate` executable-loop runner) to the workflow that replaced it.

**Re-authored 2026-08-24 (spec-simplification US-003)** when `/ship-spec` was absorbed into
`/spec execute` and deleted. This is the ceiling instrument for the workflow, so it is kept
and repointed rather than dropped: the path it walks is the same path, minus the second
surface a reader used to have to open. One rubric line therefore gets **stricter** — a run
that reaches a ready PR by opening a composer beside `/spec` no longer exists to score, so
the `success` axis now also requires that the whole build be readable from `execute.md`.

**Baseline reset 0.3.0 (autopilot removal).** The `select` node and its sole runner were
removed; the workflow now starts at `spec-plan`, entered by a human. The `unattended` axis
measures the build only, not selection, so pre-0.3.0 scores are NOT comparable on it.

## Scoring method
v1: against the branch under evaluation, drive one unit through the pipeline (`/spec plan` → `/spec execute`) and inspect the artifacts against the rubric — confirm the `.oh/tasks/<slug>/` folder, the pre-commitment plan-approval gate, a promotable PR with `/eval` green, and that the run stops at the human merge gate. Then confirm the `spec-family-contract` and `workflow-boundaries` probes are green, and that `references/execute.md` reads top-to-bottom with no deferral to another skill for a build mechanic. If the spec-* family is not present on the branch under evaluation, mark this task SKIPPED (capability not present here) rather than FAIL.
