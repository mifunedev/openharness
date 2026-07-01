#!/usr/bin/env bash
# tier: A
# source: issue #439 — /pr-audit must flag duplicate open PRs that reference the same issue
# desc: /pr-audit surfaces duplicate issue-reference groups as a read-only orthogonal triage flag.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SKILL="$ROOT/.claude/skills/pr-audit/SKILL.md"

if [[ ! -f "$SKILL" ]]; then
  echo "SKIPPED: pr-audit skill absent: $SKILL" >&2
  exit 2
fi

missing=()
for literal in \
  'stale/convention/duplicate issue-reference flags' \
  'body,closingIssuesReferences' \
  'def issue_refs:' \
  'closingIssuesReferences' \
  'Closes #N' \
  'Fixes #N' \
  'Resolves #N' \
  '🔁 **Duplicate issue refs**' \
  'duplicate issue refs U' \
  'choose the canonical PR; close/rebase duplicates only after human review' \
  'duplicate issue-reference flags without per-PR API loops'
do
  if ! grep -Fq "$literal" "$SKILL"; then
    missing+=("$literal")
  fi
done

if (( ${#missing[@]} > 0 )); then
  echo "REGRESSION: pr-audit duplicate issue-reference flag contract is incomplete; missing literals:" >&2
  printf '  - %s\n' "${missing[@]}" >&2
  exit 1
fi

echo "PASS: pr-audit documents duplicate issue-reference detection and read-only triage flags" >&2
exit 0
