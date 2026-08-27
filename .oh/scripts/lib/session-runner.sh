# shellcheck shell=bash
# CONTRACT: THE CALLER OWNS SHELL OPTIONS; THIS LIBRARY MUST NOT MUTATE THEM.
# There is deliberately NO `set -euo pipefail` at file scope. A file-scope
#   * There is NO `agent stop` / `agent kill` verb — `herdr agent --help` lists
#     only list/get/read/send/rename/focus/wait/start/attach/explain. Teardown


RUNNER_DEFAULT_TIMEOUT_MS=14400000

RUNNER_MAX_TIMEOUT_DIGITS=15

RUNNER_PROBE_TIMEOUT_MS="${RUNNER_PROBE_TIMEOUT_MS:-15000}"

RUNNER_POLL_INTERVAL_S="${RUNNER_POLL_INTERVAL_S:-5}"

RUNNER_TMPDIR="${RUNNER_TMPDIR:-/tmp}"

RUNNER_FINGERPRINT_MARKER='BUILD-SESSION-FINGERPRINT'

# shellcheck disable=SC2016  # deliberately unexpanded: this is a script to be
RUNNER_PROBE_SCRIPT='wt="$1"; h="$(hostname 2>/dev/null || uname -n 2>/dev/null || echo unknown)"; d=no; [ -e /.dockerenv ] && d=yes; w=no; [ -d "$wt" ] && w=yes; printf "BUILD-SESSION-FINGERPRINT host=%s docker=%s worktree=%s\n" "$h" "$d" "$w"'

RUNNER_PROBE_KEEPALIVE_SUFFIX='; sleep "${2:-30}"'

RUNNER_PANE_ID="${RUNNER_PANE_ID:-}"
RUNNER_FG_PID="${RUNNER_FG_PID:-}"
RUNNER_INELIGIBLE_REASON="${RUNNER_INELIGIBLE_REASON:-}"


runner_agent_name() { printf '%s\n' "build-${1:-}"; }
runner_tmux_session() { printf '%s\n' "agent-build-${1:-}"; }
runner_lock_path() { printf '%s\n' "$RUNNER_TMPDIR/build-${1:-}.lock"; }

runner_log_path() { printf '%s\n' "$RUNNER_TMPDIR/build-${1:-}.log"; }

runner_session_log_path() {
  case "${1:-}" in
    tmux) printf '%s\n' "$RUNNER_TMPDIR/agent-build-${2:-}.log" ;;
    *) printf '%s\n' "$RUNNER_TMPDIR/build-${2:-}.log" ;;
  esac
}

runner_log() {
  local slug="${1:-unknown}"
  shift || true
  local line="[session-runner] $*"
  printf '%s\n' "$line" >&2
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$line" >>"$(runner_log_path "$slug")" 2>/dev/null || true
}


resolve_timeout_ms() {
  local slug="${1:-unknown}"
  local default_ms="$RUNNER_DEFAULT_TIMEOUT_MS"

  if [ -z "${BUILD_SESSION_TIMEOUT_MS+set}" ]; then
    printf '%s\n' "$default_ms"
    return 0
  fi

  local raw="$BUILD_SESSION_TIMEOUT_MS"
  local why=""
  if [ -z "$raw" ]; then
    why="empty"
  else
    case "$raw" in
      *[!0-9]*) why="not a POSIX integer (negative or non-numeric)" ;;
    esac
  fi
  if [ -z "$why" ] && [ "${#raw}" -gt "$RUNNER_MAX_TIMEOUT_DIGITS" ]; then
    why="out of range (more than $RUNNER_MAX_TIMEOUT_DIGITS digits)"
  fi
  if [ -z "$why" ] && [ "$((10#$raw))" -le 0 ]; then
    why="must be greater than 0"
  fi

  if [ -n "$why" ]; then
    runner_log "$slug" "resolve_timeout_ms: rejected BUILD_SESSION_TIMEOUT_MS='$raw' ($why) — using default ${default_ms}ms"
    printf '%s\n' "$default_ms"
    return 0
  fi

  printf '%s\n' "$((10#$raw))"
}


runner_parse_pane_id() {
  local json="${1:-}"
  [ -n "$json" ] || return 0
  if ! command -v jq >/dev/null 2>&1; then
    return 0
  fi
  printf '%s' "$json" | jq -r '.result.agent.pane_id // .result.pane_id // empty' 2>/dev/null
}

runner_pane_field() {
  local json="${1:-}" pane="${2:-}" field="${3:-}"
  [ -n "$json" ] && [ -n "$pane" ] && [ -n "$field" ] || return 0
  command -v jq >/dev/null 2>&1 || return 0
  printf '%s' "$json" |
    jq -r --arg p "$pane" --arg f "$field" \
      '.result.panes[]? | select(.pane_id == $p) | .[$f] // empty' 2>/dev/null
}

runner_pane_id() { printf '%s\n' "${RUNNER_PANE_ID:-}"; }

runner_resolve_pane_id() {
  local slug="${1:-}"
  command -v herdr >/dev/null 2>&1 || return 0
  command -v jq >/dev/null 2>&1 || return 0
  herdr agent get "$(runner_agent_name "$slug")" 2>/dev/null |
    jq -r '.result.agent.pane_id // empty' 2>/dev/null || true
  return 0
}


runner_extract_fingerprint() {
  grep -E "^$RUNNER_FINGERPRINT_MARKER " 2>/dev/null |
    tail -n 1 |
    sed -e "s/^$RUNNER_FINGERPRINT_MARKER //"
}

runner_local_fingerprint() {
  local -
  set -o pipefail
  bash -lc "$RUNNER_PROBE_SCRIPT" build-session-probe "${1:-}" 2>/dev/null | runner_extract_fingerprint
}

runner_probe_keepalive_s() {
  local ms="${RUNNER_PROBE_TIMEOUT_MS:-15000}" s
  case "$ms" in '' | *[!0-9]*) ms=15000 ;; esac
  s=$((ms / 1000 + 5))
  [ "$s" -lt 5 ] && s=5
  printf '%s\n' "$s"
}

runner_probe_pane_script() {
  local composed="${RUNNER_PROBE_SCRIPT}${RUNNER_PROBE_KEEPALIVE_SUFFIX}"
  printf '%s' "$composed"
}

runner_fingerprint_diff() {
  local caller="${1:-}" probe="${2:-}" field diff=""
  for field in host docker worktree; do
    local a b
    a="$(printf '%s\n' "$caller" | sed -n "s/.*\\b$field=\\([^ ]*\\).*/\\1/p")"
    b="$(printf '%s\n' "$probe" | sed -n "s/.*\\b$field=\\([^ ]*\\).*/\\1/p")"
    if [ "$a" != "$b" ]; then
      diff="${diff:+$diff,}$field"
    fi
  done
  printf '%s\n' "${diff:-unknown}"
}

runner_probe_fingerprint() {
  local -
  set -o pipefail
  local slug="${1:-}" worktree="${2:-}"
  local probe_name="build-session-probe-$slug-$$"
  local start_json pane_id probe_out fingerprint keepalive_s

  keepalive_s="$(runner_probe_keepalive_s)"
  start_json="$(herdr agent start "$probe_name" --cwd "$worktree" --no-focus \
    -- bash -lc "$(runner_probe_pane_script)" build-session-probe "$worktree" "$keepalive_s" 2>/dev/null)" || start_json=""
  pane_id="$(runner_parse_pane_id "$start_json")"

  if [ -z "$pane_id" ]; then
    runner_log "$slug" "execution-context gate: probe pane did not start (no pane id in the agent start reply)"
    return 1
  fi

  herdr wait output "$pane_id" --match "^$RUNNER_FINGERPRINT_MARKER " --regex \
    --timeout "$RUNNER_PROBE_TIMEOUT_MS" >/dev/null 2>&1 || true
  probe_out="$(herdr pane read "$pane_id" --source recent --lines 200 2>/dev/null)" || probe_out=""

  herdr pane close "$pane_id" >/dev/null 2>&1 || true

  fingerprint="$(printf '%s\n' "$probe_out" | runner_extract_fingerprint)"
  if [ -z "$fingerprint" ]; then
    runner_log "$slug" "execution-context gate: probe pane $pane_id emitted no fingerprint within ${RUNNER_PROBE_TIMEOUT_MS}ms"
    return 1
  fi

  printf '%s\n' "$fingerprint"
}

runner_herdr_eligible() {
  local slug="${1:-}" worktree="${2:-}"
  RUNNER_INELIGIBLE_REASON=""

  if [ "${HERDR_ENV:-}" = "1" ] || [ -n "${HERDR_PANE_ID:-}" ]; then
    RUNNER_INELIGIBLE_REASON="nesting guard: caller is inside a herdr pane (HERDR_ENV=${HERDR_ENV:-unset} HERDR_PANE_ID=${HERDR_PANE_ID:-unset}) — allow_nested=false policy, probe pane skipped"
    return 1
  fi

  if ! command -v herdr >/dev/null 2>&1; then
    RUNNER_INELIGIBLE_REASON="herdr is not installed (command -v herdr failed)"
    return 1
  fi

  local status_out
  status_out="$(herdr status 2>/dev/null)" || status_out=""
  if ! printf '%s\n' "$status_out" | grep -q 'status: running' ||
    ! printf '%s\n' "$status_out" | grep -q 'compatible: yes'; then
    RUNNER_INELIGIBLE_REASON="herdr server unhealthy: 'herdr status' did not report both 'status: running' and 'compatible: yes' (binary-up/server-down)"
    return 1
  fi

  local caller_fp probe_fp
  caller_fp="$(runner_local_fingerprint "$worktree")"
  if ! probe_fp="$(runner_probe_fingerprint "$slug" "$worktree")"; then
    RUNNER_INELIGIBLE_REASON="execution-context gate: no probe fingerprint obtained (caller[$caller_fp]) — herdr cannot be proven to run in this environment"
    return 1
  fi
  if [ "$probe_fp" != "$caller_fp" ]; then
    RUNNER_INELIGIBLE_REASON="execution-context gate: fingerprint mismatch on $(runner_fingerprint_diff "$caller_fp" "$probe_fp") — caller[$caller_fp] probe[$probe_fp]; herdr panes are not executing in this environment"
    return 1
  fi

  return 0
}


runner_detect() {
  local slug="${1:-}" worktree="${2:-}" requested="${3:-${OH_RUNNER:-}}"

  case "$requested" in
    '' | herdr | tmux | foreground) ;;
    *)
      printf 'Error: unknown runner %s (expected: herdr, tmux, or foreground).\n' "$requested" >&2
      return 2
      ;;
  esac

  case "$requested" in
    herdr)
      if runner_herdr_eligible "$slug" "$worktree"; then
        printf 'herdr\n'
        return 0
      fi
      runner_log "$slug" "runner override 'herdr' refused: $RUNNER_INELIGIBLE_REASON"
      printf 'Error: runner herdr was requested explicitly but is unavailable: %s\n' \
        "$RUNNER_INELIGIBLE_REASON" >&2
      printf 'Refusing to degrade silently: an out-of-environment herdr would run this build outside the sandbox.\n' >&2
      return 3
      ;;
    tmux)
      if command -v tmux >/dev/null 2>&1; then
        printf 'tmux\n'
        return 0
      fi
      printf 'Error: runner tmux was requested explicitly but tmux is not installed.\n' >&2
      return 3
      ;;
    foreground)
      printf 'foreground\n'
      return 0
      ;;
  esac

  # Automatic ladder: herdr -> tmux -> foreground.
  if runner_herdr_eligible "$slug" "$worktree"; then
    printf 'herdr\n'
    return 0
  fi
  runner_log "$slug" "ladder: herdr ineligible — $RUNNER_INELIGIBLE_REASON; degrading to tmux"

  if command -v tmux >/dev/null 2>&1; then
    printf 'tmux\n'
    return 0
  fi
  runner_log "$slug" "ladder: tmux is not installed; degrading to foreground"
  printf 'foreground\n'
}


runner_launch() {
  local mode="${1:-}" slug="${2:-}" worktree="${3:-}" cmd="${4:-}"
  if [ -z "$mode" ] || [ -z "$slug" ] || [ -z "$worktree" ] || [ -z "$cmd" ]; then
    printf 'Error: runner_launch <mode> <slug> <worktree> <command> requires all four arguments.\n' >&2
    return 2
  fi

  local log agent session inner
  log="$(runner_session_log_path "$mode" "$slug")"
  agent="$(runner_agent_name "$slug")"
  session="$(runner_tmux_session "$slug")"
  inner="cd $(printf '%q' "$worktree") && $cmd"

  case "$mode" in
    herdr)
      local start_json
      start_json="$(herdr agent start "$agent" --cwd "$worktree" --no-focus \
        -- bash -lc "$inner" 2>/dev/null)" || start_json=""
      RUNNER_PANE_ID="$(runner_parse_pane_id "$start_json")"
      if [ -z "$RUNNER_PANE_ID" ]; then
        printf 'Error: herdr agent start returned no pane id for %s.\n' "$agent" >&2
        return 1
      fi
      runner_log "$slug" "launched herdr agent $agent (pane $RUNNER_PANE_ID); read it with: herdr agent read $agent"
      ;;
    tmux)
      if ! tmux new-session -d -s "$session" -c "$worktree" "$inner" 2>/dev/null; then
        printf 'Error: tmux new-session failed for %s.\n' "$session" >&2
        return 1
      fi
      if ! tmux pipe-pane -o -t "$session" "cat >> $(printf '%q' "$log")" 2>/dev/null; then
        runner_log "$slug" "launched tmux session $session, but pipe-pane logging to $log could not be attached"
      else
        runner_log "$slug" "launched tmux session $session, piping pane output to $log"
      fi
      ;;
    foreground)
      bash -lc "$inner" &
      RUNNER_FG_PID=$!
      runner_log "$slug" "launched foreground child pid $RUNNER_FG_PID (stdio inherited; no session log)"
      ;;
    *)
      printf 'Error: runner_launch got unknown mode %s.\n' "$mode" >&2
      return 2
      ;;
  esac
}

runner_verify_cwd() {
  local mode="${1:-}" worktree="${2:-}"
  [ "$mode" = "herdr" ] || return 0

  local pane list_json actual
  pane="$(runner_pane_id)"
  if [ -z "$pane" ]; then
    printf 'Error: runner_verify_cwd has no pane id — launch first.\n' >&2
    return 1
  fi

  list_json="$(herdr pane list 2>/dev/null)" || list_json=""
  actual="$(runner_pane_field "$list_json" "$pane" foreground_cwd)"
  if [ -z "$actual" ]; then
    printf 'Error: pane %s reported no foreground_cwd.\n' "$pane" >&2
    return 1
  fi
  if [ "$actual" != "$worktree" ]; then
    printf 'Error: pane %s is running in %s, not %s — the session is executing in a different environment.\n' \
      "$pane" "$actual" "$worktree" >&2
    return 1
  fi
  return 0
}


runner_alive() {
  local mode="${1:-}" slug="${2:-}"
  case "$mode" in
    herdr)
      herdr agent get "$(runner_agent_name "$slug")" >/dev/null 2>&1
      ;;
    tmux)
      tmux has-session -t "$(runner_tmux_session "$slug")" 2>/dev/null
      ;;
    foreground)
      [ -n "${RUNNER_FG_PID:-}" ] && kill -0 "$RUNNER_FG_PID" 2>/dev/null
      ;;
    *)
      return 1
      ;;
  esac
}

runner_sentinel_present() {
  local progress="${1:-}"
  [ -n "$progress" ] && [ -f "$progress" ] || return 1
  grep -q '^STATUS: COMPLETE$' "$progress" 2>/dev/null
}

runner_watch() {
  local mode="${1:-}" slug="${2:-}" task_dir="${3:-}"
  local progress="$task_dir/progress.txt"
  local budget_ms deadline now
  budget_ms="$(resolve_timeout_ms "$slug")"
  now="$(date +%s)"
  deadline=$((now + budget_ms / 1000))

  if [ "$mode" = "herdr" ]; then
    local pane
    pane="$(runner_pane_id)"
    if [ -n "$pane" ]; then
      herdr wait output "$pane" --match '^STATUS: COMPLETE$' --regex \
        --timeout "$budget_ms" >/dev/null 2>&1 || true
      if runner_sentinel_present "$progress"; then
        return 0
      fi
    fi
    runner_log "$slug" "watch: herdr wait did not confirm the sentinel; polling $progress until the budget expires"
  fi

  while [ "$(date +%s)" -lt "$deadline" ]; do
    if runner_sentinel_present "$progress"; then
      return 0
    fi
    if ! runner_alive "$mode" "$slug"; then
      if runner_sentinel_present "$progress"; then
        return 0
      fi
      runner_abort "$mode" "$slug" "$task_dir" "session ended without STATUS: COMPLETE"
      return 1
    fi
    sleep "$RUNNER_POLL_INTERVAL_S"
  done

  runner_abort "$mode" "$slug" "$task_dir" "session budget of ${budget_ms}ms expired"
  return 1
}

# `agent stop` / `agent kill`, and a nonexistent verb inside a trap would fail
runner_teardown() {
  local mode="${1:-}" slug="${2:-}"
  case "$mode" in
    herdr)
      local pane
      pane="$(runner_pane_id)" || pane=""
      [ -n "$pane" ] || pane="$(runner_resolve_pane_id "$slug")" || pane=""
      if [ -n "$pane" ]; then
        herdr pane close "$pane" >/dev/null 2>&1 || true
        runner_log "$slug" "teardown: herdr pane close $pane"
      else
        runner_log "$slug" "teardown: no pane id for $(runner_agent_name "$slug") — nothing to close"
      fi
      RUNNER_PANE_ID=""
      ;;
    tmux)
      tmux kill-session -t "$(runner_tmux_session "$slug")" 2>/dev/null || true
      runner_log "$slug" "teardown: tmux kill-session -t $(runner_tmux_session "$slug")"
      ;;
    foreground)
      if [ -n "${RUNNER_FG_PID:-}" ]; then
        kill "$RUNNER_FG_PID" 2>/dev/null || true
        runner_log "$slug" "teardown: killed foreground child $RUNNER_FG_PID"
      fi
      RUNNER_FG_PID=""
      ;;
    *) ;;
  esac
  return 0
}

runner_abort() {
  local mode="${1:-}" slug="${2:-}" task_dir="${3:-}" reason="${4:-unspecified}"

  runner_teardown "$mode" "$slug"

  if [ -n "$slug" ]; then
    local lock
    lock="$(runner_lock_path "$slug")"
    rm -rf "$lock" 2>/dev/null || true
  fi

  if [ -n "$task_dir" ] && [ -f "$task_dir/progress.txt" ]; then
    printf 'BUILD-SESSION-INCOMPLETE %s — %s\n' \
      "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$reason" >>"$task_dir/progress.txt" 2>/dev/null || true
  fi

  runner_log "$slug" "abort: $reason — teardown done, lock removed, BUILD-SESSION-INCOMPLETE appended"
  return 0
}

runner_install_abort_trap() {
  local mode="${1:-}" slug="${2:-}" task_dir="${3:-}"
  # shellcheck disable=SC2064  # expanded now on purpose: the trap must capture
  trap "runner_abort $(printf '%q' "$mode") $(printf '%q' "$slug") $(printf '%q' "$task_dir") 'operator abort (signal)'; exit 130" INT TERM
}
