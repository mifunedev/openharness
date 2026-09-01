#!/usr/bin/env bash
# tier: A
# source: issue #928 — retire automated /spec agent handoff
# desc: active /spec surfaces neither launch nor prescribe a second coding-agent process —
#       no multiplexer session, Herdr workspace/tab/pane, background shell, or generic runner
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SPEC="$ROOT/.oh/skills/spec"
EXEC="$SPEC/references/execute.md"
SKILL="$SPEC/SKILL.md"

for file in "$EXEC" "$SKILL"; do
  [[ -f "$file" ]] || { echo "SKIPPED: required file absent: $file" >&2; exit 2; }
done

mapfile -t SURFACES < <(find "$SPEC" -type f \( -name '*.md' -o -name '*.sh' \) | sort)
(( ${#SURFACES[@]} )) || { echo "SKIPPED: no /spec surfaces found under $SPEC" >&2; exit 2; }

launch_literals=(
  'tmux new-session' 'tmux new -s' 'tmux pipe-pane' 'tmux send-keys'
  'tmux attach' 'tmux kill-session' 'tmux list-sessions'
  'herdr agent start' 'herdr tab create' 'herdr workspace create' 'herdr pane split'
  'nohup ' 'setsid ' 'run_in_background'
  'SPEC_RUNNER' 'AUTOPILOT_EXECUTOR' 'session-runner' '--executor'
)

found=()
for literal in "${launch_literals[@]}"; do
  hits=$(grep -rnF -- "$literal" "${SURFACES[@]}" || true)
  [[ -n "$hits" ]] && found+=("agent-launch literal '$literal': ${hits//$'\n'/ ; }")
done

missing=()
grep -qiF 'This node launches nothing' "$EXEC" || missing+=("execute.md no longer states that the node launches nothing")
grep -qiF 'It does not create the agent that' "$EXEC" || missing+=("execute.md no longer states that /spec does not create the agent that executes it")
grep -qiF 'no fallback runner because there' "$EXEC" || missing+=("execute.md no longer states there is no fallback runner because there is no handoff")
grep -qiF 'Launch a coding agent.' "$EXEC" || missing+=("execute.md's 'What this node does NOT do' no longer forbids launching a coding agent")
grep -qiF 'never launches another coding-agent process' "$SKILL" || missing+=("/spec dispatcher no longer states it never launches another coding-agent process")

if (( ${#found[@]} + ${#missing[@]} )); then
  printf 'REGRESSION: /spec reintroduced automated agent handoff:\n' >&2
  (( ${#found[@]} )) && printf '  - %s\n' "${found[@]}" >&2
  (( ${#missing[@]} )) && printf '  - %s\n' "${missing[@]}" >&2
  exit 1
fi

echo "PASS: no /spec surface launches or prescribes a second coding-agent process; the running agent is the owner" >&2
