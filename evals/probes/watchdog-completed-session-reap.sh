#!/usr/bin/env bash
# tier: A
# source: issue #235 (completed autopilot PR session reaping)
# desc: /watchdog may reap kept autopilot sessions only after terminal PR state plus an idle double-capture, never by age alone.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WATCHDOG="$ROOT/.claude/skills/watchdog/SKILL.md"
HEARTBEAT="$ROOT/crons/heartbeat.md"

missing=()

[[ -f "$WATCHDOG" ]] || missing+=("/watchdog skill exists")
if [[ -f "$WATCHDOG" ]]; then
  grep -Fq 'Completed autopilot PR sessions' "$WATCHDOG" || missing+=("completed-session section exists")
  grep -Fq 'A kept `autopilot-<branch>` session is useful while its PR is open' "$WATCHDOG" || missing+=("open PR sessions preserved")
  grep -Fq 'terminal (`MERGED` or `CLOSED`)' "$WATCHDOG" || missing+=("terminal PR states named")
  grep -Fq 'idle double-capture' "$WATCHDOG" || missing+=("idle double-capture named")
  grep -Fq 'sleep 3' "$WATCHDOG" || missing+=("double-capture delay present")
  grep -Fq 'tmux kill-session -t "$s"; rm -f "/tmp/$s.keep"' "$WATCHDOG" || missing+=("kill and keep-marker removal coupled")
  grep -Fq 'WATCHING: autopilot session $s has open PR #$number' "$WATCHDOG" || missing+=("open PR session watch path")
  grep -Fq 'NUDGE: reaped completed autopilot session $s (PR #$number $state)' "$WATCHDOG" || missing+=("reap nudge output")
  grep -Fq 'Never kill a session merely because it is old' "$WATCHDOG" || missing+=("no age-only cleanup rule")
  grep -Fq 'terminal PR state plus an idle double-capture' "$WATCHDOG" || missing+=("common pitfall terminal+idle gate")
fi

if [[ -f "$HEARTBEAT" ]]; then
  grep -Fq 'reap completed autopilot PR' "$HEARTBEAT" || missing+=("heartbeat mentions completed-session reap")
  grep -Fq 'PR is terminal and the pane is idle' "$HEARTBEAT" || missing+=("heartbeat terminal+idle condition")
  grep -Fq 'never kills sessions on age alone' "$HEARTBEAT" || missing+=("heartbeat preserves no-age-only rule")
else
  missing+=("heartbeat cron exists")
fi

if (( ${#missing[@]} )); then
  printf 'REGRESSION: watchdog completed-session reap contract missing: %s\n' "${missing[*]}" >&2
  exit 1
fi

printf 'PASS: /watchdog completed-session reaping is gated by terminal PR state plus idle double-capture\n' >&2
exit 0
