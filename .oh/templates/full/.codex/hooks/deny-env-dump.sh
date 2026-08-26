#!/usr/bin/env bash
set -euo pipefail

root=$(git rev-parse --show-toplevel)
input=$(cat)
output=$(bash "$root/.claude/hooks/deny-env-dump.sh" <<<"$input")

[ -z "$output" ] && exit 0

jq '
  if .hookSpecificOutput.permissionDecision == "ask" then
    .hookSpecificOutput.permissionDecision = "deny"
    | .hookSpecificOutput.permissionDecisionReason += " Codex config runs with approval_policy=never, so this ask-level guard is denied instead of prompting."
  else
    .
  end
' <<<"$output"
