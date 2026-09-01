#!/usr/bin/env bash
# tier: A
# source: issue #926 — an approved plan may not become a materially different PRD silently
# desc: /spec plan records Plan Reconciliation and STOPS for operator re-approval when
#       grounding materially changes the approved intent; /spec execute refuses a folder
#       whose reconciliation says the intent was not preserved
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PLAN="$ROOT/.oh/skills/spec/references/plan.md"
EXECUTE="$ROOT/.oh/skills/spec/references/execute.md"
SPEC="$ROOT/.oh/skills/spec/SKILL.md"

for f in "$PLAN" "$EXECUTE" "$SPEC"; do
  [[ -f "$f" ]] || { echo "SKIPPED: required file absent: $f" >&2; exit 2; }
done

failures=()

# The block itself, with every field a downstream gate reads.
for lit in \
  '## Plan Reconciliation' \
  '- **Source plan**: `<path>`' \
  '- **Intent preserved**: YES | NO' \
  '- **Material deviations**: `none` or list' \
  '- **Constraints discovered during grounding**: `none` or list'
do
  grep -qF -- "$lit" "$PLAN" || failures+=("plan.md missing reconciliation field: $lit")
done

# The gate must STOP, not warn.
grep -qF 'stop before execution' "$PLAN" \
  || failures+=("plan.md's reconciliation gate does not stop before execution")
grep -qF 'require operator re-approval' "$PLAN" \
  || failures+=("plan.md does not require operator re-approval on a material deviation")
grep -qF 'material' "$PLAN" \
  || failures+=("plan.md does not distinguish a material deviation from a discovered constraint")

# The dispatcher must state that approval covers the approved intent only.
grep -qF 'not whatever grounding turns it' "$SPEC" \
  || failures+=("the /spec dispatcher no longer bounds the approval to the approved intent")

# Execute is the enforcement point: a NO must not flow through.
grep -qF 'Intent preserved: YES' "$EXECUTE" \
  || failures+=("execute.md does not check the reconciliation verdict as a precondition")
grep -qF 'DRAFT-BLOCKED(reconciliation)' "$EXECUTE" \
  || failures+=("execute.md has no reconciliation blocked state")
grep -qF 'route back to' "$EXECUTE" \
  || failures+=("execute.md does not route a failed precondition back to /spec plan")

if ((${#failures[@]})); then
  printf 'REGRESSION: %s\n' "${failures[@]}" >&2
  exit 1
fi

echo "PASS: a materially changed approved intent stops for re-approval and cannot flow into /spec execute" >&2
exit 0
