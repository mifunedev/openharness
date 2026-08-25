#!/usr/bin/env bash
# tier: A
# source: conversation 2026-06-13 (autopilot executor); rewritten by spec-simplification
#         US-002 (issue #816) when every executor toggle was REMOVED rather than reduced
#         to a single accepted value
# desc: /autopilot has NO executor toggle and NO inline fallback. It defers the whole build
#       to /spec execute (which itself has one build path, .oh/scripts/firstmate.sh), uses the
#       exact Advisor /goal phrase, runs no inline compact/delegate/eval, renames cron tmux
#       sessions to autopilot-<branch>, dedupes active work, cleans finalized active markers,
#       and keeps dry-run research non-mutating.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SKILL="$ROOT/.claude/skills/autopilot/SKILL.md"
CRON="$ROOT/.oh/crons/autopilot.md"
AGENTS="$ROOT/AGENTS.md"
SPEC="$ROOT/.claude/skills/spec/references/execute.md"

if [[ ! -f "$SKILL" ]]; then
  echo "SKIPPED: autopilot skill absent: $SKILL" >&2
  exit 2
fi
if [[ ! -f "$CRON" ]]; then
  echo "SKIPPED: autopilot cron absent: $CRON" >&2
  exit 2
fi

missing=()

# --- NO executor toggle anywhere ------------------------------------------
# US-002 removed the toggles instead of narrowing them to one accepted value: a
# one-value toggle is still a selection surface a reader has to resolve. Full-line
# comments are excluded so a file may DOCUMENT the removal without failing this check.
for pair in "autopilot:$SKILL" "cron:$CRON" "spec-execute:$SPEC"; do
  name="${pair%%:*}"
  file="${pair#*:}"
  [[ -f "$file" ]] || continue
  code="$(grep -v '^[[:space:]]*#' "$file")"
  grep -Fq -- '--executor=' <<<"$code" && missing+=("$name still offers an --executor= flag")
  grep -Fq 'AUTOPILOT_EXECUTOR' <<<"$code" && missing+=("$name still references AUTOPILOT_EXECUTOR")
  grep -Fq 'SPEC_EXECUTOR' <<<"$code" && missing+=("$name still references a SPEC_EXECUTOR toggle")
done
grep -F 'argument-hint:' "$SKILL" | grep -Fq -- '--executor' && missing+=("autopilot argument-hint still advertises an executor toggle")

# --- no inline fallback executor ------------------------------------------
# The whole point of removing the toggle is that there is one build path. An inline
# arm that drives a loop itself would restore the arm-selection question.
grep -Fq '.oh/scripts/ralph.sh' "$SKILL" && missing+=("autopilot still launches the retired inline ralph fallback")
grep -Fq 'fallback (legacy inline)' "$SKILL" && missing+=("autopilot still documents a legacy inline fallback section")
grep -Fq 'no inline fallback' "$SKILL" || missing+=("autopilot does not state that there is no inline fallback")

# Required exact Advisor goal phrase (defers the whole build to /spec execute).
required_goal='/goal Audit plan /w @"pm (agent)" using ultrathink, then run /spec plan + /spec execute to build it end-to-end (worktree Advisor, firstmate build session, /eval, /audit pr undraft) into a ready-for-review PR'
grep -Fq "$required_goal" "$SKILL" || missing+=("exact Advisor /goal phrase in autopilot skill")
grep -Fq "$required_goal" "$CRON" || missing+=("exact Advisor /goal phrase in cron reminder")

# Autopilot DEFERS the whole build to /spec — no inline compact/delegate/eval.
grep -Fq '/spec execute' "$SKILL" || missing+=("autopilot invokes /spec execute")
grep -Fq '/spec plan' "$SKILL" || missing+=("autopilot invokes /spec plan")
implement_section="$(awk '/^### 5\. Implement/,/^### 6\./' "$SKILL")"
[[ -n "$implement_section" ]] || missing+=("§5 Implement section")
if [[ -n "$implement_section" ]]; then
  grep -Fq 'defer to `/spec execute`' <<<"$implement_section" || missing+=("§5 defers to /spec execute")
  grep -Fq 'does **not** run its own' <<<"$implement_section" || missing+=("§5 does not re-run compact/delegate/eval")
  grep -Fq '/audit pr' <<<"$implement_section" || missing+=("§5 references the execute-owned /audit pr undraft")
  grep -Fq '.oh/scripts/firstmate.sh' <<<"$implement_section" || missing+=("§5 names the one build executor .oh/scripts/firstmate.sh")
  grep -Fq 'FIRSTMATE_TIMEOUT_MS' <<<"$implement_section" || missing+=("§5 states the inherited wall-clock session budget")
  # /spec must own the build BEFORE autopilot reconciles: §4 (/spec) precedes §5.
  shipspec_line="$(grep -nF '### 4. /spec — owns the full build' "$SKILL" | head -1 | cut -d: -f1 || true)"
  implement_line="$(grep -nF '### 5. Implement' "$SKILL" | head -1 | cut -d: -f1 || true)"
  if [[ -z "$shipspec_line" || -z "$implement_line" || "$shipspec_line" -ge "$implement_line" ]]; then
    missing+=("the /spec build stage precedes the implement reconcile stage")
  fi
fi

# /spec execute is the single source of build mechanics and names the one executor.
if [[ -f "$SPEC" ]]; then
  grep -Fq 'no executor argument' "$SPEC" || missing+=("/spec execute does not state that there is no executor argument")
  grep -Fq '.oh/scripts/firstmate.sh' "$SPEC" || missing+=("/spec execute does not name .oh/scripts/firstmate.sh")
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
# Autopilot no longer runs /eval itself — it reconciles execute's outcome — so the
# eval-red marker cleanup now lives in the shared finalized-paths rule. Assert that rule
# actually enumerates PR-DRAFT-EVAL-RED, or "finalized paths clean the marker" is vacuous.
grep -F 'Clean the active marker on finalized PR paths' "$SKILL" | grep -Fq 'PR-DRAFT-EVAL-RED' || missing+=("the finalized-paths marker cleanup does not cover PR-DRAFT-EVAL-RED")
grep -Fq 'Keep `ACTIVE_MARKER` only on the incomplete-build path' "$SKILL" || missing+=("the incomplete-build path keeps the active marker")

# Dry-run research must not create GitHub issues before the dry-run exit.
dryrun_line="$(grep -nF 'exit before any `gh issue create` mutation' "$SKILL" | head -1 | cut -d: -f1 || true)"
issue_create_line="$(grep -nF 'gh issue create --repo' "$SKILL" | head -1 | cut -d: -f1 || true)"
if [[ -z "$dryrun_line" || -z "$issue_create_line" || "$dryrun_line" -ge "$issue_create_line" ]]; then
  missing+=("research dry-run guard appears before gh issue create")
fi

# Top-level docs should advertise the changed operator contract.
grep -Fq 'There is no executor toggle and no inline fallback' "$AGENTS" || missing+=("AGENTS states there is no executor toggle and no inline fallback")
grep -Fq '.oh/scripts/firstmate.sh' "$AGENTS" || missing+=("AGENTS names the one build executor")

if (( ${#missing[@]} )); then
  printf 'REGRESSION: autopilot single-executor contract broken: %s\n' "${missing[*]}" >&2
  exit 1
fi

echo "PASS: no executor toggle and no inline fallback anywhere, exact goal, autopilot defers the whole build to /spec execute's one executor, safe tmux naming, dedupe guard, active-marker cleanup, dry-run guard" >&2
exit 0
