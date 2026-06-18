#!/usr/bin/env bash
# tier: A
# source: issue #240 (Codex zero-credit stuck autopilot sessions) 2026-06-17
# desc: /watchdog kills only autopilot tmux sessions frozen at terminal stuck prompts, including Codex zero-credit usage-limit banners.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WATCHDOG="$ROOT/.claude/skills/watchdog/SKILL.md"

missing=()

[[ -f "$WATCHDOG" ]] || missing+=("/watchdog skill exists")
if [[ -f "$WATCHDOG" ]]; then
  grep -Fq "grep -oE '^(cron-)?autopilot-[^:]*'" "$WATCHDOG" || missing+=("stuck-session candidates are scoped to autopilot tmux sessions")
  grep -Fq 'Age alone is not enough' "$WATCHDOG" || missing+=("age-alone kill is forbidden")
  grep -Fq 'hit your (usage|session) limit' "$WATCHDOG" || missing+=("Claude usage/session limit pattern retained")
  grep -Fq 'Resume from summary' "$WATCHDOG" || missing+=("Claude resume prompt pattern retained")
  grep -Fq 'Resume full session' "$WATCHDOG" || missing+=("Claude full-session resume prompt retained")
  grep -Fq 'usage_limit_reached' "$WATCHDOG" || missing+=("Codex usage_limit_reached pattern present")
  grep -Fq 'status_code["[:space:]:]+429' "$WATCHDOG" || missing+=("Codex HTTP 429 pattern present")
  grep -Fq 'Credits-Balance["[:space:]:]+0' "$WATCHDOG" || missing+=("Codex zero-credit balance pattern present")
  grep -Fq 'tail -80' "$WATCHDOG" || missing+=("bounded pane tail is wide enough for multi-line Codex error banners")
  grep -Fq 'tmux kill-session -t "$s"' "$WATCHDOG" || missing+=("watchdog kills confirmed stuck session")
fi

if (( ${#missing[@]} )); then
  printf 'REGRESSION: watchdog stuck-session contract missing: %s\n' "${missing[*]}" >&2
  exit 1
fi

echo "PASS: /watchdog recognizes terminal Claude and Codex stuck autopilot sessions without age-only kills" >&2
exit 0
