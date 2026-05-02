#!/usr/bin/env bash
# scripts/ralph.sh — Ralph loop runner per SPEC §scripts.
#
# Usage:   scripts/ralph.sh [--harness=claude|pi|codex] <taskdesc>
# Example: scripts/ralph.sh openharness-v07-convergence
# Example: scripts/ralph.sh --harness=pi openharness-v07-convergence
# Example: scripts/ralph.sh --harness=codex openharness-v07-convergence
#
# Validates the four-file contract (prd.md, prd.json, prompt.md, progress.txt),
# launches a named tmux session running the loop. Each iteration sends prompt.md
# to the selected harness (default: Claude). The agent is responsible for editing
# files, committing, updating prd.json (passes: true), and appending to
# progress.txt. Loop terminates when progress.txt contains a line:
# STATUS: COMPLETE.
#
# Idempotent: re-invoking on an existing session attaches instead of duplicating.
#
# Harnesses:
#   --harness=claude   run Claude first (default); fall back to Pi after a
#                      recognized Claude usage-limit message; Codex is fallback
#                      after Pi if Pi is unavailable
#   --harness=pi       run Pi for every iteration; fall back to Codex if Pi is
#                      unavailable
#   --harness=codex    run Codex for every iteration
#
# Configuration (env vars):
#   RALPH_HARNESS        default harness if --harness is omitted (claude|pi|codex)
#   RALPH_CLAUDE_FLAGS   Claude flags (default: --dangerously-skip-permissions --print)
#   RALPH_AGENT_FLAGS    backwards-compatible alias for RALPH_CLAUDE_FLAGS
#   RALPH_PI_FLAGS       Pi flags (default: --print)
#   RALPH_MAX_ITERATIONS safety cap (default: 50)
#   RALPH_SLEEP          seconds between iterations (default: 2)

set -euo pipefail

usage() {
  echo "Usage: $0 [--harness=claude|pi|codex] <taskdesc>" >&2
}

normalize_harness() {
  local harness="$1"
  case "$harness" in
    claude|pi|codex)
      printf '%s\n' "$harness"
      ;;
    *)
      echo "Error: unknown harness '$harness' (expected: claude, pi, or codex)." >&2
      exit 2
      ;;
  esac
}

parse_args() {
  HARNESS="${RALPH_HARNESS:-claude}"
  POSITIONAL=()

  while [ "$#" -gt 0 ]; do
    case "$1" in
      --harness=*)
        HARNESS="${1#--harness=}"
        ;;
      --harness)
        shift
        if [ "${1-}" = "" ]; then
          echo "Error: --harness requires a value (claude, pi, or codex)." >&2
          exit 2
        fi
        HARNESS="$1"
        ;;
      --)
        shift
        while [ "$#" -gt 0 ]; do
          POSITIONAL+=("$1")
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
        POSITIONAL+=("$1")
        ;;
    esac
    shift
  done

  HARNESS="$(normalize_harness "$HARNESS")"

  if [ "${#POSITIONAL[@]}" -ne 1 ]; then
    usage
    exit 2
  fi

  TASKDESC="${POSITIONAL[0]}"
}

require_harness_command() {
  local harness="$1"
  local command_name="$harness"

  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Error: active harness '$harness' requires '$command_name' on PATH." >&2
    exit 1
  fi
}

fallback_after_harness() {
  local harness="$1"

  case "$harness" in
    claude)
      if command -v pi >/dev/null 2>&1; then
        printf 'pi\n'
        return 0
      fi
      if command -v codex >/dev/null 2>&1; then
        printf 'codex\n'
        return 0
      fi
      echo "Error: Claude usage limit detected, but fallback harnesses 'pi' and 'codex' are not on PATH." >&2
      return 1
      ;;
    pi)
      if command -v codex >/dev/null 2>&1; then
        printf 'codex\n'
        return 0
      fi
      echo "Error: fallback harness 'codex' is not on PATH after Pi." >&2
      return 1
      ;;
    *)
      echo "Error: no fallback configured after harness '$harness'." >&2
      return 1
      ;;
  esac
}

resolve_initial_harness() {
  local harness="$1"
  local fallback

  if command -v "$harness" >/dev/null 2>&1; then
    printf '%s\n' "$harness"
    return 0
  fi

  if [ "$harness" = "pi" ]; then
    fallback="$(fallback_after_harness pi)" || exit 1
    echo "Warning: harness 'pi' is not on PATH; starting with fallback harness '$fallback'." >&2
    printf '%s\n' "$fallback"
    return 0
  fi

  echo "Error: active harness '$harness' requires '$harness' on PATH." >&2
  exit 1
}

claude_limit_detected() {
  local output_file="$1"

  grep -Eiq 'hit (your |the )?limit' "$output_file" && grep -Eiq 'resets?' "$output_file"
}

run_claude() {
  local task="$1"
  local claude_flags="${RALPH_CLAUDE_FLAGS:-${RALPH_AGENT_FLAGS:---dangerously-skip-permissions --print}}"

  # Intentionally leave flags unquoted so callers can provide multiple flags.
  # shellcheck disable=SC2086
  printf '%s' "$task" | claude $claude_flags
}

run_pi() {
  local task="$1"
  local pi_flags="${RALPH_PI_FLAGS:---print}"

  # Intentionally leave flags unquoted so callers can provide multiple flags.
  # shellcheck disable=SC2086
  pi $pi_flags "$task"
}

run_codex() {
  local task="$1"

  codex exec --sandbox danger-full-access "$task"
}

run_iteration() {
  local harness="$1"
  local task="$2"
  local output_file="$3"
  local status

  set +e
  case "$harness" in
    claude)
      run_claude "$task" 2>&1 | tee "$output_file"
      status=${PIPESTATUS[0]}
      ;;
    pi)
      run_pi "$task" 2>&1 | tee "$output_file"
      status=${PIPESTATUS[0]}
      ;;
    codex)
      run_codex "$task" 2>&1 | tee "$output_file"
      status=${PIPESTATUS[0]}
      ;;
    *)
      echo "Error: internal unknown harness '$harness'." >&2
      status=2
      ;;
  esac
  set -e

  return "$status"
}

# ─── Loop mode (re-entry from inside tmux) ───────────────────────────
if [ "${1-}" = "--loop" ]; then
  shift
  parse_args "$@"

  REPO_ROOT="${REPO_ROOT:-$(pwd)}"
  TASK_DIR="$REPO_ROOT/tasks/$TASKDESC"
  PROMPT="$TASK_DIR/prompt.md"
  PROGRESS="$TASK_DIR/progress.txt"
  ACTIVE_HARNESS="$(resolve_initial_harness "$HARNESS")"
  CLAUDE_FLAGS="${RALPH_CLAUDE_FLAGS:-${RALPH_AGENT_FLAGS:---dangerously-skip-permissions --print}}"
  MAX_ITER="${RALPH_MAX_ITERATIONS:-50}"
  SLEEP_SECONDS="${RALPH_SLEEP:-2}"

  cd "$REPO_ROOT"
  require_harness_command "$ACTIVE_HARNESS"

  printf '\n╭─ Ralph: %s\n' "$TASKDESC"
  printf '│  harness: %s\n' "$ACTIVE_HARNESS"
  printf '│  claude: claude %s\n' "$CLAUDE_FLAGS"
  printf '│  pi: pi %s <task>\n' "${RALPH_PI_FLAGS:---print}"
  printf '│  codex: codex exec --sandbox danger-full-access <task>\n'
  printf '│  max iterations: %s\n' "$MAX_ITER"
  printf '│  progress: %s\n╰─\n\n' "$PROGRESS"

  i=0
  while [ "$i" -lt "$MAX_ITER" ]; do
    i=$((i + 1))
    if grep -q '^STATUS: COMPLETE$' "$PROGRESS"; then
      printf '\n✓ STATUS: COMPLETE found in progress.txt — exiting at iteration %d.\n' "$i"
      break
    fi

    printf '\n── iteration %d / %s (%s) ──────────────────────────────\n' "$i" "$MAX_ITER" "$ACTIVE_HARNESS"

    # All harnesses receive the same Ralph task text from prompt.md. Claude gets
    # it on stdin (matching historical behavior); Pi and Codex get it as the
    # prompt/task argument required by their CLIs.
    TASK_TEXT="$(cat "$PROMPT")"
    ITERATION_OUTPUT="$(mktemp -t "ralph-$TASKDESC-$i.XXXXXX")"

    run_iteration "$ACTIVE_HARNESS" "$TASK_TEXT" "$ITERATION_OUTPUT" || true

    if [ "$ACTIVE_HARNESS" = "claude" ] && claude_limit_detected "$ITERATION_OUTPUT"; then
      FALLBACK_HARNESS="$(fallback_after_harness claude)" || {
        rm -f "$ITERATION_OUTPUT"
        exit 1
      }
      printf '\n⚠ Claude usage limit detected; switching Ralph harness to %s for subsequent iterations.\n' "$FALLBACK_HARNESS"
      ACTIVE_HARNESS="$FALLBACK_HARNESS"
    fi

    rm -f "$ITERATION_OUTPUT"
    sleep "$SLEEP_SECONDS"
  done

  if [ "$i" -ge "$MAX_ITER" ] && ! grep -q '^STATUS: COMPLETE$' "$PROGRESS"; then
    printf '\n✗ Reached max iterations (%s) without STATUS: COMPLETE.\n' "$MAX_ITER"
    printf '  Inspect: tail -n 50 %s\n' "$PROGRESS"
  fi

  printf '\nSession persists for inspection.\n'
  printf '  Detach: Ctrl-b d\n'
  printf '  Kill:   tmux kill-session -t %s\n\n' "$TASKDESC"
  exec bash
fi

# ─── Normal mode: validate args + launch tmux ───────────────────────
parse_args "$@"

# Per SPEC: kebab-case, shell-safe (used as tmux session name).
if ! [[ "$TASKDESC" =~ ^[a-z0-9-]+$ ]]; then
  echo "Error: <taskdesc> must match ^[a-z0-9-]+\$ (got: '$TASKDESC')" >&2
  exit 2
fi

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
TASK_DIR="$REPO_ROOT/tasks/$TASKDESC"

if [ ! -d "$TASK_DIR" ]; then
  echo "Error: $TASK_DIR does not exist." >&2
  echo "Hint: scaffold a task with /prd then /ralph first." >&2
  exit 1
fi

# Four-file contract per SPEC §tasks/.
for f in prd.md prd.json prompt.md progress.txt; do
  if [ ! -f "$TASK_DIR/$f" ]; then
    echo "Error: $TASK_DIR/$f is missing (SPEC §tasks/ four-file contract)." >&2
    exit 1
  fi
done

HARNESS="$(resolve_initial_harness "$HARNESS")"
require_harness_command "$HARNESS"

# ─── Idempotent: if session exists, attach ──────────────────────────
if command -v tmux >/dev/null 2>&1 && tmux has-session -t "$TASKDESC" 2>/dev/null; then
  echo "Session '$TASKDESC' exists — attaching."
  exec tmux attach -t "$TASKDESC"
fi

# ─── Launch new tmux session ────────────────────────────────────────
SCRIPT_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"

if ! command -v tmux >/dev/null 2>&1; then
  echo "Warning: tmux not found — running loop in foreground." >&2
  REPO_ROOT="$REPO_ROOT" exec bash "$SCRIPT_PATH" --loop --harness="$HARNESS" "$TASKDESC"
fi

LAUNCH_CMD="REPO_ROOT=$(printf %q "$REPO_ROOT") bash $(printf %q "$SCRIPT_PATH") --loop --harness=$(printf %q "$HARNESS") $(printf %q "$TASKDESC") 2>&1 | tee $(printf %q "/tmp/ralph-$TASKDESC.log")"
tmux new-session -d -s "$TASKDESC" "$LAUNCH_CMD"

echo "✓ Launched tmux session: $TASKDESC"
echo "  Harness: $HARNESS"
echo "  Attach:  tmux attach -t $TASKDESC"
echo "  Tail:    tail -f $TASK_DIR/progress.txt"
echo "  Log:     tail -f /tmp/ralph-$TASKDESC.log"
echo "  Kill:    tmux kill-session -t $TASKDESC"
