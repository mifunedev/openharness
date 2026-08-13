# shellcheck shell=bash
#
# .oh/scripts/lib/session-runner.sh — the runner ladder.
#
# A sourceable library that launches and supervises ONE long-lived agent
# session through the ladder
#
#     herdr  ->  tmux  ->  foreground
#
# so that any executor (firstmate today, anything after it) detects, launches,
# verifies, watches and tears a session down the same way instead of growing
# its own private copy of the ladder.
#
# ---------------------------------------------------------------------------
# Where this sits relative to the execution-boundary RFC
# ---------------------------------------------------------------------------
# `.oh/docs/rfcs/rfc-brain-hands-boundary.md` is the sole authority for the
# Phase-0 brain/hands seam (see its AUTHORITY CLAUSE). This header CITES it and
# deliberately does not restate it.
#
# The RFC landed with #733 (PR #736, merged 2026-08-13), so the path above
# resolves. The clauses are quoted below anyway, so this header stays readable
# without opening the RFC.
#
# Two clauses bind this library:
#
#   * Section 2 (brain/hands responsibility table) puts the iteration loop —
#     ralph, and firstmate after it — on the BRAIN side: "It *invokes* hands; it
#     is not hands." This ladder is therefore how the brain reaches a session
#     HOST. It is not an execution target and must not grow into one.
#   * Section 5 (workspace stance) makes `hostRoot === targetRoot` the ONLY
#     supported Phase-0 mapping: "no consumer above the seam may translate a
#     host path into an in-target path." This library never translates. When the
#     execution-context gate finds the candidate runner's environment differs
#     from the caller's, it REFUSES that runner rather than rewriting paths
#     across the boundary.
#
# ---------------------------------------------------------------------------
# CONTRACT: THE CALLER OWNS SHELL OPTIONS; THIS LIBRARY MUST NOT MUTATE THEM.
# ---------------------------------------------------------------------------
# There is deliberately NO `set -euo pipefail` at file scope. A file-scope
# `set` in a sourced file silently rewrites the caller's option state for the
# remainder of its execution, and shellcheck does not flag that. Strictness is
# scoped inside the functions that need it, via `local -` (bash restores the
# saved option set when the function returns).
#
# Note on `set -u` specifically: it is NOT used even function-scoped. In a
# non-interactive shell an unbound expansion under `set -u` terminates the
# whole shell — from a sourced library that means killing the CALLER. Argument
# strictness is therefore expressed as explicit validation that RETURNS an
# error, which is strictly safer than -u and never touches the caller.
#
# For the same reason, hard errors are reported as a non-zero RETURN plus a
# message on stderr. A sourced library must never `exit` the caller's shell;
# the caller decides what a hard error costs.
#
# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
#   resolve_timeout_ms [slug]                     -> validated session budget (ms)
#   runner_detect <slug> <worktree> [requested]   -> herdr|tmux|foreground on stdout
#   runner_launch <mode> <slug> <worktree> <cmd>  -> launch; capture pane id / pid
#   runner_pane_id                                -> the captured herdr pane id
#   runner_verify_cwd <mode> <worktree>           -> herdr foreground_cwd check
#   runner_alive <mode> <slug>                    -> 0 = live
#   runner_watch <mode> <slug> <task_dir>         -> 0 = sentinel observed
#   runner_teardown <mode> <slug>                 -> close the session
#   runner_abort <mode> <slug> <task_dir> <why>   -> the single exit path
#   runner_install_abort_trap <mode> <slug> <task_dir>
#
# Helpers other executors may reuse: runner_agent_name, runner_tmux_session,
# runner_lock_path, runner_log_path, runner_session_log_path, runner_log.
#
# ---------------------------------------------------------------------------
# Naming contract (PRD section 5)
# ---------------------------------------------------------------------------
#   herdr agent name   firstmate-<slug>
#   tmux session       agent-firstmate-<slug>
#   herdr log          /tmp/firstmate-<slug>.log
#   tmux log           /tmp/agent-firstmate-<slug>.log
#   lock               /tmp/firstmate-<slug>.lock   (atomic mkdir; the launch
#                      claim itself is made by the executor, this library only
#                      guarantees no exit path leaves the lock behind)
#
# ---------------------------------------------------------------------------
# herdr 0.7.4 facts this file is pinned to (all live-verified 2026-08-12)
# ---------------------------------------------------------------------------
#   * `herdr status` prints `status: running` and `compatible: yes` under its
#     `server:` block. There is no single "healthy" flag, so those two literals
#     ARE the whole health predicate.
#   * `herdr agent start <name> [...] --no-focus -- <argv...>` replies with an
#     `agent_started` payload whose pane id is at `.result.agent.pane_id`.
#     Observed shape (PRD section 15 Q0, captured 2026-08-12):
#       {"result":{"agent":{"cwd":"/home/ryaneggz",
#                           "foreground_cwd":"/home/ryaneggz",
#                           "pane_id":"w5:p4", ...}},"type":"agent_started"}
#     That is the ONE id this library captures; runner_verify_cwd, the
#     `herdr wait output` watch and runner_teardown all consume it through the
#     documented `runner_pane_id` accessor.
#   * `herdr agent get <name>` is the liveness oracle: exit 0 (`agent_info`) =
#     live, exit 1 (`agent_not_found`) = gone. It is REQUIRED here, not banned.
#   * There is NO `agent stop` / `agent kill` verb — `herdr agent --help` lists
#     only list/get/read/send/rename/focus/wait/start/attach/explain. Teardown
#     is `herdr pane close <pane_id>`; a stop/kill verb would fail silently
#     inside a trap.
#   * herdr panes may be HOST processes. Mechanism, confirmed 2026-08-12: the
#     operator's config directory is bind-mounted read-write into this
#     container, so the container's herdr CLI reads the HOST operator's herdr
#     config — socket path and server address included — connects to the HOST's
#     herdr server, and panes spawn outside the sandbox. That is why herdr
#     eligibility carries the execution-context gate below.
#
#     This is a deployment defect, not a property of herdr. It is one of two
#     host-root escape paths tracked under EPIC #731 as issue #756.
#
#     MIGRATION TRIGGER: when #756 closes, the container's herdr CLI reaches an
#     in-container server and the gate stops rejecting herdr by itself. Do NOT
#     delete the gate then — it is a build-correctness guard, and its job is to
#     prove environment identity rather than to assume it. Re-verify with a live
#     probe pane and update these notes with the observed result.
#
# ---------------------------------------------------------------------------
# Deliberate deviations from the PRD sketch
# ---------------------------------------------------------------------------
#   * The foreground branch does NOT `exec`. `exec` would replace this shell
#     and forfeit the exit-path contract (teardown -> lock removal ->
#     FIRSTMATE-INCOMPLETE), so the command is run as a supervised child and
#     watched by the same bounded poll tmux mode uses.
#   * The foreground `| tee` is NEW behavior, not ralph parity: ralph.sh's
#     no-tmux fallback does not log to a file today.

# --- constants --------------------------------------------------------------

# The session budget default: 4 hours, in milliseconds (FR-6a). Every consumer
# obtains the budget through resolve_timeout_ms and nowhere else.
RUNNER_DEFAULT_TIMEOUT_MS=14400000

# Guards resolve_timeout_ms against shell-arithmetic overflow on absurd input.
RUNNER_MAX_TIMEOUT_DIGITS=15

# Detection-probe ceiling. This is NOT the session budget: it bounds only the
# short-lived fingerprint probe pane in runner_detect.
RUNNER_PROBE_TIMEOUT_MS="${RUNNER_PROBE_TIMEOUT_MS:-15000}"

# Poll cadence for the tmux/foreground watch, in seconds.
RUNNER_POLL_INTERVAL_S="${RUNNER_POLL_INTERVAL_S:-5}"

# Root for logs and the per-slug lock. Overridable for tests only; the shipped
# default is /tmp, per the naming contract above.
RUNNER_TMPDIR="${RUNNER_TMPDIR:-/tmp}"

# Marker the fingerprint probe emits. Grepped out of pane output, so it must
# not collide with anything a shell profile prints.
RUNNER_FINGERPRINT_MARKER='FIRSTMATE-FINGERPRINT'

# The environment fingerprint script. The SAME snippet runs in the probe pane
# and locally, so "compared against the caller's own fingerprint gathered the
# same way" is true by construction rather than by convention. $1 = worktree.
# shellcheck disable=SC2016  # deliberately unexpanded: this is a script to be
# evaluated inside the probe pane / a child shell, not here.
RUNNER_PROBE_SCRIPT='wt="$1"; h="$(hostname 2>/dev/null || uname -n 2>/dev/null || echo unknown)"; d=no; [ -e /.dockerenv ] && d=yes; w=no; [ -d "$wt" ] && w=yes; printf "FIRSTMATE-FINGERPRINT host=%s docker=%s worktree=%s\n" "$h" "$d" "$w"'

# Mutable state. Declared here so a caller running under `set -u` can read them
# before the first launch.
RUNNER_PANE_ID="${RUNNER_PANE_ID:-}"
RUNNER_FG_PID="${RUNNER_FG_PID:-}"
RUNNER_INELIGIBLE_REASON="${RUNNER_INELIGIBLE_REASON:-}"

# --- naming helpers ---------------------------------------------------------

runner_agent_name() { printf '%s\n' "firstmate-${1:-}"; }
runner_tmux_session() { printf '%s\n' "agent-firstmate-${1:-}"; }
runner_lock_path() { printf '%s\n' "$RUNNER_TMPDIR/firstmate-${1:-}.lock"; }

# The firstmate log: where degrade reasons, rejections and teardowns are
# recorded. Same file as the herdr-mode session log by design — one slug, one
# narrative.
runner_log_path() { printf '%s\n' "$RUNNER_TMPDIR/firstmate-${1:-}.log"; }

# The log the launched session tees into. tmux mode gets its own name so a
# tmux run and a herdr run of the same slug can never overwrite each other.
runner_session_log_path() { # <mode> <slug>
  case "${1:-}" in
    tmux) printf '%s\n' "$RUNNER_TMPDIR/agent-firstmate-${2:-}.log" ;;
    *) printf '%s\n' "$RUNNER_TMPDIR/firstmate-${2:-}.log" ;;
  esac
}

runner_log() { # <slug> <message...>
  local slug="${1:-unknown}"
  shift || true
  local line="[session-runner] $*"
  printf '%s\n' "$line" >&2
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$line" >>"$(runner_log_path "$slug")" 2>/dev/null || true
}

# --- session budget ---------------------------------------------------------

# The ONLY source of the session budget. Every consumer — the herdr
# `wait output --timeout`, the tmux poll ceiling and the foreground poll
# ceiling — calls this, so a non-positive value can never reach herdr (making
# its `--timeout 0` semantics unreachable by construction) and neither poll
# loop can run unbounded or expire instantly.
#
# Accepts a POSIX integer > 0. Rejects 0, negative, non-numeric, empty and
# absurdly large values: the default applies and the rejection is logged.
resolve_timeout_ms() { # [slug]
  local slug="${1:-unknown}"
  local default_ms="$RUNNER_DEFAULT_TIMEOUT_MS"

  # Unset is not a rejection — it is simply "use the default".
  if [ -z "${FIRSTMATE_TIMEOUT_MS+set}" ]; then
    printf '%s\n' "$default_ms"
    return 0
  fi

  local raw="$FIRSTMATE_TIMEOUT_MS"
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
    runner_log "$slug" "resolve_timeout_ms: rejected FIRSTMATE_TIMEOUT_MS='$raw' ($why) — using default ${default_ms}ms"
    printf '%s\n' "$default_ms"
    return 0
  fi

  printf '%s\n' "$((10#$raw))"
}

# --- herdr JSON helpers -----------------------------------------------------

# Parses the pane id out of an `herdr agent start` reply. See the header for
# the observed payload shape; `.result.agent.pane_id` is the field name, and
# `.result.pane_id` is accepted as a defensive alternate.
runner_parse_pane_id() { # <json>
  local json="${1:-}"
  [ -n "$json" ] || return 0
  if ! command -v jq >/dev/null 2>&1; then
    return 0
  fi
  printf '%s' "$json" | jq -r '.result.agent.pane_id // .result.pane_id // empty' 2>/dev/null
}

# Reads one field of one pane out of an `herdr pane list` reply.
runner_pane_field() { # <json> <pane_id> <field>
  local json="${1:-}" pane="${2:-}" field="${3:-}"
  [ -n "$json" ] && [ -n "$pane" ] && [ -n "$field" ] || return 0
  command -v jq >/dev/null 2>&1 || return 0
  printf '%s' "$json" |
    jq -r --arg p "$pane" --arg f "$field" \
      '.result.panes[]? | select(.pane_id == $p) | .[$f] // empty' 2>/dev/null
}

# The documented accessor for the pane id runner_launch captured. Every herdr
# consumer in this file goes through it, so all of them provably use the same
# id: runner_verify_cwd, the `herdr wait output` watch, and runner_teardown.
runner_pane_id() { printf '%s\n' "${RUNNER_PANE_ID:-}"; }

# Recovers the pane id from the server when this process did not launch the
# session itself (e.g. `firstmate.sh --kill` in a fresh shell).
runner_resolve_pane_id() { # <slug>
  local slug="${1:-}"
  command -v herdr >/dev/null 2>&1 || return 0
  command -v jq >/dev/null 2>&1 || return 0
  herdr agent get "$(runner_agent_name "$slug")" 2>/dev/null |
    jq -r '.result.agent.pane_id // empty' 2>/dev/null
}

# --- execution-context gate -------------------------------------------------

runner_extract_fingerprint() { # stdin -> "host=... docker=... worktree=..."
  grep -E "^$RUNNER_FINGERPRINT_MARKER " 2>/dev/null |
    tail -n 1 |
    sed -e "s/^$RUNNER_FINGERPRINT_MARKER //"
}

runner_local_fingerprint() { # <worktree>
  local -
  set -o pipefail
  bash -lc "$RUNNER_PROBE_SCRIPT" firstmate-probe "${1:-}" 2>/dev/null | runner_extract_fingerprint
}

# Names the fields that differ between two fingerprints, so the logged degrade
# reason says WHICH field disagreed rather than only that something did.
runner_fingerprint_diff() { # <caller_fp> <probe_fp>
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

# Launches a SHORT-LIVED probe pane, reads its environment fingerprint back,
# and closes the pane again on BOTH verdicts. Echoes the probe's fingerprint;
# returns non-zero when no fingerprint could be obtained.
runner_probe_fingerprint() { # <slug> <worktree>
  local -
  set -o pipefail
  local slug="${1:-}" worktree="${2:-}"
  local probe_name="firstmate-probe-$slug-$$"
  local start_json pane_id probe_out fingerprint

  start_json="$(herdr agent start "$probe_name" --cwd "$worktree" --no-focus \
    -- bash -lc "$RUNNER_PROBE_SCRIPT" firstmate-probe "$worktree" 2>/dev/null)" || start_json=""
  pane_id="$(runner_parse_pane_id "$start_json")"

  if [ -z "$pane_id" ]; then
    runner_log "$slug" "execution-context gate: probe pane did not start (no pane id in the agent start reply)"
    return 1
  fi

  herdr wait output "$pane_id" --match "^$RUNNER_FINGERPRINT_MARKER " --regex \
    --timeout "$RUNNER_PROBE_TIMEOUT_MS" >/dev/null 2>&1 || true
  probe_out="$(herdr pane read "$pane_id" --source recent --lines 200 2>/dev/null)" || probe_out=""

  # The gate tears down its own probe pane regardless of verdict — no pane is
  # left behind on either the match or the mismatch path.
  herdr pane close "$pane_id" >/dev/null 2>&1 || true

  fingerprint="$(printf '%s\n' "$probe_out" | runner_extract_fingerprint)"
  if [ -z "$fingerprint" ]; then
    runner_log "$slug" "execution-context gate: probe pane $pane_id emitted no fingerprint within ${RUNNER_PROBE_TIMEOUT_MS}ms"
    return 1
  fi

  printf '%s\n' "$fingerprint"
}

# herdr eligibility: a zeroth nesting guard plus three conjuncts. Sets
# RUNNER_INELIGIBLE_REASON whenever it returns non-zero.
runner_herdr_eligible() { # <slug> <worktree>
  local slug="${1:-}" worktree="${2:-}"
  RUNNER_INELIGIBLE_REASON=""

  # Zeroth — NESTING GUARD, evaluated BEFORE any probe pane is launched.
  # HERDR_ENV / HERDR_PANE_ID are herdr 0.7.4's own in-pane markers (its
  # embedded integration hook gates on exactly HERDR_ENV=1) and are inherited
  # by every child of a pane. The permanent detection path must never itself
  # nest a pane, so this rules herdr out without probing at all.
  # Caveat: these markers do not cross a container boundary, so in a
  # split-environment deployment the fingerprint gate below is the backstop.
  if [ "${HERDR_ENV:-}" = "1" ] || [ -n "${HERDR_PANE_ID:-}" ]; then
    RUNNER_INELIGIBLE_REASON="nesting guard: caller is inside a herdr pane (HERDR_ENV=${HERDR_ENV:-unset} HERDR_PANE_ID=${HERDR_PANE_ID:-unset}) — allow_nested=false policy, probe pane skipped"
    return 1
  fi

  if ! command -v herdr >/dev/null 2>&1; then
    RUNNER_INELIGIBLE_REASON="herdr is not installed (command -v herdr failed)"
    return 1
  fi

  # Health predicate, pinned to two literal fields of `herdr status`. Anything
  # else — including binary-up/server-down — is unhealthy.
  local status_out
  status_out="$(herdr status 2>/dev/null)" || status_out=""
  if ! printf '%s\n' "$status_out" | grep -q 'status: running' ||
    ! printf '%s\n' "$status_out" | grep -q 'compatible: yes'; then
    RUNNER_INELIGIBLE_REASON="herdr server unhealthy: 'herdr status' did not report both 'status: running' and 'compatible: yes' (binary-up/server-down)"
    return 1
  fi

  # EXECUTION-CONTEXT GATE. herdr panes may execute on the host while this
  # caller runs inside the sandbox; AGENTS.md requires all building and testing
  # to happen INSIDE the sandbox, so same-environment execution must be proven,
  # not assumed. Any mismatch makes herdr ineligible.
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

# --- the ladder -------------------------------------------------------------

# Resolves the runner. Echoes herdr|tmux|foreground on stdout; every
# diagnostic goes to stderr and the firstmate log, so `$(runner_detect ...)`
# captures the mode and nothing else.
#
# An explicit request (third argument, or OH_RUNNER) that cannot be honoured is
# a HARD ERROR — never a silent degrade, and in particular never a silent
# host-side run.
runner_detect() { # <slug> <worktree> [requested]
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

# --- launch -----------------------------------------------------------------

# Launches <cmd> in <worktree> under the resolved <mode>. All three branches
# pipe `2>&1 | tee <log>`; the herdr branch additionally passes --no-focus.
#
# The cd is inside the launched command itself: runner flags that claim to set
# a working directory frequently set only metadata while the shell starts
# somewhere else, and that failure is silent.
runner_launch() { # <mode> <slug> <worktree> <cmd>
  local mode="${1:-}" slug="${2:-}" worktree="${3:-}" cmd="${4:-}"
  if [ -z "$mode" ] || [ -z "$slug" ] || [ -z "$worktree" ] || [ -z "$cmd" ]; then
    printf 'Error: runner_launch <mode> <slug> <worktree> <command> requires all four arguments.\n' >&2
    return 2
  fi

  local log agent session inner
  log="$(runner_session_log_path "$mode" "$slug")"
  agent="$(runner_agent_name "$slug")"
  session="$(runner_tmux_session "$slug")"
  inner="cd $(printf '%q' "$worktree") && $cmd 2>&1 | tee $(printf '%q' "$log")"

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
      runner_log "$slug" "launched herdr agent $agent (pane $RUNNER_PANE_ID), log $log"
      ;;
    tmux)
      if ! tmux new-session -d -s "$session" -c "$worktree" "$inner" 2>/dev/null; then
        printf 'Error: tmux new-session failed for %s.\n' "$session" >&2
        return 1
      fi
      runner_log "$slug" "launched tmux session $session, log $log"
      ;;
    foreground)
      bash -lc "$inner" &
      RUNNER_FG_PID=$!
      runner_log "$slug" "launched foreground child pid $RUNNER_FG_PID, log $log"
      ;;
    *)
      printf 'Error: runner_launch got unknown mode %s.\n' "$mode" >&2
      return 2
      ;;
  esac
}

# Verifies where the session ACTUALLY landed, by reading foreground_cwd back
# out of `herdr pane list` for the pane id runner_launch captured.
#
# Its real job is detecting CROSS-ENVIRONMENT execution, not merely a lying
# --cwd flag. A mismatch must never be "fixed" by loosening this check.
runner_verify_cwd() { # <mode> <worktree>
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

# --- liveness, watch, teardown ---------------------------------------------

# Read-only liveness oracle. It never claims the launch slot — the executor's
# atomic mkdir lock does that, because any read-only oracle leaves a
# check-then-start TOCTOU window open.
runner_alive() { # <mode> <slug>
  local mode="${1:-}" slug="${2:-}"
  case "$mode" in
    herdr)
      # The EXIT CODE is the oracle: 0 = agent_info (live), 1 = agent_not_found.
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

runner_sentinel_present() { # <progress_file>
  local progress="${1:-}"
  [ -n "$progress" ] && [ -f "$progress" ] || return 1
  grep -q '^STATUS: COMPLETE$' "$progress" 2>/dev/null
}

# Watches the session until the terminal sentinel appears or the session budget
# expires. progress.txt is the AUTHORITY in every mode: herdr's `wait output`
# match only triggers a re-read of the file.
#
# Returns 0 when the sentinel was observed. On expiry or on death without the
# sentinel it runs the single exit path (runner_abort) and returns non-zero.
runner_watch() { # <mode> <slug> <task_dir>
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
    # Mid-run herdr loss (or a match this file could not confirm) degrades the
    # watch to file-polling the same progress.txt. The herdr server is never
    # restarted.
    runner_log "$slug" "watch: herdr wait did not confirm the sentinel; polling $progress until the budget expires"
  fi

  while [ "$(date +%s)" -lt "$deadline" ]; do
    if runner_sentinel_present "$progress"; then
      return 0
    fi
    if ! runner_alive "$mode" "$slug"; then
      # Death without the sentinel — read the authority once more before
      # calling it, in case the session wrote and exited between polls.
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

# Closes the session. herdr's teardown verb is `pane close` — 0.7.4 has no
# `agent stop` / `agent kill`, and a nonexistent verb inside a trap would fail
# silently.
runner_teardown() { # <mode> <slug>
  local mode="${1:-}" slug="${2:-}"
  case "$mode" in
    herdr)
      local pane
      pane="$(runner_pane_id)"
      [ -n "$pane" ] || pane="$(runner_resolve_pane_id "$slug")"
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

# THE single exit path. Every non-success ending — budget expiry, launch
# failure, operator abort — goes through here, so no path can leave the lock
# behind (a stale lock would permanently wedge that slug).
runner_abort() { # <mode> <slug> <task_dir> <reason>
  local mode="${1:-}" slug="${2:-}" task_dir="${3:-}" reason="${4:-unspecified}"

  runner_teardown "$mode" "$slug"

  if [ -n "$slug" ]; then
    local lock
    lock="$(runner_lock_path "$slug")"
    rm -rf "$lock" 2>/dev/null || true
  fi

  if [ -n "$task_dir" ] && [ -f "$task_dir/progress.txt" ]; then
    printf 'FIRSTMATE-INCOMPLETE %s — %s\n' \
      "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$reason" >>"$task_dir/progress.txt" 2>/dev/null || true
  fi

  runner_log "$slug" "abort: $reason — teardown done, lock removed, FIRSTMATE-INCOMPLETE appended"
  return 0
}

# Routes operator abort (Ctrl-C / SIGTERM) through the same exit path.
runner_install_abort_trap() { # <mode> <slug> <task_dir>
  local mode="${1:-}" slug="${2:-}" task_dir="${3:-}"
  # shellcheck disable=SC2064  # expanded now on purpose: the trap must capture
  # this session's mode/slug/task_dir, not whatever they hold when it fires.
  trap "runner_abort $(printf '%q' "$mode") $(printf '%q' "$slug") $(printf '%q' "$task_dir") 'operator abort (signal)'; exit 130" INT TERM
}
