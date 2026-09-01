#!/usr/bin/env bash
# tier: A
# source: issue #928 — retire automated /spec agent handoff
# desc: retiring the /spec Advisor handoff must not strip tmux from independently justified
#       headless infrastructure — cron runtime, gateway clients, tunnels, and the T3 Code server
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PROC="$ROOT/.oh/skills/t3/references/sandbox-processes.md"
GATEWAY="$ROOT/.oh/scripts/gateway.sh"
CRON_RUNTIME="$ROOT/.oh/scripts/cron-runtime.ts"
CRON_GUIDE="$ROOT/crons/AGENTS.md"
ENTRYPOINT="$ROOT/.devcontainer/entrypoint.sh"

for file in "$PROC" "$GATEWAY" "$CRON_RUNTIME" "$CRON_GUIDE" "$ENTRYPOINT"; do
  [[ -f "$file" ]] || { echo "SKIPPED: required file absent: $file" >&2; exit 2; }
done

missing=()

grep -qF 'MUST run inside a named tmux' "$PROC" || missing+=("sandbox-processes.md lost the named-tmux rule for long-running processes")
grep -qF '## Session Naming' "$PROC" || missing+=("sandbox-processes.md lost the tmux session-naming convention")
for category in '`cron-`' '`client-`' '`cloudflared-`' '`app-`' '`agent-`'; do
  grep -qF "$category" "$PROC" || missing+=("sandbox-processes.md lost the $category tmux session category")
done
grep -qF 'why tmux, not a service' "$PROC" || missing+=("sandbox-processes.md lost the gateway tmux-vs-service rationale")

grep -qF 'tmux' "$GATEWAY" || missing+=("gateway.sh no longer runs its client in tmux")
grep -qF 'tmux' "$CRON_RUNTIME" || missing+=("cron-runtime.ts no longer manages tmux sessions")
grep -qF 'tmuxSessionName' "$CRON_RUNTIME" || missing+=("cron-runtime.ts lost its tmux session naming for detached fires")
grep -qF 'cron-<id>-<MMDD>-<HHMM>' "$CRON_GUIDE" || missing+=("crons/AGENTS.md lost the detached-fire tmux session convention")
grep -qF 'tmux' "$ENTRYPOINT" || missing+=("the sandbox entrypoint no longer starts its tmux supervisor sessions")

# The retirement is scoped: the /spec agent-handoff exception is gone, the generic rule stays.
grep -qiF 'not a tmux exception' "$PROC" || missing+=("sandbox-processes.md no longer scopes the tmux rule away from /spec execute")
retired_session='agent-''spec-'
prescribed=$(grep -nF -- "$retired_session" "$PROC" | grep -vF 'Do not reintroduce' || true)
[[ -n "$prescribed" ]] && missing+=("sandbox-processes.md still prescribes the retired $retired_session session convention: ${prescribed//$'\n'/ ; }")

if (( ${#missing[@]} )); then
  printf 'REGRESSION: headless tmux infrastructure damaged by the /spec handoff retirement:\n' >&2
  printf '  - %s\n' "${missing[@]}" >&2
  exit 1
fi

echo "PASS: tmux remains intact for cron, gateway, tunnel, and T3 headless infrastructure while the /spec Advisor exception is gone" >&2
