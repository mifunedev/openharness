#!/usr/bin/env bash
# tier: A
# source: issue #173 — wire the executable-loop `repeat` node (cycle-closing edge)
# desc: PINS the runner-applied `repeat` continuation gate. loop.md § 2 must give repeat's row the `CYCLE-CONTINUE` → ideate token (the cycle-closing edge, the one forward edge that was tokenless), § 7 must mark repeat ☑ (wired, not ☐), and .claude/skills/loop/SKILL.md must teach the runner to apply repeat as a mechanical continuation gate emitting STATUS: CYCLE-CONTINUE. A revert to the tokenless "→ ideate" row, a ☐ regression, or dropping the runner handling flips this REGRESSION (eval-probe literal-coupling discipline).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOOP="$ROOT/context/rules/loop.md"
SKILL="$ROOT/.claude/skills/loop/SKILL.md"

# Not applicable when the manifest is absent (cold runner / pre-merge main).
[ -f "$LOOP" ] || { echo "SKIPPED: loop.md manifest absent: $LOOP" >&2; exit 2; }

missing=()

# --- § 2: repeat's decision-tree row carries the CYCLE-CONTINUE → ideate token ---
# Scope strictly to the § 2 table so § 7 / footer prose cannot satisfy the check.
section2="$(awk '/^## 2\./{f=1} /^## 3\./{f=0} f' "$LOOP")"
repeat_row="$(printf '%s\n' "$section2" | grep -E '^\| \*\*repeat\*\* \|' || true)"
if [ -z "$repeat_row" ]; then
  missing+=("loop.md § 2: no | **repeat** | decision-tree row found")
else
  printf '%s\n' "$repeat_row" | grep -qE '`CYCLE-CONTINUE`[[:space:]]*→[[:space:]]*ideate' \
    || missing+=("loop.md § 2 repeat row missing the \`CYCLE-CONTINUE\` → ideate route (cycle-closing edge still tokenless?)")
fi

# --- § 7: repeat is marked wired (☑), not ☐ ---
section7="$(awk '/^## 7\./{f=1} /^## See Also/{f=0} f' "$LOOP")"
repeat7="$(printf '%s\n' "$section7" | grep -E '^\| repeat \|' || true)"
if [ -z "$repeat7" ]; then
  missing+=("loop.md § 7: no | repeat | build-state row found")
else
  printf '%s\n' "$repeat7" | grep -qF '☑' || missing+=("loop.md § 7 repeat row not marked wired (☑)")
  if printf '%s\n' "$repeat7" | grep -qF '☐'; then
    missing+=("loop.md § 7 repeat row still marked unwired (☐)")
  fi
fi

# --- /loop SKILL: runner applies repeat as a continuation gate emitting CYCLE-CONTINUE ---
if [ -f "$SKILL" ]; then
  grep -qF 'CYCLE-CONTINUE' "$SKILL" || missing+=("/loop SKILL missing the CYCLE-CONTINUE token")
  grep -qF 'continuation gate' "$SKILL" || missing+=("/loop SKILL missing the 'continuation gate' handling")
else
  missing+=("/loop SKILL absent: $SKILL")
fi

if [ ${#missing[@]} -gt 0 ]; then
  echo "REGRESSION: repeat-node wiring drift:" >&2
  for m in "${missing[@]}"; do echo "  - $m" >&2; done
  exit 1
fi

echo "PASS: repeat node wired — CYCLE-CONTINUE → ideate (§ 2), ☑ (§ 7), runner continuation gate (/loop SKILL)" >&2
exit 0
