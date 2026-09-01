#!/usr/bin/env bash
# tier: A
# source: issue #928 — retire automated /spec agent handoff
# desc: the weekly task sweep archives on the progress.txt STATUS marker alone; it never
#       detects or kills a separately launched implementation-agent session
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
CLEANUP="$ROOT/crons/cleanup-tasks.md"
TASKS="$ROOT/.oh/tasks/README.md"

for file in "$CLEANUP" "$TASKS"; do
  [[ -f "$file" ]] || { echo "SKIPPED: required file absent: $file" >&2; exit 2; }
done

found=()
retired_session='agent-''spec-'
hits=$(grep -nF -- "$retired_session" "$CLEANUP" "$TASKS" || true)
[[ -n "$hits" ]] && found+=("retired session prefix '$retired_session': ${hits//$'\n'/ ; }")

kill_hits=$(grep -nF -- 'tmux kill-session' "$CLEANUP" || true)
[[ -n "$kill_hits" ]] && found+=("sweep kills an agent session: ${kill_hits//$'\n'/ ; }")

missing=()
grep -qF 'STATUS: COMPLETE' "$CLEANUP" || missing+=("sweep no longer keys archival on the progress.txt STATUS: COMPLETE marker")
grep -qiF 'never' "$CLEANUP" && grep -qiF 'tied to a terminal session' "$CLEANUP" \
  || missing+=("sweep no longer states that task state is untied from a terminal session")

# The sweep's live-pane guard is a worktree-grooming safety check on foreign work, not an
# implementation-agent handoff: it must survive this decoupling.
grep -qF 'tmux list-panes' "$CLEANUP" || missing+=("sweep lost its live-pane worktree-grooming guard (tmux list-panes)")

if (( ${#found[@]} + ${#missing[@]} )); then
  printf 'REGRESSION: task cleanup recoupled to an implementation-agent session:\n' >&2
  (( ${#found[@]} )) && printf '  - %s\n' "${found[@]}" >&2
  (( ${#missing[@]} )) && printf '  - %s\n' "${missing[@]}" >&2
  exit 1
fi

echo "PASS: task cleanup archives on STATUS: COMPLETE alone, kills no agent session, and keeps its live-pane grooming guard" >&2
