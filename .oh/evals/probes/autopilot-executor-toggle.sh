#!/usr/bin/env bash
# tier: A
# source: conversation 2026-06-13 (autopilot executor); 2026-06-27 (ralph-default flip)
# desc: /autopilot defaults to the ship-spec deferral whose Stage 10 build executor is the
#       Advisor-monitored ralph loop (/delegate optional inside, never a replacement); keeps
#       delegate-advisor + inline ralph as explicit opt-in flags, uses the exact Advisor /goal
#       phrase, defers the whole build to /ship-spec (no inline compact/delegate/eval —
#       ship-spec owns them + the /audit pr undraft), renames cron tmux sessions to
#       autopilot-<branch>, dedupes active work, cleans finalized active markers, and keeps
#       dry-run research non-mutating.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SKILL="$ROOT/.claude/skills/autopilot/SKILL.md"
CRON="$ROOT/.oh/crons/autopilot.md"
AGENTS="$ROOT/AGENTS.md"
SHIP="$ROOT/.claude/skills/ship-spec/SKILL.md"

if [[ ! -f "$SKILL" ]]; then
  echo "SKIPPED: autopilot skill absent: $SKILL" >&2
  exit 2
fi
if [[ ! -f "$CRON" ]]; then
  echo "SKIPPED: autopilot cron absent: $CRON" >&2
  exit 2
fi

missing=()

# Executor toggle: default ship-spec (Advisor-monitored ralph build), explicit
# delegate-advisor + inline ralph opt-ins.
grep -F 'argument-hint:' "$SKILL" | grep -Fq '[--executor=ship-spec|delegate-advisor|ralph]' || missing+=("argument hint includes executor toggle")
grep -Fq 'EXECUTOR="${AUTOPILOT_EXECUTOR:-ship-spec}"' "$SKILL" || missing+=("AUTOPILOT_EXECUTOR default ship-spec")
grep -Fq '*--executor=ship-spec*) EXECUTOR=ship-spec' "$SKILL" || missing+=("CLI --executor=ship-spec toggle")
grep -Fq '*--executor=delegate-advisor*) EXECUTOR=delegate-advisor' "$SKILL" || missing+=("CLI --executor=delegate-advisor toggle")
grep -Fq '*--executor=ralph*) EXECUTOR=ralph' "$SKILL" || missing+=("CLI --executor=ralph toggle")
grep -Fq '.oh/scripts/ralph.sh "$SLUG"' "$SKILL" || missing+=("Ralph inline fallback still launches .oh/scripts/ralph.sh")
grep -Fq '#### `ralph` fallback' "$SKILL" || missing+=("Ralph inline fallback section")

# Required exact Advisor goal phrase (defers the whole build to /ship-spec; Advisor-managed ralph).
required_goal='/goal Audit plan /w @"pm (agent)" using ultrathink, then run /ship-spec --issue to build it end-to-end (worktree Advisor, Advisor-managed ralph, /eval, /audit pr undraft) into a ready-for-review PR'
grep -Fq "$required_goal" "$SKILL" || missing+=("exact Advisor /goal phrase in autopilot skill")
grep -Fq "$required_goal" "$CRON" || missing+=("exact Advisor /goal phrase in cron reminder")

# Default ship-spec mode DEFERS the whole build to /ship-spec — no inline compact/delegate/eval.
grep -Fq '/ship-spec --issue' "$SKILL" || missing+=("autopilot invokes /ship-spec --issue")
default_section="$(awk '/#### `ship-spec` \(default\)/,/#### `delegate-advisor`/' "$SKILL")"
[[ -n "$default_section" ]] || missing+=("ship-spec default executor section")
if [[ -n "$default_section" ]]; then
  grep -Fq 'defer to `/ship-spec`' <<<"$default_section" || missing+=("ship-spec section defers to /ship-spec")
  grep -Fq 'does **not** run its own' <<<"$default_section" || missing+=("ship-spec section does not re-run compact/delegate/eval")
  grep -Fq '/audit pr' <<<"$default_section" || missing+=("ship-spec section references the ship-spec-owned /audit pr undraft")
  grep -Fq 'Advisor-monitored' <<<"$default_section" || missing+=("ship-spec section names the Advisor-monitored ralph loop default")
  grep -Fq '`/delegate` optional inside' <<<"$default_section" || missing+=("ship-spec section marks /delegate optional inside the loop")
  # ship-spec must own the build BEFORE autopilot reconciles: §4 (/ship-spec) precedes §5 (executor).
  shipspec_line="$(grep -nF '/ship-spec --issue (owns the full build)' "$SKILL" | head -1 | cut -d: -f1 || true)"
  executor_line="$(grep -nF '### 5. Implement — executor' "$SKILL" | head -1 | cut -d: -f1 || true)"
  if [[ -z "$shipspec_line" || -z "$executor_line" || "$shipspec_line" -ge "$executor_line" ]]; then
    missing+=("/ship-spec --issue stage precedes the executor reconcile stage")
  fi
fi

# delegate-advisor is now an explicit OPT-IN section (no longer the default).
grep -Fq '#### `delegate-advisor`' "$SKILL" || missing+=("delegate-advisor opt-in section (no longer the default)")

# /ship-spec (the single source of build mechanics) defaults its Stage 10 executor to ralph,
# and keeps delegate-advisor as the opt-in flag.
if [[ -f "$SHIP" ]]; then
  grep -Fq 'SHIP_SPEC_EXECUTOR="${SHIP_SPEC_EXECUTOR:-ralph}"' "$SHIP" || missing+=("/ship-spec default executor ralph")
  grep -Fq '*--executor=delegate-advisor*) SHIP_SPEC_EXECUTOR=delegate-advisor' "$SHIP" || missing+=("/ship-spec --executor=delegate-advisor opt-in")
fi

# Session naming and no second Advisor session.
grep -Fq 'safe_branch_session()' "$SKILL" || missing+=("safe_branch_session helper")
grep -Fq 'printf '\''%s'\'' "autopilot-$1"' "$SKILL" || missing+=("autopilot-<branch> session prefix")
grep -Fq 'tmux rename-session -t "$SESSION" "$SAFE_SESSION"' "$SKILL" || missing+=("tmux rename to safe autopilot session")
grep -Fq 'do **not** spawn a second advisor session' "$SKILL" || missing+=("same Pi session is Advisor runtime")
grep -Fq 'autopilot-<branch>' "$CRON" || missing+=("cron documents autopilot-<branch> session naming")

# Duplicate guard: active tmux session, linked PR, local open-PR issue refs, or active marker suppresses duplicate work.
grep -Fq 'ACTIVE_MARKER="/tmp/$SAFE_SESSION.active"' "$SKILL" || missing+=("active marker path")
grep -Fq 'tmux has-session -t "$SAFE_SESSION"' "$SKILL" || missing+=("tmux duplicate guard")
grep -F 'LINKED_PR=$(gh pr list' "$SKILL" | grep -Fq -- '--head "$BRANCH"' || missing+=("branch PR duplicate guard")
grep -Fq 'OPEN_PRS_JSON="/tmp/autopilot-open-prs-$$.json"' "$SKILL" || missing+=("bulk open PR cache for issue dedupe")
grep -Fq 'issue_open_pr_refs()' "$SKILL" || missing+=("local issue-to-open-PR reference helper")
grep -Fq 'closingIssuesReferences' "$SKILL" || missing+=("linked metadata participates in issue PR dedupe")
grep -Fq 'headRefName' "$SKILL" || missing+=("head branch participates in issue PR dedupe")
grep -Fq 'body,closingIssuesReferences' "$SKILL" || missing+=("PR body fetched for issue PR dedupe")
grep -F 'LINKED_ISSUE_PR=$(issue_open_pr_refs' "$SKILL" | grep -Fq '"$ISSUE_NUM"' || missing+=("issue PR reference duplicate guard")
grep -Fq '[dry-run] dedupe: $DEDUPE_STATE' "$SKILL" || missing+=("dry-run surfaces dedupe state")
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
grep -Fq 'AUTOPILOT_EXECUTOR=ralph' "$AGENTS" || missing+=("AGENTS documents inline Ralph toggle")
grep -Fq 'Advisor-monitored `scripts/ralph.sh` loop' "$AGENTS" || missing+=("AGENTS documents Advisor-monitored ralph default")
grep -Fq -- '--executor=delegate-advisor' "$AGENTS" || missing+=("AGENTS documents delegate-advisor opt-in")

if (( ${#missing[@]} )); then
  printf 'REGRESSION: autopilot executor toggle contract missing: %s\n' "${missing[*]}" >&2
  exit 1
fi

echo "PASS: autopilot defaults to ship-spec (Advisor-monitored ralph; /delegate optional inside), exact goal, defers the build to /ship-spec, delegate-advisor + inline ralph opt-ins, /ship-spec default executor ralph, safe tmux naming, dedupe guard, active-marker cleanup, dry-run guard" >&2
exit 0
