#!/usr/bin/env bash
# tier: A
# source: conversation 2026-06-13 (autopilot delegate-advisor executor)
# desc: /autopilot defaults to delegate-advisor, keeps Ralph as explicit fallback,
#       uses the exact Advisor /goal phrase, defers the whole build to /ship-spec
#       (no inline compact/delegate/eval — ship-spec owns them + the /pr-audit undraft),
#       renames cron tmux sessions to autopilot-<branch>, dedupes active work,
#       cleans finalized active markers, and keeps dry-run research non-mutating.
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
grep -F 'argument-hint:' "$SKILL" | grep -Fq '[--executor=delegate-advisor|ralph]' || missing+=("argument hint includes executor toggle")
grep -Fq 'EXECUTOR="${AUTOPILOT_EXECUTOR:-delegate-advisor}"' "$SKILL" || missing+=("AUTOPILOT_EXECUTOR default delegate-advisor")
grep -Fq '*--executor=ralph*) EXECUTOR=ralph' "$SKILL" || missing+=("CLI --executor=ralph toggle")
grep -Fq '*--executor=delegate-advisor*) EXECUTOR=delegate-advisor' "$SKILL" || missing+=("CLI --executor=delegate-advisor toggle")
grep -Fq 'scripts/ralph.sh "$SLUG"' "$SKILL" || missing+=("Ralph fallback still launches scripts/ralph.sh")
grep -Fq '#### `ralph` fallback' "$SKILL" || missing+=("Ralph fallback section")

# Required exact Advisor goal phrase (now hands the whole build to /ship-spec).
required_goal='/goal Audit plan /w @"pm (agent)" using ultrathink, then run /ship-spec --issue to build it end-to-end (worktree Advisor, /delegate + ralph, /eval, /pr-audit undraft) into a ready-for-review PR'
grep -Fq "$required_goal" "$SKILL" || missing+=("exact Advisor /goal phrase in autopilot skill")
grep -Fq "$required_goal" "$CRON" || missing+=("exact Advisor /goal phrase in cron reminder")

# Delegate-advisor DEFERS the whole build to /ship-spec — no inline compact/delegate/eval.
grep -Fq '/ship-spec --issue' "$SKILL" || missing+=("autopilot invokes /ship-spec --issue")
delegate_section="$(awk '/#### `delegate-advisor` \(default\)/,/#### `ralph` fallback/' "$SKILL")"
[[ -n "$delegate_section" ]] || missing+=("delegate-advisor section")
if [[ -n "$delegate_section" ]]; then
  grep -Fq 'defer to `/ship-spec`' <<<"$delegate_section" || missing+=("delegate-advisor defers to /ship-spec")
  grep -Fq 'does **not** run its own' <<<"$delegate_section" || missing+=("delegate-advisor does not re-run compact/delegate/eval")
  grep -Fq '/pr-audit' <<<"$delegate_section" || missing+=("delegate-advisor references the ship-spec-owned /pr-audit undraft")
  # ship-spec must own the build BEFORE autopilot reconciles: §4 (/ship-spec) precedes §5 (executor).
  shipspec_line="$(grep -nF '/ship-spec --issue (owns the full build)' "$SKILL" | head -1 | cut -d: -f1 || true)"
  executor_line="$(grep -nF '### 5. Implement — executor' "$SKILL" | head -1 | cut -d: -f1 || true)"
  if [[ -z "$shipspec_line" || -z "$executor_line" || "$shipspec_line" -ge "$executor_line" ]]; then
    missing+=("/ship-spec --issue stage precedes the executor reconcile stage")
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
grep -F 'LINKED_PR=$(gh pr list' "$SKILL" | grep -Fq -- '--head "$BRANCH"' || missing+=("branch PR duplicate guard")
grep -F 'LINKED_ISSUE_PR=$(gh issue list' "$SKILL" | grep -Fq -- '--search "$ISSUE_NUM linked:pr"' || missing+=("linked issue PR duplicate guard")
grep -Fq '[ -e "$ACTIVE_MARKER" ]' "$SKILL" || missing+=("active marker duplicate guard")
grep -Fq 'cleanup_active_marker() { [ -n "${ACTIVE_MARKER:-}" ] && rm -f "$ACTIVE_MARKER"; }' "$SKILL" || missing+=("active marker cleanup helper")
grep -Fq 'Clean the active marker on finalized PR paths' "$SKILL" || missing+=("finalized PR paths clean active marker")
grep -F 'Memory log `Result: PR-DRAFT-EVAL-RED`' "$SKILL" | grep -Fq '`cleanup_active_marker`' || missing+=("eval-red finalized path cleans active marker before exit")
grep -Fq 'Keep `ACTIVE_MARKER` only on incomplete executor paths' "$SKILL" || missing+=("incomplete executor paths keep active marker")

# Dry-run research must not create GitHub issues before the dry-run exit.
dryrun_line="$(grep -nF 'exit before any `gh issue create` mutation' "$SKILL" | head -1 | cut -d: -f1 || true)"
issue_create_line="$(grep -nF 'gh issue create --repo' "$SKILL" | head -1 | cut -d: -f1 || true)"
if [[ -z "$dryrun_line" || -z "$issue_create_line" || "$dryrun_line" -ge "$issue_create_line" ]]; then
  missing+=("research dry-run guard appears before gh issue create")
fi

# Top-level docs should advertise the changed operator contract.
grep -Fq 'AUTOPILOT_EXECUTOR=ralph' "$AGENTS" || missing+=("AGENTS documents Ralph toggle")
grep -Fq '/delegate --plan tasks/<slug>/prd.json' "$AGENTS" || missing+=("AGENTS documents delegate prd.json default")

if (( ${#missing[@]} )); then
  printf 'REGRESSION: autopilot executor toggle contract missing: %s\n' "${missing[*]}" >&2
  exit 1
fi

echo "PASS: autopilot defaults to delegate-advisor with exact goal, defers the build to /ship-spec, safe tmux naming, dedupe guard, active-marker cleanup, dry-run guard, and Ralph fallback" >&2
exit 0
