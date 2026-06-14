#!/usr/bin/env bash
# tier: A
# source: conversation 2026-06-13 (autopilot delegate-advisor executor)
# desc: /autopilot defaults to delegate-advisor, keeps Ralph as explicit fallback,
#       uses the exact Advisor /goal phrase, compacts before prd.json delegation,
#       renames cron tmux sessions to autopilot-<branch>, and dedupes active work.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SKILL="$ROOT/.claude/skills/autopilot/SKILL.md"
CRON="$ROOT/crons/autopilot.md"
AGENTS="$ROOT/AGENTS.md"

if [[ ! -f "$SKILL" ]]; then
  echo "SKIPPED: autopilot skill absent: $SKILL" >&2
  exit 2
fi
if [[ ! -f "$CRON" ]]; then
  echo "SKIPPED: autopilot cron absent: $CRON" >&2
  exit 2
fi

missing=()

# Executor toggle: default delegate-advisor, explicit env/CLI Ralph fallback.
grep -Fq 'argument-hint: "[--dry-run] [--executor=delegate-advisor|ralph]"' "$SKILL" || missing+=("argument hint includes executor toggle")
grep -Fq 'EXECUTOR="${AUTOPILOT_EXECUTOR:-delegate-advisor}"' "$SKILL" || missing+=("AUTOPILOT_EXECUTOR default delegate-advisor")
grep -Fq '*--executor=ralph*) EXECUTOR=ralph' "$SKILL" || missing+=("CLI --executor=ralph toggle")
grep -Fq '*--executor=delegate-advisor*) EXECUTOR=delegate-advisor' "$SKILL" || missing+=("CLI --executor=delegate-advisor toggle")
grep -Fq 'scripts/ralph.sh "$SLUG"' "$SKILL" || missing+=("Ralph fallback still launches scripts/ralph.sh")
grep -Fq '#### `ralph` fallback' "$SKILL" || missing+=("Ralph fallback section")

# Required exact Advisor goal phrase.
required_goal='/goal Audit plan /w @"pm (agent)" using ultrathink, then /ship-spec and execute prd.json as an expert Advisor to orchestrate /delegate'
grep -Fq "$required_goal" "$SKILL" || missing+=("exact Advisor /goal phrase in autopilot skill")
grep -Fq "$required_goal" "$CRON" || missing+=("exact Advisor /goal phrase in cron reminder")

# Mandatory compact-before-delegate handoff inside the delegate-advisor subsection.
delegate_section="$(awk '/#### `delegate-advisor` \(default\)/,/#### `ralph` fallback/' "$SKILL")"
[[ -n "$delegate_section" ]] || missing+=("delegate-advisor section")
if [[ -n "$delegate_section" ]]; then
  grep -Fq 'Run Pi `/compact` before Advisor executes the JSON' <<<"$delegate_section" || missing+=("mandatory /compact before prd.json execution")
  grep -Fq 'do not call `/delegate` until `/compact` completes' <<<"$delegate_section" || missing+=("delegate blocked until compact completes")
  grep -Fq 'tasks/$SLUG/prd.json path and contents' <<<"$delegate_section" || missing+=("compact prompt preserves prd.json")
  grep -Fq '/delegate --plan tasks/$SLUG/prd.json' <<<"$delegate_section" || missing+=("delegate executes prd.json plan")
  compact_line="$(grep -nF 'Run Pi `/compact` before Advisor executes the JSON' <<<"$delegate_section" | head -1 | cut -d: -f1 || true)"
  delegate_line="$(grep -nF '/delegate --plan tasks/$SLUG/prd.json' <<<"$delegate_section" | head -1 | cut -d: -f1 || true)"
  if [[ -z "$compact_line" || -z "$delegate_line" || "$compact_line" -ge "$delegate_line" ]]; then
    missing+=("/compact appears before /delegate --plan in delegate-advisor section")
  fi
fi

# Session naming and no second Advisor session.
grep -Fq 'safe_branch_session()' "$SKILL" || missing+=("safe_branch_session helper")
grep -Fq 'printf '\''%s'\'' "autopilot-$1"' "$SKILL" || missing+=("autopilot-<branch> session prefix")
grep -Fq 'tmux rename-session -t "$SESSION" "$SAFE_SESSION"' "$SKILL" || missing+=("tmux rename to safe autopilot session")
grep -Fq 'do **not** spawn a second advisor session' "$SKILL" || missing+=("same Pi session is Advisor runtime")
grep -Fq 'autopilot-<branch>' "$CRON" || missing+=("cron documents autopilot-<branch> session naming")

# Duplicate guard: active tmux session, linked PR, or active marker suppresses duplicate work.
grep -Fq 'ACTIVE_MARKER="/tmp/$SAFE_SESSION.active"' "$SKILL" || missing+=("active marker path")
grep -Fq 'tmux has-session -t "$SAFE_SESSION"' "$SKILL" || missing+=("tmux duplicate guard")
grep -Fq 'LINKED_PR=$(gh pr list --state open --head "$BRANCH"' "$SKILL" || missing+=("branch PR duplicate guard")
grep -Fq 'LINKED_ISSUE_PR=$(gh issue list --state open --label autopilot --search "$ISSUE_NUM linked:pr"' "$SKILL" || missing+=("linked issue PR duplicate guard")
grep -Fq '[ -e "$ACTIVE_MARKER" ]' "$SKILL" || missing+=("active marker duplicate guard")

# Top-level docs should advertise the changed operator contract.
grep -Fq 'AUTOPILOT_EXECUTOR=ralph' "$AGENTS" || missing+=("AGENTS documents Ralph toggle")
grep -Fq '/delegate --plan tasks/<slug>/prd.json' "$AGENTS" || missing+=("AGENTS documents delegate prd.json default")

if (( ${#missing[@]} )); then
  printf 'REGRESSION: autopilot executor toggle contract missing: %s\n' "${missing[*]}" >&2
  exit 1
fi

echo "PASS: autopilot defaults to delegate-advisor with exact goal, compact-before-delegate, safe tmux naming, dedupe guard, and Ralph fallback" >&2
exit 0
