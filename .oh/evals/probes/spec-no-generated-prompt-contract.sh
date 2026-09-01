#!/usr/bin/env bash
# tier: A
# source: issue #926 — a persisted copy of a template drifts from the template
# desc: the durable task contract is prd.md + prd.json + progress.txt; no generated prompt.md
#       is written, verified, or required, and the launch prompt is rendered at execution time
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

PLAN=".oh/skills/spec/references/plan.md"
EXECUTE=".oh/skills/spec/references/execute.md"
SPEC=".oh/skills/spec/SKILL.md"
TEMPLATE=".oh/skills/spec/templates/task-prompt.md"
TASKS_README=".oh/tasks/README.md"

for f in "$PLAN" "$EXECUTE" "$SPEC" "$TEMPLATE" "$TASKS_README"; do
  [[ -f "$f" ]] || { echo "SKIPPED: required file absent: $f" >&2; exit 2; }
done

failures=()

# The template survives — it is the render source, not an artifact.
grep -qiF 'template' "$TEMPLATE" \
  || failures+=("the task prompt no longer identifies itself as a render-time template")
grep -qF 'Render the launch prompt now; do not persist it' "$EXECUTE" \
  || grep -qF 'rendered at execution time' "$EXECUTE" \
  || failures+=("execute.md does not render the launch prompt at execution time")

# No surface may require, verify, or write the generated artifact.
generated="prompt""\\.md"
for f in "$PLAN" "$EXECUTE" "$SPEC" "$TASKS_README"; do
  hits="$(grep -nE "\\.oh/tasks/[^ \`]*/$generated|\\\$f\" .*$generated" "$f" || true)"
  [[ -n "$hits" ]] && failures+=("$f still names a task-folder prompt artifact: $hits")
done

# The three-file contract is what gets verified.
grep -qF 'for f in prd.md prd.json progress.txt; do' "$PLAN" \
  || failures+=("plan.md does not verify the three-file contract")
grep -qF 'three-file contract' "$EXECUTE" \
  || failures+=("execute.md does not name the three-file contract as its precondition")

# And the reason is written down, so it is not reintroduced as a convenience.
grep -qF 'drift' "$PLAN" \
  || failures+=("plan.md does not record why the generated copy was retired")

# Repository-wide: nothing under the task surface may carry the retired artifact.
tracked="$(git ls-files -- '.oh/tasks/*/'"prompt"'.md' || true)"
[[ -n "$tracked" ]] && failures+=("a generated task prompt is still tracked: $tracked")

if ((${#failures[@]})); then
  printf 'REGRESSION: %s\n' "${failures[@]}" >&2
  exit 1
fi

echo "PASS: the durable task contract is prd.md + prd.json + progress.txt; the launch prompt is rendered, never persisted" >&2
exit 0
