#!/usr/bin/env bash
# tier: A
# source: conversation 2026-06-15 (generic watchdog + stale draft PR recovery)
# desc: /watchdog exists as generic watchdog and heartbeat uses it to complete stale draft PRs, verifying before removing draft.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WATCHDOG="$ROOT/.claude/skills/watchdog/SKILL.md"
HEARTBEAT="$ROOT/.oh/crons/heartbeat.md"
PRAUDIT="$ROOT/.claude/skills/pr-audit/SKILL.md"
AGENTS="$ROOT/AGENTS.md"

missing=()

[[ -f "$WATCHDOG" ]] || missing+=("/watchdog skill exists")
if [[ -f "$WATCHDOG" ]]; then
  grep -Fq 'name: watchdog' "$WATCHDOG" || missing+=("watchdog skill frontmatter name")
  grep -Fq 'WATCHDOG_REPO="${WATCHDOG_REPO:-mifunedev/openharness}"' "$WATCHDOG" || missing+=("watchdog defaults to upstream repo")
  grep -Fq 'WATCHDOG_STALE_HOURS="${WATCHDOG_STALE_HOURS:-2}"' "$WATCHDOG" || missing+=("watchdog stale-hours default")
  grep -Fq 'gh pr list --repo "$WATCHDOG_REPO" --state open --label autopilot' "$WATCHDOG" || missing+=("watchdog fetches autopilot draft PRs from target repo")
  grep -Fq 'select(.isDraft == true)' "$WATCHDOG" || missing+=("watchdog filters draft PRs")
  grep -Fq 'gh pr ready <PR> --repo "$WATCHDOG_REPO"' "$WATCHDOG" || missing+=("watchdog removes draft via target repo")
  grep -Fq 'Stale/stuck draft → complete work first' "$WATCHDOG" || missing+=("watchdog completes stale drafts before ready")
  grep -Fq 'isDraft == false' "$WATCHDOG" || missing+=("watchdog verifies draft removed")
  grep -Fq 'Never merge from the watchdog' "$WATCHDOG" || missing+=("watchdog never merges")
fi

grep -Fq '/watchdog --action all --repo mifunedev/openharness' "$HEARTBEAT" || missing+=("heartbeat invokes generic /watchdog")
grep -Fq 'complete the remaining work on that PR branch' "$HEARTBEAT" || missing+=("heartbeat says complete stale drafts")
grep -Fq 'only then remove draft' "$HEARTBEAT" || missing+=("heartbeat requires verification before undraft")
grep -Fq 'Watchdog nudge' "$HEARTBEAT" || missing+=("heartbeat reporting renamed to watchdog")

grep -Fq 'route to `/watchdog` to complete the branch' "$PRAUDIT" || missing+=("pr-audit stale draft routes to watchdog")
grep -Fq '| `/watchdog` | Generic stuck/stale automation watchdog' "$AGENTS" || missing+=("AGENTS lists /watchdog")

if grep -R "autopilot-watchdog" "$WATCHDOG" "$HEARTBEAT" "$PRAUDIT" "$AGENTS" >/dev/null 2>&1; then
  missing+=("new watchdog docs must not use old /autopilot-watchdog name")
fi

if (( ${#missing[@]} )); then
  printf 'REGRESSION: watchdog stale-draft contract missing: %s\n' "${missing[*]}" >&2
  exit 1
fi

echo "PASS: /watchdog is generic and recovers stale autopilot draft PRs through verified undraft" >&2
exit 0
