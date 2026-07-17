# Full audit campaign

Run inline from the top-level session under the inherited immutable `AUDIT_RUN_ID`, `AUDIT_ROOT`, and `AUDIT_LOG_ROOT`. Compose in cost order:

1. `/audit drift`
2. `/eval` in audit-child mode (regression floor; scoreboard write disclosed)
3. `/audit skills all`, `/audit eval-quality all`, and `/audit context all`
4. `/audit harness`
5. `/audit prs [--repo O/N]`

`--repo O/N` is optional exactly as it is for `/audit prs`: when supplied to
`full`, forward the same owner/name unchanged to the queue child. When omitted,
the queue child resolves the repository from `gh repo view --json nameWithOwner` in
`AUDIT_ROOT`; `full` must not invent a different default or drop the queue.

With `--health-target "target"`, additionally compose `/health-check "target" --dry-run`; it is read-only evidence and must never reclaim resources. If nested execution prevents a target's sub-agent fan-out, mark it `deferred`, print its exact top-level rerun, and continue. Never claim it ran.

Keep each native verdict and evidence provenance. Build a campaign envelope keyed by `AUDIT_RUN_ID` with target, source/path, completion (`complete|partial|deferred|failed`), severity/effort when supplied, and correlation keys. Deduplicate root causes without losing target provenance. Rank with the harness matrix: Tier 1 Fix Now, Tier 2 Build Next, Tier 3 Design Decisions Needed; within a tier sort complete evidence before incomplete, severity H/M/L, then effort S/M/L. State unscorable items rather than inventing scores.

Always produce Recommended Next 3 Actions with owning targets, cited evidence, and dependency/gate. `AUDIT-CAMPAIGN-COMPLETE` means all selected targets executed with complete evidence, regardless of unhealthy native findings. Otherwise emit `AUDIT-CAMPAIGN-PARTIAL`, list every missing/deferred target and exact rerun, and visibly label synthesis and Next 3 Actions partial.

The outer dispatcher alone performs one locked memory append. Children return observations and suppress their logs.
