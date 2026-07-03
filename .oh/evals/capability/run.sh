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

# Validate the full triad. Collect ALL axis failures before returning (so a
# missing/invalid axis message names every offender, not just the first) — the
# fabrication guard: an unvalidated triad never reaches a score or a write. The
# `|| bad=1` list and the `if (( bad ))` are both set -e exempt.
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

# Optionally run a task's success-signal check (e.g. its runnable probe) and map
# the exit code to a PASS/SKIPPED/FAIL label — recorded as EVIDENCE only. The
# runner NEVER lets this result set or override a judgment axis: the operator
# still supplies the validated triad (this is why the benchmark is *semi*-
# automated). Runs from $ROOT so a relative probe path resolves independently of
# cwd; a pure-oracle probe writes nothing. A non-zero exit is recorded honestly,
# it does NOT abort the write. Exit oracle mirrors the probes: 0=PASS 2=SKIPPED
# else=FAIL. Emits the command's own output to stderr; only the label to stdout.
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

# Validate the triad and print the deterministic task score to stdout WITHOUT
# writing the scoreboard (score-preview mode). Any missing/invalid axis returns
# non-zero WITHOUT printing a score. The score never depends on the task id. An
# optional --check is run and its label appended as evidence (never a judgment axis).
score_task() {
  validate_triad || return 1
  local score check_suffix=""
  score="$(compute_score "$SUCCESS" "$COST_TIME" "$UNATTENDED")"
  if [[ -n "$CHECK" ]]; then check_suffix=" check=$(run_check "$CHECK")"; fi
  printf 'score=%s success=%s cost-time=%s unattended=%s%s%s\n' \
    "$score" "$SUCCESS" "$COST_TIME" "$UNATTENDED" "${TASK:+ task=$TASK}" "$check_suffix"
  return 0
}

# --- baseline delta + machinery-vs-capability + atomic row overwrite (US-003) ---
# Overwrite-per-id: the runner replaces exactly ONE scoreboard row (the named CB
# task) and recomputes the suite-score comment, leaving every other line byte-for-
# byte intact. It never appends a row (git history is the time series; an appended
# row also breaks capability-benchmark-schema.sh). The whole file is rebuilt into a
# temp sibling and swapped in with a single `mv -f` so an interrupted write can
# never leave a partial scoreboard.

# Trim leading/trailing whitespace from field $2 (awk -F'|' index) of a table row
# line $1. Field 2 = task id, 7 = score, 8 = basis (rows are `| id | date | s | c
# | u | score | basis |`).
row_field() {
  awk -F'|' -v f="$2" '{ gsub(/^[[:space:]]+|[[:space:]]+$/, "", $f); print $f }' <<<"$1"
}

# Read the prior score for a task id. Default source is the current working-tree
# RESULTS.md; --base <ref> reads the scoreboard at that git ref instead (the
# counterfactual). Prints the score (e.g. 1.33) or empty if the id has no prior row.
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

# Classify the transition. Mirrors the /benchmark verdict (keys on the score, never
# inverts it): a risen task score = capability-improved; flat = machinery-added; a
# fallen score = capability-regressed. Pure numeric delta => no per-task branching.
classify_delta() {
  awk -v n="$1" -v p="$2" 'BEGIN{
    d = n - p
    if      (d >  0.001) print "capability-improved"
    else if (d < -0.001) print "capability-regressed"
    else                 print "machinery-added"
  }'
}

# Recompute the suite-score comment from every CB row's score, substituting the
# NEW score for the target id ($1=id, $2=new score). Deterministic: a pure function
# of the row scores in file order. The literal number is placed IMMEDIATELY after
# `suite score = ` so /benchmark's `grep -oE 'suite score = [0-9.]+'` reads it.
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

# Score the named CB task and atomically overwrite its row. Requires a validated
# triad (validate_triad runs first — fabrication guard). Refuses to write if the id
# has no existing row (never append/renumber). --dry-run prints the row + suite
# comment instead of writing.
write_row() {
  local id="$TASK"

  # overwrite-per-id: the row must already exist exactly once (never append; do not
  # add or renumber CB tasks — that is the task-spec authors' job, not the runner's).
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
  # drop any prior runner-appended delta note so re-writes don't accumulate them
  # (keeps the write idempotent for a fixed baseline). The ` · check=` evidence is
  # folded INSIDE the ` · Δ ` annotation below, so this one strip removes both.
  prior_basis="${prior_basis% · Δ *}"

  if [[ -n "$BASIS" ]]; then basis="$BASIS"; else basis="$prior_basis"; fi

  if [[ -n "$prior" ]]; then
    delta="$(awk -v n="$new_score" -v p="$prior" 'BEGIN{ printf "%+.2f", n - p }')"
    class="$(classify_delta "$new_score" "$prior")"
    note="Δ ${delta} ${class} vs ${prior} baseline"
  else
    note="Δ baseline established (no prior score in ${BASE:-RESULTS.md})"
  fi
  # optional success-signal check, recorded as EVIDENCE only (never a judgment
  # axis). Folded into the Δ annotation so the single ` · Δ *` strip above stays
  # idempotent across re-writes.
  if [[ -n "$CHECK" ]]; then
    check_result="$(run_check "$CHECK")"
    note="${note} · check=${check_result}"
  fi
  basis="${basis} · ${note}"

  # a literal pipe in the basis would corrupt the markdown table row.
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

  # atomic rewrite: pass every line through verbatim, substituting ONLY the target
  # row and the suite-score COMMENT line (the `<!--` guards against the prose line
  # that also contains "suite score ="). Build into a temp sibling on the same
  # filesystem, then swap in with one mv -f. TMP is cleaned up by the EXIT trap.
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

# --- arg parse ---
# TMP holds the in-flight scoreboard temp file; the EXIT trap removes it so an
# interrupted write leaves no partial sibling. Empty on every non-write path.
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
    # Scoring path. The full validated triad is always required first; a missing or
    # out-of-enum axis exits non-zero and writes/prints no score (no fabrication).
    if [[ -n "$TASK" ]]; then
      # Write mode: a named CB target => score it and overwrite ITS row.
      [[ "$TASK" =~ ^CB-[0-9]+$ ]] \
        || { echo "run.sh: --task must be a CB-<id> (matching CB-[0-9]+); got '$TASK'" >&2; exit 64; }
      validate_triad || exit 1
      if write_row; then exit 0; else exit 1; fi
    elif [[ -n "$SUCCESS$COST_TIME$UNATTENDED$BASIS" ]]; then
      # Preview mode: a triad with no target => print the score, touch nothing.
      if score_task; then exit 0; else exit 1; fi
    else
      usage >&2
      exit 64
    fi ;;
esac
