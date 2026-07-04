# Capability benchmark — scoreboard

The harness's **progress ceiling**: per-task scores on the three axes
(success · cost-time · unattended). Distinct from the regression floor in
[`../RESULTS.md`](../RESULTS.md). Schema, axes, and discipline are in
[`README.md`](README.md). Policy: **overwrite the row per task id; git history
is the time series.** Scoring: `PASS=2 PARTIAL=1 FAIL=0`; task score = mean of
the three axes; suite score = mean of task scores. Baseline 2026-06-15 by rubric
inspection; rows are re-scored and overwritten per id by the `run.sh` runner.

| task | last-scored (UTC) | success | cost-time | unattended | score | basis |
|------|-------------------|---------|-----------|------------|-------|-------|
| CB-001 | 2026-06-15 | PASS | PARTIAL | PARTIAL | 1.33 | recent ready PRs (#147, #157, #163); autopilot ships unattended but cost / CI-trigger + zombie-session gaps observed |
| CB-002 | 2026-06-19 | PASS | PARTIAL | PASS | 1.67 | spec-* workflow (select→plan→critique→execute→merge) ships via /autopilot→/ship-spec to a ready PR with honest critic+audit gates and no auto-merge; retargeted in #497 from the removed loop-walk |
| CB-003 | 2026-06-15 | PASS | PASS | PARTIAL | 1.67 | /retro compounds durable lessons (loop-node-name-pipe-trap, eval-results-new-probe-row); promotion orchestrator-gated |
| CB-004 | 2026-07-03 | PARTIAL | PARTIAL | PARTIAL | 1.00 | repo-map contract + A/B manifest/scorer exist (#462), but no completed workload-mix token/tool/time benchmark yet · Δ +0.00 machinery-added vs 1.00 baseline · check=PASS |

<!-- suite score = 1.42 / 2.00 = mean(1.33, 1.67, 1.67, 1.00) · PASS=2 PARTIAL=1 FAIL=0; SKIPPED a task only when the capability is absent from the eval environment -->
