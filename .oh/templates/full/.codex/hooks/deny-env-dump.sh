#!/usr/bin/env bash
# Codex wrapper for the shared Claude Bash secret-exposure guard.
# Codex PreToolUse currently cannot surface "ask" decisions, so convert those
# to deny to preserve the no-approval-prompt default without failing open.
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
