---
id: CB-002
slug: walk-the-loop
title: "Walk the executable loop end-to-end"
axes: [success, cost-time, unattended]
skills: [/orchestrate]
created: 2026-06-15
---

# CB-002 · Walk the executable loop end-to-end

## Task
Walk the harness's executable decision-tree from the `ideate` node and route through it to an honest stop with no dead ends. The capability under test is the loop runner's ability to mechanically advance node→token→next-node across the whole tree, halting truthfully at the first unwired node rather than fabricating a route or looping forever.

## Success signal
- `/orchestrate --dry-run --start ideate` exits `0` and prints a **connected** route — every node's declared terminal STATUS token resolves to a real next node via the `context/rules/loop.md` § 2 route table.
- The walk halts **honestly** at the first unwired node (no fabricated continuation past a missing token).
- The `loop-handoff-consistency` probe is green.
- No token routes off the tree (no dangling edge to a non-existent node).

## Rubric
| Axis | PASS | PARTIAL | FAIL |
|------|------|---------|------|
| success | `/orchestrate --dry-run --start ideate` exits 0 with a fully connected route, halts honestly at the first unwired node, `loop-handoff-consistency` probe green | Route printed but one node's token is ambiguous or the halt point is implicit rather than reported | Non-zero exit, a dangling token routing off-tree, or a fabricated continuation past an unwired node |
| cost-time | Single dry-run invocation resolves the whole route, no retries | Needed a second invocation or manual route-table cross-check | Repeated failed walks before a clean route emerged |
| unattended | Route validated with zero human intervention | Completed but a human had to disambiguate one edge | Required hands-on tracing of the route table to finish |

## Evidence basis
The `/orchestrate` runner plus `context/rules/loop.md` § 2 route table and the `loop-handoff-consistency` probe (executable-loop series) demonstrate this capability. Note: the loop machinery (the `/orchestrate` skill + `loop.md` § 2 route table) is integrated into `development`; this task scores the harness's loop-walking capability on a branch that carries it. The runner is mechanical by design — it routes, it does not decide (loop.md § 6) — so an honest halt at an unwired node is the correct PASS, not a failure.

## Scoring method
v1: against the branch carrying the executable-loop series, run `/orchestrate --dry-run --start ideate` fresh and inspect its output against the rubric — confirm exit 0, a connected route, the reported honest-halt node, and that each printed edge maps to a § 2 route-table entry. Then run the `loop-handoff-consistency` probe and confirm green. If the series is not yet present on the branch under evaluation, mark this task SKIPPED (capability not present here) rather than FAIL.
