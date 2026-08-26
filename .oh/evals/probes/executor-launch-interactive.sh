#!/usr/bin/env bash
# tier: A
# source: .oh/tasks/spec-simplification/ (issue #816, US-002) — OBSERVED 2026-08-23: the build
#         child started, printed only startup warnings, and never advanced
# desc: every build-executor launch path keeps the child session INTERACTIVE. No arm carries
#       `--print` (which makes the harness answer once and exit), and no arm pipes or
#       redirects the launched command (which replaces the child's TTY with a pipe, and an
#       interactive agent session cannot run without a terminal). Both defects were live.
# shellcheck disable=SC2016
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
FIRSTMATE="$ROOT/.oh/scripts/firstmate.sh"
RUNNER="$ROOT/.oh/scripts/lib/session-runner.sh"

for f in "$FIRSTMATE" "$RUNNER"; do
  if [ ! -f "$f" ]; then
    echo "SKIPPED: required file absent: $f" >&2
    exit 2
  fi
done

missing=()

fm_code="$(grep -v '^[[:space:]]*#' "$FIRSTMATE")"
rn_code="$(grep -v '^[[:space:]]*#' "$RUNNER")"

printf '%s\n' "$fm_code" | grep -Fq -- '--print' \
  && missing+=("firstmate.sh: a launch path still carries --print (the child would answer once and exit)")
printf '%s\n' "$rn_code" | grep -Fq -- '--print' \
  && missing+=("session-runner.sh: a launch path still carries --print")

printf '%s\n' "$fm_code" | grep -Eq 'cat [^|]*\| *(claude|pi|codex)' \
  && missing+=("firstmate.sh: a launch arm still pipes the prompt into the harness on stdin (stdin would not be a TTY)")

for arm in claude pi codex; do
  printf '%s\n' "$fm_code" | grep -Fq "printf '$arm" \
    || printf '%s\n' "$fm_code" | grep -Fq "$arm %s \"\$(cat" \
    || missing+=("firstmate.sh: the $arm arm does not deliver the prompt as \"\$(cat <file>)\" initial argv")
done

printf '%s\n' "$rn_code" | grep -Fq '| tee' \
  && missing+=("session-runner.sh: the launched command is piped into tee again (this takes the child's TTY away — the exact defect observed 2026-08-23)")
printf '%s\n' "$rn_code" | grep -Eq '\$cmd[^\n]*(\||>)' \
  && missing+=("session-runner.sh: \$cmd is piped or redirected in runner_launch (the child must inherit a TTY)")
printf '%s\n' "$rn_code" | grep -Fq 'tmux pipe-pane' \
  || missing+=("session-runner.sh: tmux mode no longer captures output with 'tmux pipe-pane' (the TTY-preserving logging path is gone)")

if [ "${#missing[@]}" -gt 0 ]; then
  printf 'REGRESSION: the build executor no longer launches an interactive session:\n' >&2
  printf '  - %s\n' "${missing[@]}" >&2
  exit 1
fi

echo "PASS: no launch path carries --print, the prompt is initial argv on all three harness arms, and no branch pipes or redirects the launched command (tmux logs via pipe-pane)" >&2
exit 0
