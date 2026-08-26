#!/usr/bin/env bash

set -euo pipefail

FIRSTMATE_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=/dev/null
. "$FIRSTMATE_SCRIPT_DIR/lib/session-runner.sh"
# shellcheck source=/dev/null
. "$FIRSTMATE_SCRIPT_DIR/lib/task-contract.sh"

FIRSTMATE_TEMPLATE_REL=".oh/skills/firstmate/templates/session-prompt.md"

FIRSTMATE_PLACEHOLDERS="slug branch issue"

usage() {
  cat >&2 <<'EOF'
Usage: firstmate.sh [--runner herdr|tmux|foreground] [--harness claude|pi|codex]
                    [--no-watch] <slug>
       firstmate.sh --kill <slug>
EOF
}


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

normalize_harness() {
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


firstmate_repo_root() {
  git rev-parse --show-toplevel 2>/dev/null || pwd
}

firstmate_prompt_path() {
  printf '%s\n' "${RUNNER_TMPDIR:-/tmp}/firstmate-${1:-}.prompt.md"
}


firstmate_json_field() {
  local prd="${1:-}" filter="${2:-}"
  [ -f "$prd" ] || return 0
  command -v jq >/dev/null 2>&1 || return 0
  jq -r "$filter" "$prd" 2>/dev/null || true
}

firstmate_branch_name() {
  local prd="${1:-}" branch=""
  if [ -n "${FIRSTMATE_BRANCH:-}" ]; then
    printf '%s\n' "$FIRSTMATE_BRANCH"
    return 0
  fi
  branch="$(firstmate_json_field "$prd" '.branchName // empty')"
  if [ -z "$branch" ] && [ -f "$prd" ]; then
    branch="$( { sed -n 's/.*"branchName"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$prd" || true; } | head -n 1)"
  fi
  [ -n "$branch" ] || branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
  [ -n "$branch" ] || branch="unknown"
  printf '%s\n' "$branch"
}

firstmate_issue_number() {
  local prd="${1:-}" issue=""
  if [ -n "${FIRSTMATE_ISSUE:-}" ]; then
    printf '%s\n' "${FIRSTMATE_ISSUE#\#}"
    return 0
  fi
  issue="$(firstmate_json_field "$prd" '(.issue // .issueNumber // empty) | tostring')"
  if [ -z "$issue" ] && [ -f "$prd" ]; then
    issue="$( { grep -oE '#[0-9]+' "$prd" || true; } | head -n 1 | tr -d '#')"
  fi
  [ -n "$issue" ] || issue="unknown"
  printf '%s\n' "$issue"
}


render_session_prompt() {
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


firstmate_harness_command() {
  local harness="${1:-}" prompt_file="${2:-}"

  if [ -n "${FIRSTMATE_HARNESS_CMD:-}" ]; then
    printf '%s\n' "$FIRSTMATE_HARNESS_CMD"
    return 0
  fi

  case "$harness" in
    claude)
      # shellcheck disable=SC2016  # deliberately unexpanded: the $(cat …) must
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


firstmate_claim_lock() {
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


firstmate_session_handle() {
  local mode="${1:-}" slug="${2:-}"
  case "$mode" in
    herdr) printf '%s (pane %s)\n' "$(runner_agent_name "$slug")" "$(runner_pane_id)" ;;
    tmux) runner_tmux_session "$slug" ;;
    *) printf 'foreground pid %s\n' "${RUNNER_FG_PID:-unknown}" ;;
  esac
}

firstmate_watch_command() {
  local mode="${1:-}" slug="${2:-}"
  case "$mode" in
    herdr) printf 'herdr agent read %s --lines 80\n' "$(runner_agent_name "$slug")" ;;
    tmux) printf 'tmux attach -t %s\n' "$(runner_tmux_session "$slug")" ;;
    *) printf 'this terminal (the child inherits its stdio)\n' ;;
  esac
}


firstmate_kill() {
  local slug="${1:-}" root task_dir lock
  task_contract_validate_slug "$slug" || exit 2

  root="$(firstmate_repo_root)"
  task_dir="$root/.oh/tasks/$slug"
  lock="$(runner_lock_path "$slug")"

  runner_teardown herdr "$slug"
  runner_teardown foreground "$slug"
  runner_abort tmux "$slug" "$task_dir" "operator kill via firstmate.sh --kill"

  printf '✓ firstmate session for %s killed.\n' "$slug"
  printf '  lock:     %s (removed)\n' "$lock"
  if [ -f "$task_dir/progress.txt" ]; then
    printf '  progress: %s (FIRSTMATE-INCOMPLETE appended)\n' "$task_dir/progress.txt"
  fi
  printf '  note:     the herdr server was not stopped or restarted.\n'
}


firstmate_launch() {
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

  export FIRSTMATE_SESSION=1
  export FIRSTMATE_SLUG="$slug"
  export FIRSTMATE_TASK_DIR="$task_dir"
  export FIRSTMATE_PROMPT_FILE="$prompt_file"

  if ! runner_launch "$mode" "$slug" "$root" "$cmd"; then
    runner_abort "$mode" "$slug" "$task_dir" "launch failure: runner_launch ($mode) returned non-zero"
    exit 1
  fi

  if ! runner_verify_cwd "$mode" "$root"; then
    runner_abort "$mode" "$slug" "$task_dir" "launch failure: session cwd could not be verified as $root"
    exit 1
  fi

  printf '\n╭─ First Mate: %s\n' "$slug"
  printf '│  runner:   %s\n' "$mode"
  printf '│  handle:   %s\n' "$(firstmate_session_handle "$mode" "$slug")"
  printf '│  harness:  %s\n' "$harness"
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

  printf '\n✗ firstmate session for %s ended without STATUS: COMPLETE — see %s\n' "$slug" "$progress" >&2
  exit 1
}

if [ "${BASH_SOURCE[0]}" != "$0" ]; then
  return 0
fi

parse_args "$@"

if [ "$KILL_MODE" = "1" ]; then
  firstmate_kill "$SLUG"
  exit 0
fi

firstmate_launch "$SLUG"
