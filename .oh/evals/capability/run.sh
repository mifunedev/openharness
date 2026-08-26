#!/usr/bin/env bash
set -euo pipefail

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

Score preview (no write):
  --success <V> --cost-time <V> --unattended <V> [--basis <text>]
                    validate the triad (V is one of PASS|PARTIAL|FAIL) and print
                    the deterministic task score (mean; PASS=2 PARTIAL=1 FAIL=0)
                    WITHOUT touching the scoreboard. A missing or out-of-enum
                    axis exits non-zero and prints no score (never fabricated).

Score + overwrite a task's row:
  --task <CB-id> --success <V> --cost-time <V> --unattended <V>
                 [--basis <text>] [--base <ref>] [--check <cmd>] [--dry-run]
                    score CB-<id> from the validated triad, read the prior score
                    for that id (default: current RESULTS.md; --base <ref> reads
                    git show <ref>:.oh/evals/capability/RESULTS.md), compute the
                    delta, classify capability-improved vs machinery-added, then
                    ATOMICALLY overwrite ONLY that task's row (overwrite-per-id;
                    never append) and recompute the suite-score comment. The row
                    records the 3 axes + score + a delta/machinery note in basis.
                    --dry-run prints the would-be row + suite comment, no write.
                    The runner is fully task-agnostic (no per-task-id branching).

  --check <cmd>     OPTIONAL success-signal check (e.g. a task's runnable probe:
                    'bash .oh/evals/probes/repo-map-contract.sh'). The command is
                    run from the repo root and its exit code is recorded as
                    EVIDENCE (check=PASS|SKIPPED|FAIL: 0->PASS, 2->SKIPPED, else
                    FAIL) in the row basis / preview line. It NEVER sets or
                    overrides a judgment axis — the operator still supplies the
                    triad (the benchmark stays semi-automated). A failing check
                    does not abort the write; it is honestly recorded.
EOF
}

validate_schema() {
  local fails=()

  if [[ ! -f "$RESULTS" ]]; then
    echo "FAIL: scoreboard absent: $RESULTS" >&2
    return 1
  fi

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


axis_points() {
  case "$1" in
    PASS)    echo 2 ;;
    PARTIAL) echo 1 ;;
    FAIL)    echo 0 ;;
    *)       echo "run.sh: internal: unvalidated axis value '$1'" >&2; return 1 ;;
  esac
}

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

compute_score() {
  local a b c
  a="$(axis_points "$1")"
  b="$(axis_points "$2")"
  c="$(axis_points "$3")"
  awk -v x="$a" -v y="$b" -v z="$c" 'BEGIN{ printf "%.2f\n", (x + y + z) / 3 }'
}

validate_triad() {
  local bad=0
  validate_axis --success    "$SUCCESS"    || bad=1
  validate_axis --cost-time  "$COST_TIME"  || bad=1
  validate_axis --unattended "$UNATTENDED" || bad=1
  if (( bad )); then
    return 1
  fi
  return 0
}

run_check() {
  local cmd="$1" code
  set +e
  ( cd "$ROOT" && bash -c "$cmd" ) 1>&2
  code=$?
  set -e
  case "$code" in
    0)   echo "PASS" ;;
    2)   echo "SKIPPED" ;;
    *)   echo "FAIL" ;;
  esac
}

score_task() {
  validate_triad || return 1
  local score check_suffix=""
  score="$(compute_score "$SUCCESS" "$COST_TIME" "$UNATTENDED")"
  if [[ -n "$CHECK" ]]; then check_suffix=" check=$(run_check "$CHECK")"; fi
  printf 'score=%s success=%s cost-time=%s unattended=%s%s%s\n' \
    "$score" "$SUCCESS" "$COST_TIME" "$UNATTENDED" "${TASK:+ task=$TASK}" "$check_suffix"
  return 0
}


row_field() {
  awk -F'|' -v f="$2" '{ gsub(/^[[:space:]]+|[[:space:]]+$/, "", $f); print $f }' <<<"$1"
}

prior_score_for() {
  local id="$1" content row
  if [[ -n "$BASE" ]]; then
    content="$(git -C "$ROOT" show "${BASE}:.oh/evals/capability/RESULTS.md" 2>/dev/null || true)"
  else
    content="$(cat "$RESULTS")"
  fi
  row="$(grep -E "^\|[[:space:]]*${id}[[:space:]]*\|" <<<"$content" | head -1 || true)"
  [[ -n "$row" ]] || { printf ''; return 0; }
  row_field "$row" 7
}

classify_delta() {
  awk -v n="$1" -v p="$2" 'BEGIN{
    d = n - p
    if      (d >  0.001) print "capability-improved"
    else if (d < -0.001) print "capability-regressed"
    else                 print "machinery-added"
  }'
}

recompute_suite() {
  local tid="$1" tscore="$2" line id sc mean list=""
  local -a scores=()
  while IFS= read -r line; do
    id="$(row_field "$line" 2)"
    [[ "$id" =~ ^CB-[0-9]+$ ]] || continue
    if [[ "$id" == "$tid" ]]; then sc="$tscore"; else sc="$(row_field "$line" 7)"; fi
    scores+=("$sc")
    if [[ -z "$list" ]]; then list="$sc"; else list="$list, $sc"; fi
  done < <(grep -E '^\|[[:space:]]*CB-[0-9]+[[:space:]]*\|' "$RESULTS")
  mean="$(printf '%s\n' "${scores[@]}" | awk '{ s += $1; n++ } END { if (n > 0) printf "%.2f", s / n; else printf "0.00" }')"
  printf '<!-- suite score = %s / 2.00 = mean(%s) · PASS=2 PARTIAL=1 FAIL=0; SKIPPED a task only when the capability is absent from the eval environment -->' \
    "$mean" "$list"
}

write_row() {
  local id="$TASK"

  local nrows
  nrows="$(grep -cE "^\|[[:space:]]*${id}[[:space:]]*\|" "$RESULTS" || true)"
  if (( nrows == 0 )); then
    echo "run.sh: no existing scoreboard row for $id — refusing to append (overwrite-per-id; do not add/renumber CB tasks)" >&2
    return 1
  elif (( nrows > 1 )); then
    echo "run.sh: $id already has $nrows rows — scoreboard violates overwrite-per-id; aborting" >&2
    return 1
  fi

  local new_score prior class delta note basis prior_basis existing_row check_result
  new_score="$(compute_score "$SUCCESS" "$COST_TIME" "$UNATTENDED")"
  prior="$(prior_score_for "$id")"

  existing_row="$(grep -E "^\|[[:space:]]*${id}[[:space:]]*\|" "$RESULTS" | head -1 || true)"
  prior_basis="$(row_field "$existing_row" 8)"
  prior_basis="${prior_basis% · Δ *}"

  if [[ -n "$BASIS" ]]; then basis="$BASIS"; else basis="$prior_basis"; fi

  if [[ -n "$prior" ]]; then
    delta="$(awk -v n="$new_score" -v p="$prior" 'BEGIN{ printf "%+.2f", n - p }')"
    class="$(classify_delta "$new_score" "$prior")"
    note="Δ ${delta} ${class} vs ${prior} baseline"
  else
    note="Δ baseline established (no prior score in ${BASE:-RESULTS.md})"
  fi
  if [[ -n "$CHECK" ]]; then
    check_result="$(run_check "$CHECK")"
    note="${note} · check=${check_result}"
  fi
  basis="${basis} · ${note}"

  if [[ "$basis" == *"|"* ]]; then
    echo "run.sh: basis must not contain '|' (breaks the RESULTS.md table row)" >&2
    return 1
  fi

  local now new_row suite_comment
  now="$(date -u +%Y-%m-%d)"
  new_row="| ${id} | ${now} | ${SUCCESS} | ${COST_TIME} | ${UNATTENDED} | ${new_score} | ${basis} |"
  suite_comment="$(recompute_suite "$id" "$new_score")"

  if (( DRY_RUN )); then
    printf '%s\n%s\n' "$new_row" "$suite_comment"
    echo "dry-run: ${id} ${SUCCESS}/${COST_TIME}/${UNATTENDED} score=${new_score} (${note})" >&2
    return 0
  fi

  TMP="$RESULTS.tmp.$$"
  {
    while IFS= read -r line || [[ -n "$line" ]]; do
      if [[ "$line" =~ ^[|][[:space:]]*${id}[[:space:]]*[|] ]]; then
        printf '%s\n' "$new_row"
      elif [[ "$line" == *"<!-- suite score = "* ]]; then
        printf '%s\n' "$suite_comment"
      else
        printf '%s\n' "$line"
      fi
    done < "$RESULTS"
  } > "$TMP"
  mv -f "$TMP" "$RESULTS"
  TMP=""

  echo "wrote ${id}: ${SUCCESS}/${COST_TIME}/${UNATTENDED} score=${new_score} (${note})" >&2
  printf '%s\n' "$new_row"
  return 0
}

TMP=""
trap '[[ -n "${TMP:-}" ]] && rm -f "$TMP"' EXIT

MODE=""
TASK=""
SUCCESS=""
COST_TIME=""
UNATTENDED=""
BASIS=""
BASE=""
CHECK=""
DRY_RUN=0
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
    --base)
      [[ $# -ge 2 ]] || { echo "run.sh: --base requires a git <ref> value" >&2; exit 64; }
      BASE="$2"; shift 2 ;;
    --check)
      [[ $# -ge 2 ]] || { echo "run.sh: --check requires a command value" >&2; exit 64; }
      CHECK="$2"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
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
    if [[ -n "$TASK" ]]; then
      [[ "$TASK" =~ ^CB-[0-9]+$ ]] \
        || { echo "run.sh: --task must be a CB-<id> (matching CB-[0-9]+); got '$TASK'" >&2; exit 64; }
      validate_triad || exit 1
      if write_row; then exit 0; else exit 1; fi
    elif [[ -n "$SUCCESS$COST_TIME$UNATTENDED$BASIS" ]]; then
      if score_task; then exit 0; else exit 1; fi
    else
      usage >&2
      exit 64
    fi ;;
esac
