# Autopilot selection source snapshot — 2026-06-20

Source: `.claude/skills/autopilot/SKILL.md` and `.pi/skills/autopilot/SKILL.md` after issue #468.

Relevant excerpt:

- Queue candidates are open GitHub issues labeled `autopilot` and not labeled `autopilot-blocked`.
- The queue dedupe stage now fetches open PRs and recent merged PRs into `/tmp/autopilot-open-prs-$$.json` and `/tmp/autopilot-merged-prs-$$.json`.
- `issue_pr_refs_in()` checks `closingIssuesReferences`, `headRefName`, PR title, and PR body for issue references or closing keywords.
- `issue_open_pr_refs()` and `issue_merged_pr_refs()` share that matcher.
- A candidate is skipped when either helper returns references; merged matches represent completed-but-still-open tickets that GitHub did not close because Open Harness PRs target `development` rather than the repository default branch.
- If all open `autopilot` issues have open or merged PR references, the loop falls through to `/harness-audit` research instead of rebuilding completed work.

Regression guard: `evals/probes/autopilot-merged-pr-reference-dedupe.sh` checks these literals and fails if the merged-PR dedupe path disappears.
