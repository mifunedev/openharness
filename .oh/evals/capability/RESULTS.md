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
| CB-002 | 2026-06-19 | PASS | PARTIAL | PASS | 1.67 | spec-* workflow (select→plan→execute→merge) ships via /autopilot→/spec to a ready PR with an honest audit gate and no auto-merge; retargeted in #497 from the removed loop-walk; task re-authored 2026-08-24 (US-003) when /ship-spec was absorbed into /spec execute — score predates that re-authoring |
| CB-003 | 2026-06-15 | PASS | PASS | PARTIAL | 1.67 | **RETIRED** — historical row, no longer scored. Original basis: /retro compounds durable lessons (loop-node-name-pipe-trap, eval-results-new-probe-row); promotion orchestrator-gated. `/retro` is now report-only, so the identity-promotion cycle this task scored no longer exists; the task spec and its `DS-020-lens-diversity` dataset are removed. |
| CB-004 | 2026-07-03 | PARTIAL | PARTIAL | PARTIAL | 1.00 | **RETIRED — unproven, not disproven.** Original basis: repo-map contract + A/B manifest/scorer exist (#462), but no completed workload-mix token/tool/time benchmark yet · Δ +0.00 machinery-added vs 1.00 baseline · check=PASS. The task spec, its held-out A/B workload manifest, and its scorer all landed 2026-07-03 and the paired A/B workload was **never run once** in the ~2 months they stood — the row held at `Δ +0.00 machinery-added` for that entire span because no measurement was ever taken. The benchmark did not show `.oh/context/REPO_MAP.md` to be useless; it showed nothing at all. `REPO_MAP.md` and this benchmark are removed as **unproven** — for want of evidence in either direction, not against evidence. |
| CB-005 | 2026-08-31 | PARTIAL | PARTIAL | FAIL | 0.67 | First real run, scored from the change that introduced the chain — not by rubric inspection. The chain ran end-to-end: this session's lesson became `pattern-wiki-ungated-check-drift`, the `/wiki lint` § 7a check and `wiki-related-slugs.sh` landed citing it, and `SI-0001` / `SI-0001-V` were appended. The persistence invariant was **exercised**, not asserted: deleting the pattern page and shrinking its `sources:` list each produced a REGRESSION from `wiki-pattern-persistence.sh`, and in-place ledger edits and record removal each produced a REGRESSION from `wiki-skill-impact-append-only.sh`, while a clean append passed. `success` is PARTIAL because the skill edit landed before its pattern was compiled, so the citation is retrospective; `unattended` is FAIL because the operator authored the pattern body. Prior value 0.00.

<!-- live suite score = 1.22 / 2.00 = mean(1.33, 1.67, 0.67) over the un-retired tasks CB-001, CB-002, CB-005 · the two-task score before CB-005 was added was 1.50 = mean(1.33, 1.67), so the drop is a suite-composition change and NOT a comparable ceiling delta · historical four-task suite score was 1.42 = mean(1.33, 1.67, 1.67, 1.00) before CB-003 and CB-004 were retired · PASS=2 PARTIAL=1 FAIL=0; SKIPPED a task only when the capability is absent from the eval environment -->

> **Baseline reset — 0.3.0 (autopilot removal).** Every score above was taken
> while an unattended `autopilot` runner existed. That runner and its `select`
> node were removed in 0.3.0. Scores recorded before 0.3.0 are NOT comparable to
> later ones on the `unattended` axis for CB-001 and CB-002; the rows are kept as
> a historical record, not as a baseline to measure against. See the
> `## Baseline reset` note in each task file.

> **Retirements.** `CB-003` and `CB-004` keep their rows as a historical record and
> are excluded from the live suite score. `CB-003` retired because `/retro` is now
> report-only and the `IDENTITY.md` promotion cycle it scored no longer exists.
> `CB-004` retired as **unproven**: its manifest, scorer, and ablation harness all
> existed from 2026-07-03, the paired workload was never run, and the harness
> therefore holds no measurement of `REPO_MAP.md`'s value in either direction.

> **CB-005 lowers the suite score on purpose.** Adding an axis the harness scores
> `0.67` on drops the mean from 1.50 to 1.22. That is the honest reading, not a
> regression: the harness was previously blind to whether a lesson ever became a
> durable artifact, and measuring it for the first time shows it only partly does.
> A ceiling that only ever rises is measuring the wrong things. **Do not read
> 1.50 -> 1.22 as a ceiling delta** — the two means are taken over different task
> sets. The comparable number is CB-005's own 0.00 -> 0.67.
