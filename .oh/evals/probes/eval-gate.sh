#!/usr/bin/env bash
# tier: A
# source: retro lesson 2026-06-11 (eval-gate)
# desc: the eval gate keys on the green→red delta + the runner exit code, never on the bare
#       presence of a REGRESSION row. The rule lives with whoever RUNS the gate: that moved
#       from autopilot §6 to the build path's own /eval gate in spec-simplification US-002,
#       and moved again with that path when /ship-spec was absorbed into /spec execute (US-003).
#       Issue #816. The autopilot half of this assertion was dropped in 0.3.0 when autopilot
#       was removed; the rule is asserted on /spec execute, its sole owner and runner.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SPEC="$ROOT/.claude/skills/spec/references/execute.md"

for f in "$SPEC"; do
  if [[ ! -f "$f" ]]; then
    echo "SKIPPED: required file absent: $f" >&2
    exit 2
  fi
done

# --- the rule, on the surface that runs the gate ---------------------------
# The gate now lives inside execute.md's build ⇄ audit loop rather than a numbered stage.
spec_section=$(awk '
  /^### 5\. `build ⇄ audit`/ {f=1; print; next}
  f && /^### / {f=0}
  f {print}
' "$SPEC")

if [[ -z "$spec_section" ]]; then
  echo "REGRESSION: could not locate the build ⇄ audit section in $SPEC" >&2
  exit 1
fi

# Negative assertion: the old bare-presence gate rule must be gone.
if grep -qE 'Any[[:space:]]+.?REGRESSION' <<<"$spec_section"; then
  echo "REGRESSION: /spec execute's eval gate still uses the bare \"Any \`REGRESSION\`\" rule (must key on delta + exit code)" >&2
  exit 1
fi

# Positive assertions (AND-logic): the corrected vocabulary must be present.
missing=()
grep -qiE 'green.*red'         <<<"$spec_section" || missing+=("green->red language")
grep -qi 'exit'                <<<"$spec_section" || missing+=("runner exit-code language")
grep -qi 'pre-existing'        <<<"$spec_section" || missing+=("pre-existing-red carve-out")
grep -qi 'delta\|unchanged'    <<<"$spec_section" || missing+=("delta/unchanged language")

if (( ${#missing[@]} )); then
  echo "REGRESSION: the eval gate's delta/exit-code rule is broken: ${missing[*]}" >&2
  exit 1
fi

echo "PASS: /spec execute keys the eval gate on green->red delta + runner exit code (no bare-REGRESSION gate)" >&2
exit 0
