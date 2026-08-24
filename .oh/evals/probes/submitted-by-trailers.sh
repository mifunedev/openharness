#!/usr/bin/env bash
# tier: A
# source: conversation 2026-06-12 (commit attribution trailers); repointed by
#         spec-simplification US-002 (issue #816) when the ralph prompt template was deleted
# desc: the scaffold path (/spec execute) and the build path (the firstmate session-prompt
#       template) both require a Submitted-by trailer naming the ACTIVE submitter, and
#       neither hard-codes a specific model as co-author
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SPEC="$ROOT/.claude/skills/spec/references/execute.md"
PROMPT="$ROOT/.oh/skills/firstmate/templates/session-prompt.md"

for file in "$SPEC" "$PROMPT"; do
  if [[ ! -f "$file" ]]; then
    echo "SKIPPED: required file absent: $file" >&2
    exit 2
  fi
done

missing=()
grep -q 'Submitted-by:' "$SPEC" || missing+=("/spec execute scaffold commit trailer")
grep -q 'Submitted-by:' "$PROMPT" || missing+=("build session-prompt commit trailer")

# The trailer must name whoever ACTUALLY submits, not a fixed name. Both surfaces state
# this in their own words, so accept either phrasing on either file.
grep -qi 'active submitter\|active harness\|model/agent that actually' "$SPEC" \
  || missing+=("/spec execute does not tie the trailer to the active submitter")
grep -qi 'active submitter\|active harness\|model/agent that actually' "$PROMPT" \
  || missing+=("the session prompt does not tie the trailer to the active submitter")

# The trailer is MANDATORY on the build path — a merely-suggested trailer is how
# attribution silently stops happening.
grep -qi 'mandatory' "$PROMPT" || missing+=("the session prompt does not mark the Submitted-by trailer mandatory")

if grep -q 'Co-Authored-By: Claude Opus' "$SPEC"; then
  echo "REGRESSION: /spec execute still hard-codes a Claude Opus co-author trailer" >&2
  exit 1
fi

if (( ${#missing[@]} > 0 )); then
  echo "REGRESSION: Submitted-by trailer guarantee missing: ${missing[*]}" >&2
  exit 1
fi

echo "PASS: /spec execute and the build session prompt both require a mandatory Submitted-by trailer tied to the active submitter" >&2
exit 0
