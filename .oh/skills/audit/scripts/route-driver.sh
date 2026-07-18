#!/usr/bin/env bash
# Canonical production bridge from audit-run.sh to a non-scriptable inline agent.
# AUDIT_AGENT_COMMAND_JSON is a JSON argv array whose final argument will be the prompt.
set -euo pipefail
: "${AUDIT_ROOT:?AUDIT_ROOT is required}"
: "${AUDIT_ROUTE:?AUDIT_ROUTE is required}"
: "${AUDIT_TARGET:?AUDIT_TARGET is required}"
: "${AUDIT_TARGET_ARGS_JSON:?AUDIT_TARGET_ARGS_JSON is required}"
: "${AUDIT_TMP_ROOT:?AUDIT_TMP_ROOT is required}"
: "${AUDIT_AGENT_COMMAND_JSON:?set AUDIT_AGENT_COMMAND_JSON to a JSON argv array, e.g. [\"claude\",\"-p\",\"--output-format\",\"text\"]}"
[[ ${1:-} == "$AUDIT_TARGET" ]] || { echo 'audit-route-driver: forwarded target mismatch' >&2; exit 64; }
shift
forwarded=$(jq -cn --args '$ARGS.positional' -- "$@")
[[ $forwarded == "$AUDIT_TARGET_ARGS_JSON" ]] || { echo 'audit-route-driver: forwarded argument mismatch' >&2; exit 64; }
mapfile -t agent_argv < <(jq -er '. as $a | if type=="array" and length>0 and all(.[]; type=="string" and length>0) then .[] else error("invalid argv") end' <<<"$AUDIT_AGENT_COMMAND_JSON")
((${#agent_argv[@]})) || exit 64
command -v -- "${agent_argv[0]}" >/dev/null 2>&1 || { echo 'audit-route-driver: agent command not found' >&2; exit 64; }
[[ -f $AUDIT_ROUTE && ! -L $AUDIT_ROUTE ]] || { echo 'audit-route-driver: route is missing or symlinked' >&2; exit 1; }
prompt="$AUDIT_TMP_ROOT/route-prompt.txt"; output="$AUDIT_TMP_ROOT/route-output.txt"
{
  printf 'Execute this selected Open Harness audit route completely.\n'
  printf 'AUDIT_RUN_ID: %s\nAUDIT_TARGET: %s\nAUDIT_TARGET_ARGS_JSON: %s\n' "$AUDIT_RUN_ID" "$AUDIT_TARGET" "$AUDIT_TARGET_ARGS_JSON"
  printf 'Operate only under AUDIT_ROOT=%s and obey the route below.\n' "$AUDIT_ROOT"
  printf 'Return the route report, preserving its native verdict. Your final line must be exactly AUDIT-EVIDENCE: <TOKEN>, where TOKEN is the native terminal verdict rendered as one uppercase machine token (A-Z, 0-9, underscore, hyphen). Do not print anything after it.\n\n'
  cat "$AUDIT_ROUTE"
} >"$prompt"
rc=0
"${agent_argv[@]}" "$(<"$prompt")" >"$output" 2>&1 || rc=$?
cat "$output"
[[ $rc -eq 0 ]] || exit "$rc"
last=$(awk 'NF{line=$0} END{print line}' "$output")
[[ $last =~ ^AUDIT-EVIDENCE:\ ([A-Z][A-Z0-9_-]{1,63})$ ]] \
  || { echo 'audit-route-driver: missing valid final AUDIT-EVIDENCE token' >&2; exit 1; }
"$AUDIT_ROOT/.oh/skills/audit/scripts/audit-evidence.sh" complete "${BASH_REMATCH[1]}"
