#!/usr/bin/env bash
# tier: A
# source: .oh/memory/MEMORY.md 2026-06-11 (eval-gate)
# desc: the eval gate keys on the green→red delta + the runner exit code, never on the bare
#       presence of a REGRESSION row. The rule lives with whoever RUNS the gate: that moved
#       from autopilot §6 to /ship-spec Stage 11 in spec-simplification US-002 (issue #816),
#       when autopilot stopped running /eval and became a pure deferral. Both halves are
#       asserted — the rule on its owner, and the deferral on autopilot — so the lesson
#       cannot be lost by relocating it again without moving this probe too.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SKILL="$ROOT/.claude/skills/autopilot/SKILL.md"
SHIP="$ROOT/.claude/skills/ship-spec/SKILL.md"

for f in "$SKILL" "$SHIP"; do
  if [[ ! -f "$f" ]]; then
    echo "SKIPPED: required file absent: $f" >&2
    exit 2
  fi
done

# --- the rule, on the surface that runs the gate ---------------------------
ship_section=$(awk '
  /^### Stage 11 — `\/eval` gate/ {f=1; print; next}
  f && /^### / {f=0}
  f {print}
' "$SHIP")

if [[ -z "$ship_section" ]]; then
  echo "REGRESSION: could not locate the '### Stage 11 — /eval gate' section in $SHIP" >&2
  exit 1
fi

# Negative assertion: the old bare-presence gate rule must be gone.
if grep -qE 'Any[[:space:]]+.?REGRESSION' <<<"$ship_section"; then
  echo "REGRESSION: /ship-spec Stage 11 still uses the bare \"Any \`REGRESSION\`\" gate rule (must key on delta + exit code)" >&2
  exit 1
fi

# Positive assertions (AND-logic): the corrected vocabulary must be present.
missing=()
grep -qiE 'green.*red'         <<<"$ship_section" || missing+=("green->red language")
grep -qi 'exit'                <<<"$ship_section" || missing+=("runner exit-code language")
grep -qi 'pre-existing'        <<<"$ship_section" || missing+=("pre-existing-red carve-out")
grep -qi 'delta\|unchanged'    <<<"$ship_section" || missing+=("delta/unchanged language")

# --- the deferral, on the surface that no longer runs the gate -------------
ap_section=$(awk '
  /^### 6\. Eval gate/ {f=1; print; next}
  f && /^### / {f=0}
  f {print}
' "$SKILL")

if [[ -z "$ap_section" ]]; then
  missing+=("autopilot no longer has a '### 6. Eval gate' section to state where the gate ran")
else
  grep -qi 'do \*\*not\*\* re-run\|does not re-run' <<<"$ap_section" \
    || missing+=("autopilot §6 does not say the gate already ran inside /ship-spec and must not be re-run")
  # If autopilot starts running /eval again, the rule has to come back with it.
  if grep -qE '^\s*/eval\s*$' <<<"$ap_section"; then
    missing+=("autopilot §6 invokes /eval again — the delta/exit-code rule must be restated here if the gate moves back")
  fi
fi

if (( ${#missing[@]} )); then
  echo "REGRESSION: the eval gate's delta/exit-code rule is broken: ${missing[*]}" >&2
  exit 1
fi

echo "PASS: /ship-spec Stage 11 keys the eval gate on green->red delta + runner exit code (no bare-REGRESSION gate), and autopilot §6 defers to it rather than re-running" >&2
exit 0
