#!/usr/bin/env bash
# tier: A
# source: conversation 2026-06-19 (workflow consolidation, issue #259)
# desc: AGENTS.md § The Workflow names the canonical operative path (in order) and states that no automated selection node exists — guards the consolidated workflow from silent re-drift.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
AGENTS="$ROOT/AGENTS.md"

if [[ ! -f "$AGENTS" ]]; then
  echo "SKIPPED: AGENTS.md absent: $AGENTS" >&2
  exit 2
fi

section=$(awk '
  /^## The Workflow/ {f=1; print; next}
  f && /^## / {f=0}
  f {print}
' "$AGENTS")

if [[ -z "$section" ]]; then
  echo "REGRESSION: '## The Workflow' section not found in AGENTS.md (the canonical workflow must be named there)" >&2
  exit 1
fi

missing=()
grep -qF '<!-- workflow-canonical -->' <<<"$section" || missing+=("the <!-- workflow-canonical --> anchor")
grep -qF 'spec-plan → spec-execute → merge → reset|clean' <<<"$section" || missing+=("the in-order operative-path string")
if grep -qF 'spec-critique' <<<"$section"; then missing+=("no revived spec-critique node (the gate was removed in US-001)"); fi
grep -qF 'no automated selection node' <<<"$section" || missing+=("the no-automated-selection statement")
grep -qF 'sole canonical workflow' <<<"$section" || missing+=("the sole-canonical-workflow statement")
grep -qF 'no all-in-one composer' <<<"$section" || missing+=("the no-all-in-one-composer statement")
if grep -qF '/ship-spec' <<<"$section"; then missing+=("no revived /ship-spec composer (it was absorbed into /spec execute in US-003)"); fi

if (( ${#missing[@]} )); then
  printf 'REGRESSION: AGENTS.md § The Workflow missing: %s\n' "${missing[*]}" >&2
  exit 1
fi

echo "PASS: AGENTS.md § The Workflow names the canonical operative path (in order), the no-automated-selection statement, and the sole-workflow/no-composer statements"
exit 0
