---
id: CB-002
slug: walk-the-workflow
title: "Walk the canonical spec-* workflow end-to-end"
axes: [success, cost-time, unattended]
skills: [/autopilot, /ship-spec, /spec-plan, /spec-critique, /spec-execute]
created: 2026-06-19
---

# CB-002 · Walk the canonical spec-* workflow end-to-end

## Task
Walk the harness's canonical operative path (`AGENTS.md` § The Workflow: `select → spec-plan ⇄ spec-critique → spec-execute → merge → reset|clean`) from an issue to a ready-for-review PR, advancing each stage through its honest gate with no dead ends. The capability under test is the runner's ability to mechanically carry one unit of work plan → critique → build → audit while preserving the two adversarial loops (`plan ⇄ critique`, `build ⇄ audit`) and the critic-before-commitment gate, then halting truthfully at the human merge gate rather than auto-merging.

## Success signal
- The pipeline (driven by `/autopilot` → `/ship-spec`, or the decomposed `/spec-plan` → `/spec-critique` → `/spec-execute`) produces a `tasks/<slug>/` four-file folder before any build.
- Two adversarial critics + the `/approve` gate run on local artifacts **before** any GitHub-side issue/branch/PR (critic-before-commitment).
- The build reaches a promotable PR with `/eval` green, then **stops at the human merge gate** (no auto-merge).
- The `spec-family-contract` and `workflow-boundaries` probes are green.

## Rubric
| Axis | PASS | PARTIAL | FAIL |
|------|------|---------|------|
| success | A unit advances select→plan→critique→execute to a ready PR; both adversarial loops and the pre-commitment critic gate fire; halts at the human merge gate; `spec-family-contract` + `workflow-boundaries` green | Reaches a ready PR but one gate was implicit (e.g. critique ran after GitHub state existed) | Auto-merged, skipped the critic gate, or stalled without an honest halt |
| cost-time | One pass through the pipeline ships the unit, no rework loops | One `build ⇄ audit` re-entry before promotable | Repeated audit failures before a promotable PR |
| unattended | Pipeline runs to a ready PR with zero human intervention before merge | Completed but a human had to unblock one stage | Required hands-on driving to advance the stages |

## Evidence basis
The canonical workflow in `AGENTS.md` § The Workflow, driven by `/autopilot` (sole runner) handing the selected issue to `/ship-spec` (or the decomposed `spec-*` family), demonstrates this capability. The runner selects and reconciles; `/ship-spec` / `spec-execute` own the build end-to-end; the human owns merge. Retargeted in #497 from the removed `walk-the-loop` task (which exercised the deleted `/orchestrate` executable-loop runner) to the workflow that replaced it.

## Scoring method
v1: against the branch under evaluation, drive one unit through the pipeline (e.g. `/ship-spec --issue <N>` or `/spec-plan` → `/spec-critique` → `/spec-execute`) and inspect the artifacts against the rubric — confirm the `tasks/<slug>/` folder, the pre-commitment critic gate, a promotable PR with `/eval` green, and that the run stops at the human merge gate. Then confirm the `spec-family-contract` and `workflow-boundaries` probes are green. If the spec-* family is not present on the branch under evaluation, mark this task SKIPPED (capability not present here) rather than FAIL.
