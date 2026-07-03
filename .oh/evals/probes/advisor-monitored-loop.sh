#!/usr/bin/env bash
# tier: A
# source: conversation 2026-06-19 (advisor-monitored ralph loop pattern, issue #257)
# desc: the advisor agent (.oh/agents/advisor.md) § Pipeline variants codifies the "Monitored async ralph loop" variant — the CALLER (main loop) owns the STATUS watch (a sub-agent advisor cannot stay alive to finalize), the loop surfaces blocks, finalize routes through the promotable gate
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
RULE="$ROOT/.oh/agents/advisor.md"

if [[ ! -f "$RULE" ]]; then
  echo "SKIPPED: advisor agent absent: $RULE" >&2
  exit 2
fi

# Extract the "## Pipeline variants" section: from its heading to the next "## " heading.
section=$(awk '
  tolower($0) ~ /^## pipeline variants/ {f=1; print; next}
  f && /^## / {f=0}
  f {print}
' "$RULE")

if [[ -z "$section" ]]; then
  echo "REGRESSION: could not locate the '## Pipeline variants' section in $RULE" >&2
  exit 1
fi

# Positive assertions (AND-logic): the variant + its three load-bearing rules must be present.
missing=()
grep -qiF 'Monitored async ralph loop'             <<<"$section" || missing+=("Monitored async ralph loop variant name")
grep -qiF 'owns the sentinel watch'                <<<"$section" || missing+=("caller-owns-the-watch rule")
grep -qiF 'surfaces blocks'                         <<<"$section" || missing+=("loop-surfaces-blocks property")
grep -qiF 'finalizes through the promotable gate'  <<<"$section" || missing+=("finalize-via-promotable-gate rule")

if (( ${#missing[@]} )); then
  printf 'REGRESSION: advisor agent "Monitored async ralph loop" variant missing: %s\n' "${missing[*]}" >&2
  exit 1
fi

echo "PASS: Monitored async ralph loop variant codified (caller-owns-watch + surfaces-blocks + promotable-gate finalize)"
exit 0
