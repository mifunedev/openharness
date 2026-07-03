#!/usr/bin/env bash
# Capability benchmark runner — score ONE CB-<id> task on the three axes
# (success · cost-time · unattended) from operator-supplied, validated values,
# compute a baseline delta, classify capability-improved vs machinery-added, and
# atomically overwrite that task's row in RESULTS.md (overwrite-per-id).
#
# This is the executable substrate the `/benchmark` verdict skill consults; it is
# NOT a skill and NOT a scorer of judgment axes — values are supplied by the
# operator and validated, never fabricated. Idiom mirrors .oh/skills/eval/run.sh:
# ${BASH_SOURCE[0]} root-resolution, arg parse, atomic temp-sibling + `mv -f`.
#
# Exit codes: 0 ok · 1 schema/validation failure · 64 usage error.
set -euo pipefail

# --- path resolution from ${BASH_SOURCE[0]}, never cwd ---
# run.sh lives at .oh/evals/capability/run.sh, so its own directory IS the
# capability instrument dir; derive everything else relative to it.
CAP="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$CAP/../../.." && pwd)"
TASKS="$CAP/tasks"
RESULTS="$CAP/RESULTS.md"

usage() {
  cat <<EOF
usage: run.sh <mode>

Modes:
  -h, --help        print this usage and exit 0
  --validate        re-assert the RESULTS.md schema (canonical header tokens +
                    exactly one row per CB-<id> task) against the committed
                    scoreboard; exit 0 if intact, 1 otherwise

Scoring (--task <CB-id> ...): scores a named capability task on the three axes
from operator-supplied, validated values and overwrites that task's row in
RESULTS.md. Never fabricates a score. (Lands in a later story; see prd.json.)
EOF
}

# --- --validate: assert RESULTS.md still matches the canonical schema ---
# Canonical header tokens + exactly one row per CB task id (discovered from the
# tasks/CB-*.md specs). Exactly-one-row catches appended duplicates — the
# overwrite-per-id house style that a naive append would silently break.
validate_schema() {
  local fails=()

  if [[ ! -f "$RESULTS" ]]; then
    echo "FAIL: scoreboard absent: $RESULTS" >&2
    return 1
  fi

  # (a) canonical header row with all expected column tokens.
  local header
  header="$(grep -E '^\|[[:space:]]*task[[:space:]]*\|' "$RESULTS" | head -1 || true)"
  if [[ -z "$header" ]]; then
    fails+=("no table header row beginning with '| task |'")
  else
    local tok
    for tok in task success cost-time unattended score basis; do
      grep -qE "\b${tok}\b" <<<"$header" || fails+=("header missing token '$tok'")
    done
  fi

  # (b) exactly one scoreboard row per CB task id.
  shopt -s nullglob
  local task_files=("$TASKS"/CB-*.md)
  shopt -u nullglob
  if (( ${#task_files[@]} == 0 )); then
    fails+=("no CB-*.md task specs found in $TASKS")
  else
    local id n
    while read -r id; do
      [[ -n "$id" ]] || continue
      n="$(grep -cE "^\|[[:space:]]*${id}[[:space:]]*\|" "$RESULTS" || true)"
      if (( n == 0 )); then
        fails+=("task id $id has no scoreboard row")
      elif (( n > 1 )); then
        fails+=("task id $id has $n scoreboard rows (overwrite-per-id => exactly one)")
      fi
    done < <(grep -hoE '^id:[[:space:]]*CB-[0-9]+' "${task_files[@]}" 2>/dev/null | awk '{print $2}')
  fi

  if (( ${#fails[@]} > 0 )); then
    echo "FAIL: RESULTS.md schema invalid:" >&2
    printf '  - %s\n' "${fails[@]}" >&2
    return 1
  fi
  echo "PASS: RESULTS.md schema intact — canonical header + one row per CB task id" >&2
  return 0
}

# --- arg parse ---
MODE=""
TASK=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)  MODE="help"; shift ;;
    --validate) MODE="validate"; shift ;;
    --task)
      [[ $# -ge 2 ]] || { echo "run.sh: --task requires a CB-<id> value" >&2; exit 64; }
      TASK="$2"; shift 2 ;;
    *)
      echo "run.sh: unknown arg: $1" >&2
      usage >&2
      exit 64 ;;
  esac
done

case "$MODE" in
  help)
    usage
    exit 0 ;;
  validate)
    if validate_schema; then exit 0; else exit 1; fi ;;
  "")
    # Scoring (--task <CB-id> ...) lands in a later story; the skeleton wires
    # only --help and --validate. A supplied --task is parsed but not yet scored.
    if [[ -n "$TASK" ]]; then
      echo "run.sh: scoring not yet implemented (see prd.json); use --validate or --help" >&2
    else
      usage >&2
    fi
    exit 64 ;;
esac
