#!/usr/bin/env bash
# scripts/ralph.sh — Ralph loop runner per SPEC §scripts.
#
# Usage:   scripts/ralph.sh [--harness=claude|pi|codex|opencode|deepagents|codelayer] <taskdesc>
# Example: scripts/ralph.sh openharness-v07-convergence
# Example: scripts/ralph.sh --harness=pi openharness-v07-convergence
# Example: scripts/ralph.sh --harness=codex openharness-v07-convergence
# Example: scripts/ralph.sh --harness=opencode openharness-v07-convergence
# Example: scripts/ralph.sh --harness=deepagents openharness-v07-convergence
# Example: scripts/ralph.sh --harness=codelayer openharness-v07-convergence
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
#   --harness=claude     run Claude first (default); fall back to Codex after a
#                        recognized Claude usage-limit message
#   --harness=pi         run Pi for every iteration; fall back to Codex if Pi is
#                        unavailable
#   --harness=codex      run Codex for every iteration
#   --harness=opencode   run OpenCode for every iteration
#   --harness=deepagents run DeepAgents for every iteration; explicit opt-in only,
#                        no automatic fallback. Default flags use
#                        --shell-allow-list recommended (constrained shell);
#                        unrestricted shell requires an explicit operator
#                        override via RALPH_DEEPAGENTS_FLAGS — combined with the
#                        mounted Docker socket, --shell-allow-list all can affect
#                        sibling containers or host Docker, so use only for
#                        trusted tasks.
#   --harness=codelayer  run the optional local CodeLayer coding harness;
#                        explicit opt-in only and never an automatic fallback.
#
# Configuration (env vars):
#   RALPH_HARNESS              default harness if --harness is omitted
#                              (claude|pi|codex|opencode|deepagents|codelayer)
#   RALPH_CLAUDE_FLAGS         Claude flags (default: --dangerously-skip-permissions --print)
#   RALPH_AGENT_FLAGS          backwards-compatible alias for RALPH_CLAUDE_FLAGS
#   RALPH_PI_FLAGS             Pi flags (default: --print)
#   RALPH_OPENCODE_FLAGS       OpenCode run flags (default: empty)
#   RALPH_DEEPAGENTS_FLAGS     DeepAgents flags excluding the task and turn cap.
#                              Default: "-y --shell-allow-list recommended -q --no-stream".
#                              To allow unrestricted shell, set this to
#                              "-y --shell-allow-list all -q --no-stream"; combined with
#                              the mounted Docker socket, that can affect sibling
#                              containers or host Docker — only use for trusted tasks.
#   RALPH_CODELAYER_PROVIDER   optional provider emitted as exactly --provider VALUE
#   RALPH_CODELAYER_FLAGS      empty or simple whitespace-delimited tokens only;
#                              quotes, backslashes, shell metacharacters, globs,
#                              and prompt/provider options are rejected.
#   RALPH_DEEPAGENTS_MAX_TURNS per-call turn cap passed to DeepAgents as --max-turns
#                              (default: 25). Prevents a single DeepAgents call from
#                              hanging an iteration; always appended after the
#                              flag string above.
#   RALPH_MAX_ITERATIONS       safety cap (default: 50)
#   RALPH_SLEEP                seconds between iterations (default: 2)

set -euo pipefail

usage() {
  echo "Usage: $0 [--harness=claude|pi|codex|opencode|deepagents|codelayer] <taskdesc>" >&2
}

normalize_harness() {
  local harness="$1"
  case "$harness" in
    claude|pi|codex|opencode|deepagents|codelayer)
      printf '%s\n' "$harness"
      ;;
    *)
      echo "Error: unknown harness '$harness' (expected: claude, pi, codex, opencode, deepagents, or codelayer)." >&2
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
          echo "Error: --harness requires a value (claude, pi, codex, opencode, deepagents, or codelayer)." >&2
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
      if command -v codex >/dev/null 2>&1; then
        printf 'codex\n'
        return 0
      fi
      echo "Error: Claude usage limit detected, but fallback harness 'codex' is not on PATH." >&2
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

run_opencode() {
  local task="$1"
  local opencode_flags="${RALPH_OPENCODE_FLAGS:-}"

  # Intentionally leave flags unquoted so callers can provide multiple flags.
  # shellcheck disable=SC2086
  opencode run $opencode_flags "$task"
}

run_deepagents() {
  local task="$1"
  local max_turns="${RALPH_DEEPAGENTS_MAX_TURNS:-25}"
  # Default flags: non-interactive (-n is added below with the task), clean buffered
  # output (-q --no-stream), confirm-on-edits skipped (-y), and shell calls limited to
  # the recommended allow list. --shell-allow-list all opens unrestricted shell
  # execution; combined with the mounted Docker socket it can affect sibling
  # containers or the host Docker daemon, so it must be an explicit operator opt-in
  # via RALPH_DEEPAGENTS_FLAGS, never the default.
  local default_flags="-y --shell-allow-list recommended -q --no-stream"
  local deepagents_flags="${RALPH_DEEPAGENTS_FLAGS:-$default_flags}"

  # --max-turns is always appended (even if the operator overrides
  # RALPH_DEEPAGENTS_FLAGS) so a single DeepAgents call cannot hang the iteration.
  # Operators who set RALPH_DEEPAGENTS_FLAGS should not include --max-turns there;
  # adjust the cap via RALPH_DEEPAGENTS_MAX_TURNS instead.
  # Intentionally leave flags unquoted so callers can provide multiple flags.
  # shellcheck disable=SC2086
  deepagents $deepagents_flags --max-turns "$max_turns" -n "$task"
}

parse_codelayer_flags() {
  local raw="${RALPH_CODELAYER_FLAGS:-}"
  local token
  CODELAYER_FLAGS=()

  [[ "$raw" =~ ^[[:space:]]*$ ]] && return 0
  # Deliberately not shell syntax: only a conservative token alphabet is accepted.
  if [[ "$raw" =~ [\'\"\\\;\&\|\<\>\$\`\(\)\{\}\[\]\*\?\!\~] ]]; then
    echo "Error: RALPH_CODELAYER_FLAGS supports simple whitespace-delimited tokens only (no quotes, backslashes, shell metacharacters, or globs)." >&2
    return 2
  fi

  set -f
  read -r -a CODELAYER_FLAGS <<<"$raw"
  for token in "${CODELAYER_FLAGS[@]}"; do
    if [[ ! "$token" =~ ^[A-Za-z0-9_./:=+,-]+$ ]]; then
      echo "Error: unsupported character in RALPH_CODELAYER_FLAGS token '$token'." >&2
      return 2
    fi
    case "$token" in
      --prompt*|--provider*|-p*)
        echo "Error: RALPH_CODELAYER_FLAGS may not override Ralph-owned prompt/provider options ('$token')." >&2
        return 2
        ;;
    esac
  done
}

run_codelayer() (
  local task="$1"
  local provider="${RALPH_CODELAYER_PROVIDER:-}"
  local -a CODELAYER_FLAGS=()
  local -a command=(codelayer)
  set -f
  parse_codelayer_flags || exit $?
  command+=("${CODELAYER_FLAGS[@]}")
  if [ -n "$provider" ]; then
    command+=(--provider "$provider")
  fi
  command+=(--prompt "$task")
  "${command[@]}"
)

iteration_output_completes() {
  local harness="$1"
  local output_file="$2"
  [ "$harness" != "codelayer" ] && grep -q '^STATUS: COMPLETE$' "$output_file"
}

progress_file_completes() {
  grep -q '^STATUS: COMPLETE$' "$1"
}

run_iteration() {
  local harness="$1"
  local task="$2"
  local output_file="$3"
  local status

  export RALPH_HARNESS="$harness"
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
    opencode)
      run_opencode "$task" 2>&1 | tee "$output_file"
      status=${PIPESTATUS[0]}
      ;;
    deepagents)
      run_deepagents "$task" 2>&1 | tee "$output_file"
      status=${PIPESTATUS[0]}
      ;;
    codelayer)
      run_codelayer "$task" 2>&1 | tee "$output_file"
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

# ─── Source guard ────────────────────────────────────────────────────
# When this file is sourced (e.g. unit tests exercising the functions
# above in isolation) rather than executed, return here so the loop /
# normal-mode body below does not run — sourcing only defines functions.
# All three real invocation paths execute the file directly, keeping
# BASH_SOURCE[0] == "$0", so the guard is a strict no-op for them:
#   1. direct execution:       scripts/ralph.sh <taskdesc>
#   2. the --loop re-entry:     bash "$SCRIPT_PATH" --loop ...
#   3. the no-tmux foreground:  exec bash "$SCRIPT_PATH" --loop ...
if [ "${BASH_SOURCE[0]}" != "$0" ]; then
  return 0
fi

# ─── Loop mode (re-entry from inside tmux) ───────────────────────────
if [ "${1-}" = "--loop" ]; then
  shift
  parse_args "$@"

  REPO_ROOT="${REPO_ROOT:-$(pwd)}"
  TASK_DIR="$REPO_ROOT/.oh/tasks/$TASKDESC"
  PROMPT="$TASK_DIR/prompt.md"
  PROGRESS="$TASK_DIR/progress.txt"
  ACTIVE_HARNESS="$(resolve_initial_harness "$HARNESS")"
  CLAUDE_FLAGS="${RALPH_CLAUDE_FLAGS:-${RALPH_AGENT_FLAGS:---dangerously-skip-permissions --print}}"
  DEEPAGENTS_FLAGS="${RALPH_DEEPAGENTS_FLAGS:--y --shell-allow-list recommended -q --no-stream}"
  DEEPAGENTS_MAX_TURNS="${RALPH_DEEPAGENTS_MAX_TURNS:-25}"
  MAX_ITER="${RALPH_MAX_ITERATIONS:-50}"
  SLEEP_SECONDS="${RALPH_SLEEP:-2}"

  cd "$REPO_ROOT"
  require_harness_command "$ACTIVE_HARNESS"

  printf '\n╭─ Ralph: %s\n' "$TASKDESC"
  printf '│  harness: %s\n' "$ACTIVE_HARNESS"
  printf '│  claude: claude %s\n' "$CLAUDE_FLAGS"
  printf '│  pi: pi %s <task>\n' "${RALPH_PI_FLAGS:---print}"
  printf '│  codex: codex exec --sandbox danger-full-access <task>\n'
  printf '│  opencode: opencode run %s <task>\n' "${RALPH_OPENCODE_FLAGS:-}"
  printf '│  deepagents: deepagents %s --max-turns %s -n <task>\n' "$DEEPAGENTS_FLAGS" "$DEEPAGENTS_MAX_TURNS"
  printf '│  codelayer: codelayer <validated flags>%s --prompt <task> (installed only; auth not inferred)\n' "${RALPH_CODELAYER_PROVIDER:+ --provider $RALPH_CODELAYER_PROVIDER}"
  printf '│  max iterations: %s\n' "$MAX_ITER"
  printf '│  progress: %s\n╰─\n\n' "$PROGRESS"

  i=0
  COMPLETED=0
  while [ "$i" -lt "$MAX_ITER" ]; do
    i=$((i + 1))
    if progress_file_completes "$PROGRESS"; then
      printf '\n✓ STATUS: COMPLETE found in progress.txt — exiting at iteration %d.\n' "$i"
      COMPLETED=1
      break
    fi

    printf '\n── iteration %d / %s (%s) ──────────────────────────────\n' "$i" "$MAX_ITER" "$ACTIVE_HARNESS"

    # All harnesses receive the same Ralph task text from prompt.md. Claude gets
    # it on stdin (matching historical behavior); Pi, Codex, and OpenCode get it as the
    # prompt/task argument required by their CLIs.
    TASK_TEXT="$(cat "$PROMPT")"
    ITERATION_OUTPUT="$(mktemp -t "ralph-$TASKDESC-$i.XXXXXX")"

    run_iteration "$ACTIVE_HARNESS" "$TASK_TEXT" "$ITERATION_OUTPUT" || true

    # CodeLayer's wrapped/final output is diagnostic only: Ralph completion for
    # that adapter is authoritative only through progress.txt. Preserve the
    # historical output self-heal channel for all other harnesses.
    if iteration_output_completes "$ACTIVE_HARNESS" "$ITERATION_OUTPUT"; then
      printf '\n✓ STATUS: COMPLETE detected in iteration output — exiting at iteration %d.\n' "$i"
      grep -q '^STATUS: COMPLETE$' "$PROGRESS" || printf 'STATUS: COMPLETE\n' >>"$PROGRESS"
      COMPLETED=1
      rm -f "$ITERATION_OUTPUT"
      break
    fi

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

  if [ "$i" -ge "$MAX_ITER" ] && ! progress_file_completes "$PROGRESS"; then
    printf '\n✗ Reached max iterations (%s) without STATUS: COMPLETE.\n' "$MAX_ITER"
    printf '  Inspect: tail -n 50 %s\n' "$PROGRESS"
  fi

  # On a clean completion, close our own tmux session instead of lingering as a
  # zombie — progress.txt and /tmp/ralph-$TASKDESC.log persist for inspection,
  # and the autopilot poller already treats a gone session + STATUS: COMPLETE as
  # done. The persist-for-inspection shell below is reserved for the failure
  # path (max iterations without completion) so a stuck run stays attachable.
  if [ "$COMPLETED" = "1" ]; then
    printf '\n✓ Ralph complete — closing session %s.\n' "$TASKDESC"
    if command -v tmux >/dev/null 2>&1 && [ -n "${TMUX:-}" ]; then
      tmux kill-session -t "$TASKDESC" 2>/dev/null || true
    fi
    exit 0
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
TASK_DIR="$REPO_ROOT/.oh/tasks/$TASKDESC"

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

# tmux servers retain their own environment and may predate this invocation.
# Carry only the two CodeLayer adapter controls into the pane command; do not
# depend on tmux update-environment, forward the caller's unrelated environment,
# or perform dynamic shell reconstruction.
LAUNCH_CMD="REPO_ROOT=$(printf %q "$REPO_ROOT") RALPH_CODELAYER_PROVIDER=$(printf %q "${RALPH_CODELAYER_PROVIDER:-}") RALPH_CODELAYER_FLAGS=$(printf %q "${RALPH_CODELAYER_FLAGS:-}") bash $(printf %q "$SCRIPT_PATH") --loop --harness=$(printf %q "$HARNESS") $(printf %q "$TASKDESC") 2>&1 | tee $(printf %q "/tmp/ralph-$TASKDESC.log")"
tmux new-session -d -s "$TASKDESC" "$LAUNCH_CMD"

echo "✓ Launched tmux session: $TASKDESC"
echo "  Harness: $HARNESS"
echo "  Attach:  tmux attach -t $TASKDESC"
echo "  Tail:    tail -f $TASK_DIR/progress.txt"
echo "  Log:     tail -f /tmp/ralph-$TASKDESC.log"
echo "  Kill:    tmux kill-session -t $TASKDESC"
