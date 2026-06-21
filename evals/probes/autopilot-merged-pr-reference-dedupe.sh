#!/usr/bin/env bash
# tier: A
# source: issue #468 — autopilot must not rebuild open tickets whose development PRs already merged
# desc: /autopilot issue selection must dedupe open issues against merged PR refs in linked metadata, branch, title, and body before launching work.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SKILL="$ROOT/.claude/skills/autopilot/SKILL.md"

if [[ ! -f "$SKILL" ]]; then
  echo "SKIPPED: autopilot skill absent: $SKILL" >&2
  exit 2
fi

missing=()
grep -Fq 'MERGED_PRS_JSON="/tmp/autopilot-merged-prs-$$.json"' "$SKILL" || missing+=("bulk merged PR JSON cache")
grep -Fq 'gh pr list --repo "$AUTOPILOT_REPO" --state merged --limit 200' "$SKILL" || missing+=("recent merged PR fetch")
grep -Fq 'issue_pr_refs_in()' "$SKILL" || missing+=("shared issue-to-PR reference helper")
grep -Fq 'issue_merged_pr_refs()' "$SKILL" || missing+=("issue_merged_pr_refs helper")
grep -Fq 'merged_refs=$(issue_merged_pr_refs "$n" || true)' "$SKILL" || missing+=("queue checks merged refs per issue")
grep -Fq 'issue #$n already has merged PR reference(s)' "$SKILL" || missing+=("merged dedupe log")
grep -Fq 'has merged PR(s)' "$SKILL" || missing+=("dry-run dedupe state records merged PRs")
grep -Fq 'no open or merged PR reference after local PR dedupe' "$SKILL" || missing+=("queue rationale includes merged dedupe")
grep -Fq 'completed-but-still-open ticket' "$SKILL" || missing+=("completed ticket fallthrough rationale")

grep -Fq 'closingIssuesReferences' "$SKILL" || missing+=("linked metadata check")
grep -Fq 'headRefName' "$SKILL" || missing+=("head branch check")
grep -Fq 'close[sd]?[[:space:]]+#' "$SKILL" || missing+=("closing keyword body regex")

if (( ${#missing[@]} )); then
  printf 'REGRESSION: autopilot merged-PR reference dedupe missing: %s\n' "${missing[*]}" >&2
  exit 1
fi

echo "PASS: autopilot dedupes issue selection against merged PR metadata, branch, title, and body refs" >&2
exit 0
