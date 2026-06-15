#!/usr/bin/env bash
# tier: A
# source: issue #160 — /loop runner contract
# desc: PINS the /loop runner skill's contract literals in .claude/skills/loop/SKILL.md — the --start/--dry-run/--max-iters args, the context/rules/loop.md route source, the "final STATUS: line is the only routing signal" rule, the honest-halt + invariant-5 wording, and the /autopilot non-interference clause. A future editor who renames or drops one of these silently guts the runner's contract; this probe flips REGRESSION so it can't (honors the eval-probe literal-coupling lesson).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SKILL="$ROOT/.claude/skills/loop/SKILL.md"

if [[ ! -f "$SKILL" ]]; then
  echo "SKIPPED: /loop skill absent: $SKILL" >&2
  exit 2
fi

missing=()

# Fixed-string contract literals (backticks/colons/slashes — match literally, no regex).
declare -a LITERALS=(
  '--dry-run'
  '--start'
  '--max-iters'
  'context/rules/loop.md'
  'the final `STATUS:` line is the only routing signal'
  'halts the walk'
  'does not modify `/autopilot`'
  'invariant 5'
)

for lit in "${LITERALS[@]}"; do
  grep -qF -- "$lit" "$SKILL" || missing+=("contract literal: $lit")
done

# Frontmatter must declare the skill name.
grep -qE '^name: loop$' "$SKILL" || missing+=("frontmatter: name: loop")

if [[ ${#missing[@]} -gt 0 ]]; then
  echo "REGRESSION: /loop runner contract literal(s) missing from $SKILL:" >&2
  for m in "${missing[@]}"; do
    echo "  - $m" >&2
  done
  exit 1
fi

echo "PASS: /loop runner contract literals present in .claude/skills/loop/SKILL.md" >&2
exit 0
