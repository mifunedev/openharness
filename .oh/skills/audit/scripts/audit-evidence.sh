#!/usr/bin/env bash
# Atomically publish target-correlated terminal evidence for audit-run.sh.
# Usage: audit-evidence.sh complete <native-verdict-token>
set -euo pipefail
[[ ${1:-} == complete && $# -eq 2 ]] || { echo 'usage: audit-evidence.sh complete <native-verdict-token>' >&2; exit 64; }
: "${AUDIT_RUN_ID:?AUDIT_RUN_ID is required}"
: "${AUDIT_TARGET:?AUDIT_TARGET is required}"
: "${AUDIT_TARGET_ARGS_JSON:?AUDIT_TARGET_ARGS_JSON is required}"
: "${AUDIT_EVIDENCE_PATH:?AUDIT_EVIDENCE_PATH is required}"
verdict=$2
[[ $AUDIT_RUN_ID =~ ^audit-[0-9]{8}T[0-9]{6}Z-[A-Za-z0-9._-]+$ ]] \
  || { echo 'audit-evidence: invalid run ID' >&2; exit 64; }
[[ $AUDIT_TARGET =~ ^(implementation|pr|prs|harness|context|skills|eval-quality|drift|full)$ ]] \
  || { echo 'audit-evidence: invalid target' >&2; exit 64; }
[[ $verdict =~ ^[A-Z][A-Z0-9_-]{1,63}$ ]] \
  || { echo 'audit-evidence: verdict must be an uppercase machine token' >&2; exit 64; }
jq -e 'type=="array"' <<<"$AUDIT_TARGET_ARGS_JSON" >/dev/null \
  || { echo 'audit-evidence: invalid target arguments JSON' >&2; exit 64; }
parent=$(dirname "$AUDIT_EVIDENCE_PATH")
resolved_parent=$(cd "$parent" && pwd -P) || exit 64
[[ $AUDIT_EVIDENCE_PATH == "$resolved_parent/$(basename "$AUDIT_EVIDENCE_PATH")" && ! -L $AUDIT_EVIDENCE_PATH ]] \
  || { echo 'audit-evidence: non-canonical or symlinked evidence path' >&2; exit 64; }
tmp="$AUDIT_EVIDENCE_PATH.tmp.$$"
trap 'rm -f "$tmp"' EXIT
jq -n --arg runId "$AUDIT_RUN_ID" --arg target "$AUDIT_TARGET" \
  --argjson targetArgs "$AUDIT_TARGET_ARGS_JSON" --arg verdict "$verdict" \
  --arg finishedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  '{schemaVersion:1,runId:$runId,target:$target,targetArgs:$targetArgs,state:"complete",verdict:$verdict,finishedAt:$finishedAt}' >"$tmp"
mv -f "$tmp" "$AUDIT_EVIDENCE_PATH"
trap - EXIT
