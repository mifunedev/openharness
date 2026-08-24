#!/usr/bin/env bash
# .oh/scripts/firstmate.sh — the build-executor entrypoint. There is exactly one.
#
# Usage:
#   .oh/scripts/firstmate.sh [--runner herdr|tmux|foreground] [--harness claude|pi|codex]
#                            [--no-watch] <slug>
#   .oh/scripts/firstmate.sh --kill <slug>
#
# Launches ONE long-lived First-Mate session over the whole `.oh/tasks/<slug>/`
# task graph. The session manager is resolved by the shared ladder in
# `.oh/scripts/lib/session-runner.sh` (herdr -> tmux -> foreground); the slug and
# four-file validation come from `.oh/scripts/lib/task-contract.sh`; the session
# prompt is rendered from `.oh/skills/firstmate/templates/session-prompt.md`.
#
# This is the ONLY build executor. There is no toggle and no alternative arm, so
# there is also no fallback: recovery from a misbehaving ladder or child session
# is fix-forward only.
#
# ---------------------------------------------------------------------------
# Naming contract (PRD section 5)
# ---------------------------------------------------------------------------
#   herdr agent    firstmate-<slug>
#   tmux session   agent-firstmate-<slug>
#   herdr log      /tmp/firstmate-<slug>.log
#   tmux log       /tmp/agent-firstmate-<slug>.log
#   lock           /tmp/firstmate-<slug>.lock   (atomic mkdir launch-claim)
#   rendered prompt /tmp/firstmate-<slug>.prompt.md
#   terminal       the whole line `STATUS: COMPLETE` in progress.txt
#
# ---------------------------------------------------------------------------
# Configuration (env vars)
# ---------------------------------------------------------------------------
#   FIRSTMATE_TIMEOUT_MS    session budget in ms (default 14400000 = 4h).
#                           Validated ONLY by resolve_timeout_ms in
#                           session-runner.sh — 0, negative, non-numeric and
#                           empty are rejected there and the default applies.
#   FIRSTMATE_HARNESS       claude | pi | codex (default: claude)
#   FIRSTMATE_CLAUDE_FLAGS  default: --dangerously-skip-permissions
#                           (NO --print: the child must stay an INTERACTIVE
#                            session, see the launch note below)
#   FIRSTMATE_PI_FLAGS      default: (empty, for the same reason)
#   FIRSTMATE_HARNESS_CMD   full override of the launched command; the rendered
#                           prompt path is exported as $FIRSTMATE_PROMPT_FILE
#   FIRSTMATE_BRANCH        override the <branch> placeholder
#   FIRSTMATE_ISSUE         override the <issue> placeholder
#   OH_RUNNER               runner override; same values as --runner
#   RUNNER_TMPDIR           root for logs/lock/prompt (default /tmp; tests only)
#
# ---------------------------------------------------------------------------
# Deliberate deviation from the PRD section 5 launch sketch
# ---------------------------------------------------------------------------
# The sketch shows `<harness> "/goal <rendered-prompt>"`. There is no `/goal`
# skill in this repo (`.oh/skills/` has no `goal` entry). The rendered prompt is
# written to $FIRSTMATE_PROMPT_FILE and read back inside the LAUNCHED shell as
# `"$(cat <file>)"`, so it reaches the harness as a single initial argv. The
# rendered prompt IS the goal brief, so no wrapper verb is lost.
#
# ---------------------------------------------------------------------------
# THE CHILD SESSION IS INTERACTIVE. DO NOT PIPE THE PROMPT IN, AND NO --print
# ---------------------------------------------------------------------------
# This was the shape until 2026-08-23 (spec-simplification US-002):
#
#     cat <prompt> | claude --dangerously-skip-permissions --print
#
# Two things it got wrong, and both are load-bearing:
#
#   * `--print` makes the harness answer once and exit. A First Mate session has
#     to walk a whole task graph over many turns, so a one-shot child cannot do
#     the job it was launched for.
#   * Feeding the prompt on stdin makes stdin a PIPE, not a TTY. An interactive
#     agent session refuses to run without a terminal.
#
# OBSERVED 2026-08-23: the child started, printed only startup warnings, and
# never advanced. The prompt therefore travels as initial argv, and the session
# stays live and attachable in its herdr pane or tmux session.
#
# The same rule binds `.oh/scripts/lib/session-runner.sh`: it must not wrap the
# launched command in a `tee` log pipe either — see the note above runner_launch.

set -euo pipefail

FIRSTMATE_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=/dev/null
. "$FIRSTMATE_SCRIPT_DIR/lib/session-runner.sh"
# shellcheck source=/dev/null
. "$FIRSTMATE_SCRIPT_DIR/lib/task-contract.sh"

# The skill-owned session-prompt template (US-002), repo-root-relative.
FIRSTMATE_TEMPLATE_REL=".oh/skills/firstmate/templates/session-prompt.md"

# The CLOSED placeholder set US-002's contract header declares. `{curly}` text
# is NOT a placeholder — it is runtime-fill the session writes — so the renderer
# leaves it alone.
FIRSTMATE_PLACEHOLDERS="slug branch issue"

usage() {
  cat >&2 <<'EOF'
Usage: firstmate.sh [--runner herdr|tmux|foreground] [--harness claude|pi|codex]
                    [--no-watch] <slug>
       firstmate.sh --kill <slug>
EOF
}

# ─── argument parsing ────────────────────────────────────────────────

parse_args() {
  KILL_MODE=0
  WATCH=1
  REQUESTED_RUNNER="${OH_RUNNER:-}"
  HARNESS="${FIRSTMATE_HARNESS:-claude}"
  SLUG=""
  local positional=()

  while [ "$#" -gt 0 ]; do
    case "$1" in
      --kill)
        KILL_MODE=1
        ;;
      --kill=*)
        KILL_MODE=1
        positional+=("${1#--kill=}")
        ;;
      --no-watch)
        WATCH=0
        ;;
      --runner)
        shift
        if [ "${1-}" = "" ]; then
          echo "Error: --runner requires a value (herdr, tmux, or foreground)." >&2
          exit 2
        fi
        REQUESTED_RUNNER="$1"
        ;;
      --runner=*)
        REQUESTED_RUNNER="${1#--runner=}"
        ;;
      --harness)
        shift
        if [ "${1-}" = "" ]; then
          echo "Error: --harness requires a value (claude, pi, or codex)." >&2
          exit 2
        fi
        HARNESS="$1"
        ;;
      --harness=*)
        HARNESS="${1#--harness=}"
        ;;
      -h | --help)
        usage
        exit 0
        ;;
      --)
        shift
        while [ "$#" -gt 0 ]; do
          positional+=("$1")
          shift
        done
        break
        ;;
      -*)
        echo "Error: unknown option '$1'." >&2
        usage
        exit 2
        ;;
      *)
        positional+=("$1")
        ;;
    esac
    shift
  done

  if [ "${#positional[@]}" -ne 1 ]; then
    usage
    exit 2
  fi
  SLUG="${positional[0]}"
}

normalize_harness() { # <harness>
  case "${1:-}" in
    claude | pi | codex)
      printf '%s\n' "$1"
      ;;
    *)
      printf "Error: unknown harness '%s' (expected: claude, pi, or codex).\n" "${1:-}" >&2
      return 2
      ;;
  esac
}

# ─── paths ───────────────────────────────────────────────────────────

firstmate_repo_root() {
  git rev-parse --show-toplevel 2>/dev/null || pwd
}

# Where the rendered prompt lands. Honours RUNNER_TMPDIR for the same reason the
# log and lock paths do — so a test never writes into the real /tmp namespace.
firstmate_prompt_path() { # <slug>
  printf '%s\n' "${RUNNER_TMPDIR:-/tmp}/firstmate-${1:-}.prompt.md"
}

# ─── placeholder resolution ──────────────────────────────────────────

firstmate_json_field() { # <prd_json> <jq_filter>
  local prd="${1:-}" filter="${2:-}"
  [ -f "$prd" ] || return 0
  command -v jq >/dev/null 2>&1 || return 0
  jq -r "$filter" "$prd" 2>/dev/null || true
}

firstmate_branch_name() { # <prd_json>
  local prd="${1:-}" branch=""
  if [ -n "${FIRSTMATE_BRANCH:-}" ]; then
    printf '%s\n' "$FIRSTMATE_BRANCH"
    return 0
  fi
  branch="$(firstmate_json_field "$prd" '.branchName // empty')"
  if [ -z "$branch" ] && [ -f "$prd" ]; then
    # jq-free fallback: branchName is a flat top-level string. The producer is
    # wrapped so that `head` closing the pipe early (SIGPIPE, status 141) cannot
    # fail the whole pipeline under `set -o pipefail` and discard a real match.
    branch="$( { sed -n 's/.*"branchName"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$prd" || true; } | head -n 1)"
  fi
  [ -n "$branch" ] || branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
  [ -n "$branch" ] || branch="unknown"
  printf '%s\n' "$branch"
}

# BARE DIGITS, per US-002's contract: the template writes `#<issue>` wherever a
# `#`-prefixed reference is wanted, so the renderer must never prepend one.
firstmate_issue_number() { # <prd_json>
  local prd="${1:-}" issue=""
  if [ -n "${FIRSTMATE_ISSUE:-}" ]; then
    printf '%s\n' "${FIRSTMATE_ISSUE#\#}"
    return 0
  fi
  issue="$(firstmate_json_field "$prd" '(.issue // .issueNumber // empty) | tostring')"
  if [ -z "$issue" ] && [ -f "$prd" ]; then
    # A task folder records its issue in prose ("… (issue #746)"), not as a field.
    # `|| true` absorbs both no-match (status 1) and SIGPIPE from `head`; under
    # `set -o pipefail` either would otherwise sink the whole substitution.
    issue="$( { grep -oE '#[0-9]+' "$prd" || true; } | head -n 1 | tr -d '#')"
  fi
  [ -n "$issue" ] || issue="unknown"
  printf '%s\n' "$issue"
}

# ─── the renderer (US-003 owns the renderer; US-002 owns the contract) ──

# Substitutes the closed placeholder set declared in the template's own contract
# header into the template BODY, and writes the result to stdout.
#
# It introduces no token the template does not declare, and self-checks that no
# declared token survived — a surviving `<slug>` in a live session prompt is a
# silent, expensive failure.
render_session_prompt() { # <template> <slug> <branch> <issue>
  local template="${1:-}" slug="${2:-}" branch="${3:-}" issue="${4:-}"
  local body token

  if [ -z "$template" ] || [ -z "$slug" ] || [ -z "$branch" ] || [ -z "$issue" ]; then
    printf 'Error: render_session_prompt <template> <slug> <branch> <issue> requires all four arguments.\n' >&2
    return 2
  fi
  if [ ! -f "$template" ]; then
    printf 'Error: session-prompt template %s is missing.\n' "$template" >&2
    return 1
  fi

  # Drop the authoring contract header. It documents the placeholder set and the
  # anchor list for maintainers and for the US-009 probe; it is not instruction
  # for the session, and feeding it to the session would invite the session to
  # treat the anchor bookkeeping as work.
  if grep -q 'END CONTRACT HEADER -->' "$template"; then
    body="$(sed -e '1,/END CONTRACT HEADER -->/d' "$template")"
  else
    body="$(cat "$template")"
  fi

  body="${body//<slug>/$slug}"
  body="${body//<branch>/$branch}"
  body="${body//<issue>/$issue}"

  for token in $FIRSTMATE_PLACEHOLDERS; do
    case "$body" in
      *"<$token>"*)
        printf 'Error: placeholder <%s> survived rendering of %s.\n' "$token" "$template" >&2
        return 1
        ;;
    esac
  done

  printf '%s\n' "$body"
}

# ─── the launched command ────────────────────────────────────────────

# Every arm delivers the rendered prompt as a single INITIAL ARGV read back from
# $FIRSTMATE_PROMPT_FILE inside the launched shell, and no arm carries `--print`.
# Both rules exist so the child stays an interactive, attachable, multi-turn
# session — see the interactive-session note in this file's header.
firstmate_harness_command() { # <harness> <prompt_file>
  local harness="${1:-}" prompt_file="${2:-}"

  if [ -n "${FIRSTMATE_HARNESS_CMD:-}" ]; then
    # Full override. The prompt path reaches it as $FIRSTMATE_PROMPT_FILE,
    # exported below — no substitution magic, so the value stays inspectable.
    printf '%s\n' "$FIRSTMATE_HARNESS_CMD"
    return 0
  fi

  case "$harness" in
    claude)
      # shellcheck disable=SC2016  # deliberately unexpanded: the $(cat …) must
      # be evaluated inside the LAUNCHED shell, not here. The prompt is initial
      # ARGV, never stdin — see the interactive-session note in the header.
      printf 'claude %s "$(cat %q)"\n' \
        "${FIRSTMATE_CLAUDE_FLAGS:---dangerously-skip-permissions}" "$prompt_file"
      ;;
    pi)
      # shellcheck disable=SC2016  # same: expanded by the launched shell.
      printf 'pi %s "$(cat %q)"\n' "${FIRSTMATE_PI_FLAGS:-}" "$prompt_file"
      ;;
    codex)
      # shellcheck disable=SC2016  # same: expanded by the launched shell.
      printf 'codex exec --sandbox danger-full-access "$(cat %q)"\n' "$prompt_file"
      ;;
    *)
      printf "Error: unknown harness '%s' (expected: claude, pi, or codex).\n" "$harness" >&2
      return 2
      ;;
  esac
}

# ─── guards ──────────────────────────────────────────────────────────

# THE LAUNCH-CLAIM GUARD. `mkdir` is atomic: exactly one process can create the
# directory, which closes the check-then-start TOCTOU window that ANY read-only
# liveness oracle (`herdr agent get`, `tmux has-session`) leaves open between
# "no live session" and "session started". The oracle answers *is it alive*; the
# lock answers *who may start it*.
#
# A lock whose slug has NO live session is the debris of a hard crash (kill -9)
# and is STALE AND RECLAIMABLE — it must never wedge a slug permanently.
firstmate_claim_lock() { # <mode> <slug>
  local mode="${1:-}" slug="${2:-}" lock
  lock="$(runner_lock_path "$slug")"

  if mkdir "$lock" 2>/dev/null; then
    return 0
  fi

  if runner_alive "$mode" "$slug"; then
    printf "Error: a firstmate %s session for '%s' is already running (lock: %s).\n" "$mode" "$slug" "$lock" >&2
    printf "Hint: watch it, or clear it with .oh/scripts/firstmate.sh --kill %s\n" "$slug" >&2
    return 1
  fi

  runner_log "$slug" "stale lock $lock has no live $mode session — reclaiming (hard-crash recovery)"
  rm -rf "$lock" 2>/dev/null || true
  if mkdir "$lock" 2>/dev/null; then
    return 0
  fi
  printf 'Error: could not reclaim the stale lock %s.\n' "$lock" >&2
  return 1
}

# ─── launch reporting ────────────────────────────────────────────────

firstmate_session_handle() { # <mode> <slug>
  local mode="${1:-}" slug="${2:-}"
  case "$mode" in
    herdr) printf '%s (pane %s)\n' "$(runner_agent_name "$slug")" "$(runner_pane_id)" ;;
    tmux) runner_tmux_session "$slug" ;;
    *) printf 'foreground pid %s\n' "${RUNNER_FG_PID:-unknown}" ;;
  esac
}

firstmate_watch_command() { # <mode> <slug>
  local mode="${1:-}" slug="${2:-}"
  case "$mode" in
    herdr) printf 'herdr agent read %s --lines 80\n' "$(runner_agent_name "$slug")" ;;
    tmux) printf 'tmux attach -t %s\n' "$(runner_tmux_session "$slug")" ;;
    # foreground writes NO session log — the child inherits this shell's stdio so it
    # keeps a TTY (see the interactive-session note in this file's header). Printing a
    # `tail -f <log>` here would send the operator to a file the child never writes.
    *) printf 'this terminal (the child inherits its stdio)\n' ;;
  esac
}

# ─── --kill: the manual escape hatch ─────────────────────────────────

# Clears the lock, tears the session down through runner_teardown, and records
# the outcome in that task's progress.txt. It NEVER stops or restarts the herdr
# server — only the one pane this slug owns.
firstmate_kill() { # <slug>
  local slug="${1:-}" root task_dir lock
  task_contract_validate_slug "$slug" || exit 2

  root="$(firstmate_repo_root)"
  task_dir="$root/.oh/tasks/$slug"
  lock="$(runner_lock_path "$slug")"

  # The operator generally does not know which runner won the ladder, so tear
  # down every mode. Each branch is a no-op when that runner never launched.
  # herdr's branch is `pane close <pane_id>` — 0.7.4 has no agent stop/kill verb.
  runner_teardown herdr "$slug"
  runner_teardown foreground "$slug"
  # runner_abort covers the tmux branch AND the shared tail — lock removal plus
  # the FIRSTMATE-INCOMPLETE line — exactly once.
  runner_abort tmux "$slug" "$task_dir" "operator kill via firstmate.sh --kill"

  printf '✓ firstmate session for %s killed.\n' "$slug"
  printf '  lock:     %s (removed)\n' "$lock"
  if [ -f "$task_dir/progress.txt" ]; then
    printf '  progress: %s (FIRSTMATE-INCOMPLETE appended)\n' "$task_dir/progress.txt"
  fi
  printf '  note:     the herdr server was not stopped or restarted.\n'
}

# ─── launch ──────────────────────────────────────────────────────────

firstmate_launch() { # <slug>
  local slug="${1:-}"
  local root task_dir progress template prompt_file branch issue
  local mode harness cmd lock rc=0

  task_contract_validate_slug "$slug" || exit 2
  harness="$(normalize_harness "$HARNESS")" || exit 2

  root="$(firstmate_repo_root)"
  task_dir="$root/.oh/tasks/$slug"
  task_contract_validate_dir "$task_dir" || exit 1

  progress="$task_dir/progress.txt"
  lock="$(runner_lock_path "$slug")"

  # SENTINEL SHORT-CIRCUIT — the task is already done; launch nothing.
  if runner_sentinel_present "$progress"; then
    printf '✓ STATUS: COMPLETE is already present in %s — nothing to launch.\n' "$progress"
    exit 0
  fi

  mode="$(runner_detect "$slug" "$root" "$REQUESTED_RUNNER")" || rc=$?
  if [ "$rc" -ne 0 ] || [ -z "$mode" ]; then
    printf 'Error: could not resolve a runner for %s.\n' "$slug" >&2
    exit "$((rc == 0 ? 1 : rc))"
  fi

  firstmate_claim_lock "$mode" "$slug" || exit 1
  # From here on EVERY non-success exit must run the exit path, so the trap goes
  # in before anything that can fail.
  runner_install_abort_trap "$mode" "$slug" "$task_dir"

  template="$root/$FIRSTMATE_TEMPLATE_REL"
  branch="$(firstmate_branch_name "$task_dir/prd.json")"
  issue="$(firstmate_issue_number "$task_dir/prd.json")"
  prompt_file="$(firstmate_prompt_path "$slug")"

  if ! render_session_prompt "$template" "$slug" "$branch" "$issue" >"$prompt_file"; then
    rm -f "$prompt_file" 2>/dev/null || true
    runner_abort "$mode" "$slug" "$task_dir" "launch failure: could not render $template"
    exit 1
  fi

  cmd="$(firstmate_harness_command "$harness" "$prompt_file")" || {
    runner_abort "$mode" "$slug" "$task_dir" "launch failure: unknown harness $harness"
    exit 2
  }

  # The session's own signals. FIRSTMATE_SESSION=1 is the flag the rendered
  # prompt tells inner /delegate calls to key off when choosing a runner.
  export FIRSTMATE_SESSION=1
  export FIRSTMATE_SLUG="$slug"
  export FIRSTMATE_TASK_DIR="$task_dir"
  export FIRSTMATE_PROMPT_FILE="$prompt_file"

  if ! runner_launch "$mode" "$slug" "$root" "$cmd"; then
    runner_abort "$mode" "$slug" "$task_dir" "launch failure: runner_launch ($mode) returned non-zero"
    exit 1
  fi

  # cwd flags silently lie, and in herdr mode a wrong cwd means the session is
  # executing in a different environment entirely.
  if ! runner_verify_cwd "$mode" "$root"; then
    runner_abort "$mode" "$slug" "$task_dir" "launch failure: session cwd could not be verified as $root"
    exit 1
  fi

  printf '\n╭─ First Mate: %s\n' "$slug"
  printf '│  runner:   %s\n' "$mode"
  printf '│  handle:   %s\n' "$(firstmate_session_handle "$mode" "$slug")"
  printf '│  harness:  %s\n' "$harness"
  # Only tmux mode captures the session to a file (via pipe-pane); herdr owns its own
  # pane capture and foreground keeps none, so advertising a path there is a lie.
  case "$mode" in
    tmux) printf '│  log:      %s\n' "$(runner_session_log_path "$mode" "$slug")" ;;
    herdr) printf '│  log:      (herdr pane capture — read it with the watch command)\n' ;;
    *) printf '│  log:      (none — foreground inherits this terminal)\n' ;;
  esac
  printf '│  budget:   %sms\n' "$(resolve_timeout_ms "$slug")"
  printf '│  prompt:   %s\n' "$prompt_file"
  printf '│  progress: %s\n' "$progress"
  printf '│  watch:    %s\n' "$(firstmate_watch_command "$mode" "$slug")"
  printf '╰─\n\n'

  if [ "$WATCH" != "1" ]; then
    printf 'Launched with --no-watch: the session budget is NOT enforced by this\n'
    printf 'process and %s stays claimed. Clear it with:\n' "$lock"
    printf '  .oh/scripts/firstmate.sh --kill %s\n' "$slug"
    exit 0
  fi

  if runner_watch "$mode" "$slug" "$task_dir"; then
    runner_teardown "$mode" "$slug"
    rm -rf "$lock" 2>/dev/null || true
    printf '\n✓ STATUS: COMPLETE observed in %s — firstmate session for %s is done.\n' "$progress" "$slug"
    exit 0
  fi

  # runner_watch already ran the exit path via runner_abort: teardown ->
  # lock removal -> FIRSTMATE-INCOMPLETE.
  printf '\n✗ firstmate session for %s ended without STATUS: COMPLETE — see %s\n' "$slug" "$progress" >&2
  exit 1
}

# ─── Source guard ────────────────────────────────────────────────────
# When this file is SOURCED (the vitest suite exercises render_session_prompt
# and the guards in isolation) rather than executed, return here so only the
# function definitions land. The real invocation path executes the file
# directly, keeping BASH_SOURCE[0] == "$0", so this is a strict no-op for it.
if [ "${BASH_SOURCE[0]}" != "$0" ]; then
  return 0
fi

parse_args "$@"

if [ "$KILL_MODE" = "1" ]; then
  firstmate_kill "$SLUG"
  exit 0
fi

firstmate_launch "$SLUG"
