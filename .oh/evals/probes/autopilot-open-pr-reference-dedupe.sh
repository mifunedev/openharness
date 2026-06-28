#!/usr/bin/env bash
# tier: A
# source: issue #437 — autopilot must not start duplicate work when open PRs reference the same issue without linked-PR metadata
# desc: /autopilot issue selection must dedupe open issues against open PR refs in linked metadata, branch, title, and body before launching work.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SKILL="$ROOT/.claude/skills/autopilot/SKILL.md"

if [[ ! -f "$SKILL" ]]; then
  echo "SKIPPED: autopilot skill absent: $SKILL" >&2
  exit 2
fi

missing=()
grep -Fq 'OPEN_PRS_JSON="/tmp/autopilot-open-prs-$$.json"' "$SKILL" || missing+=("bulk open PR JSON cache")
grep -Fq 'issue_open_pr_refs()' "$SKILL" || missing+=("issue_open_pr_refs helper")
grep -Fq 'closingIssuesReferences' "$SKILL" || missing+=("linked metadata check")
grep -Fq 'headRefName' "$SKILL" || missing+=("head branch check")
grep -Fq 'body,closingIssuesReferences' "$SKILL" || missing+=("PR body fetched")
grep -Fq 'close[sd]?[[:space:]]+#' "$SKILL" || missing+=("closing keyword body regex")
grep -Fq 'Queue selection: implementing open autopilot issue #$ISSUE_NUM' "$SKILL" || missing+=("queue rationale kept")
grep -Fq 'no open or merged PR reference after local PR dedupe' "$SKILL" || missing+=("rationale names local PR dedupe")
grep -Fq '[dry-run] dedupe: $DEDUPE_STATE' "$SKILL" || missing+=("dry-run dedupe visibility")

if grep -F -- '--search "-linked:pr -label:autopilot-blocked"' "$SKILL" >/dev/null; then
  missing+=("queue still relies on -linked:pr")
fi

if (( ${#missing[@]} )); then
  printf 'REGRESSION: autopilot open-PR reference dedupe missing: %s\n' "${missing[*]}" >&2
  exit 1
fi

echo "PASS: autopilot dedupes issue selection against open PR metadata, branch, title, and body refs" >&2
exit 0
