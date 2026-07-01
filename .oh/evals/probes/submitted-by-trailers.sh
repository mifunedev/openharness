#!/usr/bin/env bash
# tier: A
# source: conversation 2026-06-12 (commit attribution trailers)
# desc: ship-spec/autopilot/Ralph prompts require Submitted-by trailers for the active submitter
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SHIP="$ROOT/.claude/skills/ship-spec/SKILL.md"
PROMPT="$ROOT/.claude/skills/ship-spec/templates/prompt.md"
AUTOPILOT="$ROOT/.claude/skills/autopilot/SKILL.md"

for file in "$SHIP" "$PROMPT" "$AUTOPILOT"; do
  if [[ ! -f "$file" ]]; then
    echo "SKIPPED: required file absent: $file" >&2
    exit 2
  fi
done

missing=()
grep -q 'Submitted-by:' "$SHIP" || missing+=("ship-spec scaffold commit trailer")
grep -q 'Submitted-by:' "$PROMPT" || missing+=("Ralph prompt commit trailer")
grep -q 'Submitted-by:' "$AUTOPILOT" || missing+=("autopilot eval commit trailer")
grep -qi 'active submitter\|active harness\|RALPH_HARNESS' "$PROMPT" || missing+=("active submitter guidance in Ralph prompt")
grep -q 'RALPH_HARNESS' "$AUTOPILOT" || missing+=("autopilot uses active harness env")

if grep -q 'Co-Authored-By: Claude Opus' "$SHIP"; then
  echo "REGRESSION: ship-spec still hard-codes Claude Opus co-author trailer" >&2
  exit 1
fi

if (( ${#missing[@]} > 0 )); then
  echo "REGRESSION: Submitted-by trailer guarantee missing: ${missing[*]}" >&2
  exit 1
fi

echo "PASS: ship-spec, autopilot, and Ralph prompt require Submitted-by trailers tied to active submitter" >&2
exit 0
