#!/usr/bin/env bash
# tier: A
# source: issue #161 — stale autopilot draft watchdog must surface investigation, not undraft
# desc: /autopilot-watchdog is the ad-hoc + heartbeat entrypoint; it surfaces draft PRs stale after 2h and draft-cap saturation separately from ready nudges; /ship-spec keeps /pr-audit before gh pr ready and documents stale draft age/backlog is not an undraft signal.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CRON="$ROOT/crons/heartbeat.md"
WATCHDOG="$ROOT/.claude/skills/autopilot-watchdog/SKILL.md"
SHIP="$ROOT/.pi/skills/ship-spec/SKILL.md"

[[ -f "$CRON" ]] || { echo "SKIPPED: missing heartbeat cron: $CRON" >&2; exit 2; }
[[ -f "$WATCHDOG" ]] || { echo "REGRESSION: missing autopilot-watchdog skill: $WATCHDOG" >&2; exit 1; }
[[ -f "$SHIP" ]] || { echo "SKIPPED: missing ship-spec skill: $SHIP" >&2; exit 2; }

missing=()

# The cron should delegate to the reusable skill so operators can run the same
# watchdog ad-hoc; do not let heartbeat grow a second copy of the logic.
grep -Fq '/autopilot-watchdog' "$CRON" || missing+=("heartbeat invokes /autopilot-watchdog")
grep -Eiq 'ad-hoc|operator entrypoint|do not duplicate' "$CRON" || missing+=("heartbeat documents the watchdog skill as the reusable entrypoint")
grep -Eiq '2[[:space:]]*hours|2h' "$CRON" || missing+=("heartbeat states draft stale threshold is 2h")
if grep -Eq 'AUTOPILOT_DRAFT_STALE_HOURS=|gh pr list --state open --label autopilot|draft_rows=' "$CRON"; then
  missing+=("heartbeat does not embed duplicate draft watchdog bash")
fi

# The skill owns the executable watchdog contract.
grep -Eq '^name:[[:space:]]*autopilot-watchdog' "$WATCHDOG" || missing+=("skill frontmatter name is autopilot-watchdog")
grep -Fq 'AUTOPILOT_DRAFT_STALE_HOURS:-2' "$WATCHDOG" || missing+=("watchdog default draft stale threshold is 2h")
grep -Fq 'AUTOPILOT_DAILY_CAP:-6' "$WATCHDOG" || missing+=("watchdog default daily cap is 6")
grep -Fq 'isDraft==true' "$WATCHDOG" || missing+=("watchdog filters draft PRs with isDraft==true")
grep -Fq 'updatedAt' "$WATCHDOG" || missing+=("watchdog reads updatedAt")
grep -Fq 'createdAt' "$WATCHDOG" || missing+=("watchdog reads createdAt for cap saturation")
grep -Fq 'isDraft==false' "$WATCHDOG" || missing+=("watchdog keeps non-draft ready nudge separate")
grep -Eiq 'daily cap|cap saturation|saturates' "$WATCHDOG" || missing+=("watchdog surfaces cap saturation language")
grep -Eiq 'WATCHDOG|investigate' "$WATCHDOG" || missing+=("watchdog surfaces WATCHDOG/investigate language")
grep -Eiq 'do not auto-undraft/close|no auto-undraft|never authorization' "$WATCHDOG" || missing+=("watchdog forbids auto-undraft/close from draft findings")
grep -Eiq 'NUDGE:|WATCHING:|WATCHDOG:' "$WATCHDOG" || missing+=("watchdog defines reporting prefixes")

# Draft-handling must not contain mutating GitHub commands. The stuck-session
# block may kill tmux sessions; that is the one autonomous mutation and is not a
# PR mutation.
draft_section="$({
  awk '
    /^5\. \*\*Stale draft autopilot PRs/ { in_block=1 }
    in_block && /^## / { exit }
    in_block { print }
  ' "$WATCHDOG"
} || true)"
if [[ -z "$draft_section" ]]; then
  missing+=("watchdog has a Stale draft autopilot PRs section")
else
  mutating=$(grep -nE 'gh[[:space:]]+pr[[:space:]]+(ready|close|merge|edit|comment)\b|gh[[:space:]]+api\b' <<<"$draft_section" || true)
  if [[ -n "$mutating" ]]; then
    echo "REGRESSION: draft watchdog section contains mutating PR command(s):" >&2
    echo "$mutating" >&2
    exit 1
  fi
fi

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

echo "PASS: /autopilot-watchdog is reusable, heartbeat delegates to it, draft stale threshold is 2h, and undraft stays gated by /pr-audit" >&2
exit 0
