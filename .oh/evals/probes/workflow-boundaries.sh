#!/usr/bin/env bash
# tier: A
# source: conversation 2026-06-19 (workflow consolidation, issue #259)
# desc: AGENTS.md § The Workflow names the canonical operative path (in order), the single runner, and the /ship-spec-today caveat — guards the consolidated workflow from silent re-drift
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
AGENTS="$ROOT/AGENTS.md"

if [[ ! -f "$AGENTS" ]]; then
  echo "SKIPPED: AGENTS.md absent: $AGENTS" >&2
  exit 2
fi

# Extract the '## The Workflow' section: from its heading to the next '## ' heading.
section=$(awk '
  /^## The Workflow/ {f=1; print; next}
  f && /^## / {f=0}
  f {print}
' "$AGENTS")

if [[ -z "$section" ]]; then
  echo "REGRESSION: '## The Workflow' section not found in AGENTS.md (the canonical workflow must be named there)" >&2
  exit 1
fi

# All required markers must be present in the section. The full operative-path literal
# encodes phase ORDER, so a single fixed-string match guards both presence and ordering.
missing=()
grep -qF '<!-- workflow-canonical -->' <<<"$section" || missing+=("the <!-- workflow-canonical --> anchor")
grep -qF 'select → spec-plan ⇄ spec-critique → spec-execute → merge → reset|clean' <<<"$section" || missing+=("the in-order operative-path string")
grep -qF 'designated sole runner' <<<"$section" || missing+=("the single-runner statement")
grep -qF '/ship-spec' <<<"$section" || missing+=("the /ship-spec current-monolith caveat")

if (( ${#missing[@]} )); then
  printf 'REGRESSION: AGENTS.md § The Workflow missing: %s\n' "${missing[*]}" >&2
  exit 1
fi

echo "PASS: AGENTS.md § The Workflow names the canonical operative path (in order), single runner, and /ship-spec caveat"
exit 0
