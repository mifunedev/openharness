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

Scoring:
  --task <CB-id> --success <V> --cost-time <V> --unattended <V> [--basis <text>]
                    score a capability task on the three axes from
                    operator-supplied, validated values (V is one of
                    PASS|PARTIAL|FAIL) and print the task score — the mean of
                    the three axes with PASS=2 PARTIAL=1 FAIL=0. A missing or
                    out-of-enum axis exits non-zero and writes no score: values
                    are operator-supplied and validated, never fabricated. The
                    score is fully task-agnostic (no per-task-id branching).
                    (Baseline delta + RESULTS.md row overwrite land in a later
                    story; see prd.json.)
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

# --- axis validation + task-score computation ---
# Axis values are operator-supplied and validated against the closed enum
# {PASS,PARTIAL,FAIL}. A missing or out-of-enum value exits non-zero and writes
# NO score — the runner never fabricates a judgment axis (this is why the
# benchmark is *semi*-automated). The task score is the mean of the three axes
# with PASS=2 PARTIAL=1 FAIL=0, and is fully task-agnostic: there is ZERO
# per-task-id branching, so a held-out task cannot be special-cased (anti-Goodhart).

# Map a validated axis label to its point value. The caller MUST have validated
# the value first (validate_axis); an unvalidated value here is a programming bug.
axis_points() {
  case "$1" in
    PASS)    echo 2 ;;
    PARTIAL) echo 1 ;;
    FAIL)    echo 0 ;;
    *)       echo "run.sh: internal: unvalidated axis value '$1'" >&2; return 1 ;;
  esac
}

# Validate one axis value against the closed enum. $1 = flag name (for the
# message), $2 = supplied value. Empty (missing) is a fabrication-guard failure.
validate_axis() {
  local name="$1" val="$2"
  if [[ -z "$val" ]]; then
    echo "run.sh: missing required axis $name — supply one of PASS|PARTIAL|FAIL (no fabrication)" >&2
    return 1
  fi
  case "$val" in
    PASS|PARTIAL|FAIL) return 0 ;;
    *)
      echo "run.sh: invalid $name value '$val' — must be one of PASS|PARTIAL|FAIL" >&2
      return 1 ;;
  esac
}

# Mean of the three axis point values (PASS=2 PARTIAL=1 FAIL=0), formatted to two
# decimals to match the committed RESULTS.md rounding. Pure integer arithmetic in
# awk => deterministic: identical inputs yield a byte-identical score.
compute_score() {
  local a b c
  a="$(axis_points "$1")"
  b="$(axis_points "$2")"
  c="$(axis_points "$3")"
  awk -v x="$a" -v y="$b" -v z="$c" 'BEGIN{ printf "%.2f\n", (x + y + z) / 3 }'
}

# Validate the triad and print the deterministic task score. Any missing/invalid
# axis returns non-zero WITHOUT printing a score. --task and --basis are optional
# here (recorded for the row-overwrite story); the score never depends on the id.
score_task() {
  local bad=0
  validate_axis --success    "$SUCCESS"    || bad=1
  validate_axis --cost-time  "$COST_TIME"  || bad=1
  validate_axis --unattended "$UNATTENDED" || bad=1
  if (( bad )); then
    return 1
  fi
  local score
  score="$(compute_score "$SUCCESS" "$COST_TIME" "$UNATTENDED")"
  printf 'score=%s success=%s cost-time=%s unattended=%s%s\n' \
    "$score" "$SUCCESS" "$COST_TIME" "$UNATTENDED" "${TASK:+ task=$TASK}"
  return 0
}

# --- arg parse ---
MODE=""
TASK=""
SUCCESS=""
COST_TIME=""
UNATTENDED=""
BASIS=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)  MODE="help"; shift ;;
    --validate) MODE="validate"; shift ;;
    --task)
      [[ $# -ge 2 ]] || { echo "run.sh: --task requires a CB-<id> value" >&2; exit 64; }
      TASK="$2"; shift 2 ;;
    --success)
      [[ $# -ge 2 ]] || { echo "run.sh: --success requires a PASS|PARTIAL|FAIL value" >&2; exit 64; }
      SUCCESS="$2"; shift 2 ;;
    --cost-time)
      [[ $# -ge 2 ]] || { echo "run.sh: --cost-time requires a PASS|PARTIAL|FAIL value" >&2; exit 64; }
      COST_TIME="$2"; shift 2 ;;
    --unattended)
      [[ $# -ge 2 ]] || { echo "run.sh: --unattended requires a PASS|PARTIAL|FAIL value" >&2; exit 64; }
      UNATTENDED="$2"; shift 2 ;;
    --basis)
      [[ $# -ge 2 ]] || { echo "run.sh: --basis requires a text value" >&2; exit 64; }
      BASIS="$2"; shift 2 ;;
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
    # Scoring path: any of --task/--success/--cost-time/--unattended/--basis
    # requests a score. The full validated triad is required; a missing or
    # out-of-enum axis exits non-zero and prints no score (no fabrication). The
    # baseline delta + RESULTS.md row overwrite land in a later story.
    if [[ -n "$TASK$SUCCESS$COST_TIME$UNATTENDED$BASIS" ]]; then
      if score_task; then exit 0; else exit 1; fi
    else
      usage >&2
      exit 64
    fi ;;
esac
