#!/usr/bin/env bash
# tier: A
# source: .oh/memory/MEMORY.md 2026-06-11 (eval-gate)
# desc: autopilot §6 eval-gate keys on green→red delta + runner exit code, not bare REGRESSION presence
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SKILL="$ROOT/.claude/skills/autopilot/SKILL.md"

if [[ ! -f "$SKILL" ]]; then
  echo "SKIPPED: autopilot skill absent: $SKILL" >&2
  exit 2
fi

# Extract the "### 6. Eval gate" section: from its heading to the next "### " heading.
section=$(awk '
  /^### 6\. Eval gate/ {f=1; print; next}
  f && /^### / {f=0}
  f {print}
' "$SKILL")

if [[ -z "$section" ]]; then
  echo "REGRESSION: could not locate the '### 6. Eval gate' section in $SKILL" >&2
  exit 1
fi

# --- negative assertion: the old bare-presence gate rule must be gone ---
if grep -qE 'Any[[:space:]]+.?REGRESSION' <<<"$section"; then
  echo "REGRESSION: autopilot §6 still uses the bare \"Any \`REGRESSION\`\" gate rule (must key on delta + exit code)" >&2
  exit 1
fi

# --- positive assertions (AND-logic): corrected delta/exit-code vocabulary must be present ---
missing=()
grep -qi 'delta'        <<<"$section" || missing+=("delta")
grep -qi 'unchanged'    <<<"$section" || missing+=("unchanged")
grep -qiE 'green.*red'  <<<"$section" || missing+=("green->red language")
grep -qi 'exit'         <<<"$section" || missing+=("runner exit-code language")

if (( ${#missing[@]} )); then
  echo "REGRESSION: autopilot §6 is missing corrected-rule vocabulary: ${missing[*]}" >&2
  exit 1
fi

echo "PASS: autopilot §6 eval-gate keys on green->red delta + runner exit code (no bare-REGRESSION gate)" >&2
exit 0
