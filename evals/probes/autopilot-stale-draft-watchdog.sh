#!/usr/bin/env bash
# tier: A
# source: issue #161 — stale autopilot draft watchdog must surface investigation, not undraft
# desc: heartbeat surfaces stale autopilot draft PRs and draft-cap saturation separately from ready nudges; /ship-spec keeps /pr-audit before gh pr ready and documents stale draft age/backlog is not an undraft signal.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CRON="$ROOT/crons/heartbeat.md"
SHIP="$ROOT/.pi/skills/ship-spec/SKILL.md"

[[ -f "$CRON" ]] || { echo "SKIPPED: missing heartbeat cron: $CRON" >&2; exit 2; }
[[ -f "$SHIP" ]] || { echo "SKIPPED: missing ship-spec skill: $SHIP" >&2; exit 2; }

missing=()

# Extract the stale autopilot draft watchdog block. It should be its own visible
# section/bullet so it cannot be confused with the non-draft ready nudge.
stale_block="$({
  awk '
    BEGIN { in_block=0 }
    /^    - \*\*/ && /[Ss]tale/ && /[Dd]raft/ && /[Aa]utopilot/ && /[Ww][Aa][Tt][Cc][Hh][Dd][Oo][Gg]/ {
      in_block=1
    }
    in_block && /^    - \*\*/ && !(/[Ss]tale/ && /[Dd]raft/) { exit }
    in_block { print }
    in_block && /^#{2,}[[:space:]]/ && !(/[Ss]tale/ && /[Dd]raft/) { exit }
  ' "$CRON"
} || true)"

if [[ -z "$stale_block" ]]; then
  missing+=("heartbeat has a separate autopilot stale draft watchdog block")
fi

if [[ -n "$stale_block" ]]; then
  grep -Fq 'isDraft==true' <<<"$stale_block" || missing+=("stale draft watchdog filters isDraft==true")
  grep -Fq 'updatedAt' <<<"$stale_block" || missing+=("stale draft watchdog reads updatedAt")
  grep -Eq 'AUTOPILOT_DRAFT_STALE_HOURS|24[[:space:]]*(h|hr|hrs|hour|hours)' <<<"$stale_block" || missing+=("stale draft watchdog exposes a 24h threshold")
  grep -Fq 'AUTOPILOT_DAILY_CAP=6' <<<"$stale_block" || missing+=("stale draft watchdog checks the autopilot same-day cap")
  grep -Fq 'createdAt' <<<"$stale_block" || missing+=("draft-cap watchdog reads createdAt")
  grep -Eiq 'daily cap|cap saturation|saturates' <<<"$stale_block" || missing+=("draft-cap watchdog surfaces cap saturation language")
  grep -Eiq 'promote/close|investigate/promote/close' <<<"$stale_block" || missing+=("draft-cap watchdog names operator remediation without mutating")
  grep -Eiq 'WATCHDOG|investigate' <<<"$stale_block" || missing+=("stale draft watchdog surfaces WATCHDOG/investigate language")

  mutating=$(grep -nE 'gh[[:space:]]+pr[[:space:]]+(ready|close|merge|edit|comment)\b|gh[[:space:]]+api\b|tmux[[:space:]]+kill-session\b' <<<"$stale_block" || true)
  if [[ -n "$mutating" ]]; then
    echo "REGRESSION: stale autopilot draft watchdog block contains mutating command(s):" >&2
    echo "$mutating" >&2
    exit 1
  fi

  if grep -Fq 'isDraft==false' <<<"$stale_block"; then
    missing+=("non-draft ready nudge is separate from stale draft watchdog block")
  fi
fi

grep -Fq 'isDraft==false' "$CRON" || missing+=("heartbeat keeps non-draft ready nudge with isDraft==false")

# /ship-spec must keep the audit-before-undraft ordering explicit.
pr_audit_line=$(grep -nF '/pr-audit' "$SHIP" | head -1 | cut -d: -f1 || true)
ready_line=$(grep -nF 'gh pr ready' "$SHIP" | head -1 | cut -d: -f1 || true)
if [[ -z "$pr_audit_line" || -z "$ready_line" || "$pr_audit_line" -ge "$ready_line" ]]; then
  missing+=("/ship-spec documents /pr-audit before gh pr ready")
fi

grep -Eq '/pr-audit[^\n]*(before|gate|gates)[^\n]*gh pr ready|gh pr ready[^\n]*(only|after)[^\n]*/pr-audit' "$SHIP" \
  || missing+=("/ship-spec explicitly gates gh pr ready on /pr-audit")

grep -Eiq '(stale[- ]draft|stale draft|draft age|draft backlog|age/backlog|backlog alone).*(not|no|never).*(undraft|ready signal|gh pr ready)|(not|no|never).*(undraft|ready signal|gh pr ready).*(stale[- ]draft|stale draft|draft age|draft backlog|age/backlog|backlog alone)' "$SHIP" \
  || missing+=("/ship-spec says stale-draft watchdog/age/backlog is not an undraft signal")

if (( ${#missing[@]} )); then
  printf 'REGRESSION: autopilot stale draft watchdog contract missing: %s\n' "${missing[*]}" >&2
  exit 1
fi

echo "PASS: heartbeat stale draft watchdog is investigate-only, ready nudge stays non-draft, and /ship-spec preserves /pr-audit-before-undraft" >&2
exit 0
