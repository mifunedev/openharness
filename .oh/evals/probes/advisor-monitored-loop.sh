#!/usr/bin/env bash
# tier: A
# source: conversation 2026-06-19 (advisor-monitored ralph loop pattern, issue #257)
# desc: the /advisor skill (.oh/skills/advisor/SKILL.md) § Pipeline Variants codifies the "Monitored async loop" variant — Advisor owns the STATUS watch, the loop surfaces blocks, finalize routes through the promotable gate
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
RULE="$ROOT/.oh/skills/advisor/SKILL.md"

if [[ ! -f "$RULE" ]]; then
  echo "SKIPPED: advisor skill absent: $RULE" >&2
  exit 2
fi

# Extract the "## Pipeline Variants" section: from its heading to the next "## " heading.
section=$(awk '
  /^## Pipeline Variants/ {f=1; print; next}
  f && /^## / {f=0}
  f {print}
' "$RULE")

if [[ -z "$section" ]]; then
  echo "REGRESSION: could not locate the '## Pipeline Variants' section in $RULE" >&2
  exit 1
fi

# Positive assertions (AND-logic): the variant + its three load-bearing rules must be present.
missing=()
grep -qiF 'Monitored async loop'                  <<<"$section" || missing+=("Monitored async loop variant name")
grep -qiF 'owns the terminal watch'               <<<"$section" || missing+=("Advisor-owns-the-watch rule")
grep -qiF 'surfaces blocks'                        <<<"$section" || missing+=("loop-surfaces-blocks property")
grep -qiF 'finalizes through the promotable gate'  <<<"$section" || missing+=("finalize-via-promotable-gate rule")

if (( ${#missing[@]} )); then
  printf 'REGRESSION: advisor SKILL.md "Monitored async loop" variant missing: %s\n' "${missing[*]}" >&2
  exit 1
fi

echo "PASS: Monitored async loop variant codified (own-watch + surfaces-blocks + promotable-gate finalize)"
exit 0
