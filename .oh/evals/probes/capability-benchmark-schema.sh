#!/usr/bin/env bash
# tier: A
# source: issue #167 — capability benchmark instrument
# desc: guards the capability-benchmark structural integrity — a README spec, >=3 CB-*.md task specs (each with an `id:` line + `## Task`/`## Success signal`/`## Rubric` sections), a scoreboard with the canonical header, and a scoreboard row per task id — so the harness's progress-ceiling objective anchor can't silently rot
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
CAP="$ROOT/.oh/evals/capability"
TASKS="$CAP/tasks"
RESULTS="$CAP/RESULTS.md"

# Assertion 1 — instrument not present on this branch => SKIPPED (not a regression).
if [[ ! -f "$CAP/README.md" ]]; then
  echo "SKIPPED: capability-benchmark instrument absent: $CAP/README.md" >&2
  exit 2
fi

fails=()

# Assertion 2 — >=3 task specs matching CB-*.md.
shopt -s nullglob
task_files=("$TASKS"/CB-*.md)
shopt -u nullglob
if (( ${#task_files[@]} < 3 )); then
  fails+=("expected >=3 CB-*.md task specs in $TASKS, found ${#task_files[@]}")
fi

# Assertion 3 — each CB-*.md carries a frontmatter `id:` line and the three sections.
for f in "${task_files[@]}"; do
  grep -qE '^id:[[:space:]]*CB-[0-9]+' "$f" || fails+=("$f: missing frontmatter '^id: CB-<n>' line")
  grep -qE '^## Task[[:space:]]*$' "$f" || fails+=("$f: missing '## Task' section")
  grep -qE '^## Success signal[[:space:]]*$' "$f" || fails+=("$f: missing '## Success signal' section")
  grep -qE '^## Rubric[[:space:]]*$' "$f" || fails+=("$f: missing '## Rubric' section")
done

# Assertion 4 — scoreboard exists with the canonical header tokens.
if [[ ! -f "$RESULTS" ]]; then
  fails+=("scoreboard absent: $RESULTS")
else
  header=$(grep -E '^\|[[:space:]]*task[[:space:]]*\|' "$RESULTS" | head -1 || true)
  if [[ -z "$header" ]]; then
    fails+=("$RESULTS: no table header row beginning with '| task |'")
  else
    for tok in task success cost-time unattended; do
      grep -qE "\b${tok}\b" <<<"$header" || fails+=("$RESULTS: header line missing token '$tok'")
    done
  fi
fi

# Assertion 5 — drift guard: every task id has a scoreboard row.
if [[ -f "$RESULTS" ]]; then
  while read -r id; do
    [[ -n "$id" ]] || continue
    grep -qE "^\|[[:space:]]*${id}[[:space:]]*\|" "$RESULTS" \
      || fails+=("task id $id has no scoreboard row in $RESULTS")
  done < <(grep -hoE '^id:[[:space:]]*(CB-[0-9]+)' "${task_files[@]}" 2>/dev/null | awk '{print $2}')
fi

if (( ${#fails[@]} > 0 )); then
  echo "REGRESSION: capability-benchmark structural integrity broken:" >&2
  printf '  - %s\n' "${fails[@]}" >&2
  exit 1
fi

echo "PASS: capability benchmark intact — README + ${#task_files[@]} CB-*.md specs (id + Task/Success signal/Rubric) + scoreboard with a row per task" >&2
exit 0
