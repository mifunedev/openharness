# Capability benchmark — scoreboard

The harness's **progress ceiling**: per-task scores on the three axes
(success · cost-time · unattended). Distinct from the regression floor in
[`../RESULTS.md`](../RESULTS.md). Schema, axes, and discipline are in
[`README.md`](README.md). Policy: **overwrite the row per task id; git history
is the time series.** Scoring: `PASS=2 PARTIAL=1 FAIL=0`; task score = mean of
the three axes; suite score = mean of task scores. Baseline 2026-06-15 by rubric
inspection (no automated runner yet).

| task | last-scored (UTC) | success | cost-time | unattended | score | basis |
|------|-------------------|---------|-----------|------------|-------|-------|
| CB-001 | 2026-06-15 | PASS | PARTIAL | PARTIAL | 1.33 | recent ready PRs (#147, #157, #163); autopilot ships unattended but cost / CI-trigger + zombie-session gaps observed |
| CB-002 | 2026-06-15 | PARTIAL | PASS | PASS | 1.67 | /orchestrate dry-run walks the spine ideate→compress (10/12 nodes), honest-halt; full ring not yet closeable (benchmark node still unwired; repeat wired #173/#174) |
| CB-003 | 2026-06-15 | PASS | PASS | PARTIAL | 1.67 | /retro compounds durable lessons (loop-node-name-pipe-trap, eval-results-new-probe-row); promotion orchestrator-gated |
| CB-004 | 2026-06-19 | PARTIAL | PARTIAL | PARTIAL | 1.00 | repo-map contract + A/B manifest/scorer exist (#462), but no completed workload-mix token/tool/time benchmark yet |

<!-- suite score = mean(1.33, 1.67, 1.67, 1.00) = 1.42 / 2.00 · CB-004 added 2026-06-19 by rubric inspection · PASS=2 PARTIAL=1 FAIL=0; SKIPPED a task only when the capability is absent from the eval environment -->
