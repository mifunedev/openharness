#!/usr/bin/env bash
# tier: A
# source: issue #926 — the planner predicts, the diff decides
# desc: /spec execute derives final knowledge impact from the ACTUAL changed paths plus page
#       dependency metadata via the one shared primitive, and resolves every impacted page to
#       exactly one of UPDATED / REVERIFIED / NOT-AFFECTED
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
EXECUTE="$ROOT/.oh/skills/spec/references/execute.md"
SPEC="$ROOT/.oh/skills/spec/SKILL.md"
IMPACT="$ROOT/.oh/skills/wiki/scripts/knowledge-impact.sh"

for f in "$EXECUTE" "$SPEC" "$IMPACT"; do
  [[ -f "$f" ]] || { echo "SKIPPED: required file absent: $f" >&2; exit 2; }
done

failures=()

# The gate exists and is fed by the real diff.
grep -qF '### 6. Actual Knowledge Impact' "$EXECUTE" \
  || failures+=("execute.md has no Actual Knowledge Impact gate")
grep -qF 'git diff --name-only' "$EXECUTE" \
  || failures+=("execute.md's knowledge gate does not read the actual changed paths")
grep -qF 'knowledge-impact.sh \' "$EXECUTE" \
  || grep -qF 'knowledge-impact.sh --changed' "$EXECUTE" \
  || failures+=("execute.md does not call knowledge-impact.sh with the changed-path set")

# Three explicit terminal states, and no silent fourth.
for state in '`UPDATED`' '`REVERIFIED`' '`NOT-AFFECTED (<reason>)`'; do
  grep -qF -- "$state" "$EXECUTE" || failures+=("execute.md does not define the $state page state")
done
grep -qF 'is not a state, it is a skipped page' "$EXECUTE" \
  || failures+=("execute.md allows a reasonless NOT-AFFECTED")

# The prediction must be explicitly demoted.
grep -qF 'stops being authoritative' "$EXECUTE" \
  || failures+=("execute.md still treats the planner's prediction as the oracle")
grep -qF 'the planner predicts, the diff decides' "$SPEC" \
  || grep -qF 'The planner predicts, the diff decides' "$SPEC" \
  || failures+=("the /spec dispatcher does not state that the diff decides")

# Invalidation logic lives in the knowledge primitive, not duplicated in /spec.
grep -qF 'the one implementation of dependency-aware' "$EXECUTE" \
  || failures+=("execute.md does not defer invalidation to the knowledge primitive")

# The primitive really accepts the changed-path mode.
grep -qF -- '--changed' "$IMPACT" \
  || failures+=("knowledge-impact.sh has no --changed mode for the actual diff")

# Behavioral: --changed must select on declared dependencies, not on everything.
hit="$(bash "$IMPACT" --root "$ROOT" --format slugs --changed .oh/skills/spec/references/execute.md || true)"
grep -qx 'plan-vs-built-reconciliation' <<<"$hit" \
  || failures+=("--changed did not flag the page that declares the changed path as a source (got: '${hit:-none}')")

miss="$(bash "$IMPACT" --root "$ROOT" --format slugs --changed .oh/evals/probes/spec-execute-knowledge-impact.sh || true)"
if [[ -n "$miss" ]]; then
  failures+=("--changed flagged pages for a path no page declares: $miss")
fi

if ((${#failures[@]})); then
  printf 'REGRESSION: %s\n' "${failures[@]}" >&2
  exit 1
fi

echo "PASS: /spec execute derives knowledge impact from the actual diff through the shared primitive and resolves every page to one explicit state" >&2
exit 0
