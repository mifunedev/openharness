#!/usr/bin/env bash
# Executable lifecycle boundary for one /audit route.
# Usage: audit-run.sh <target> [target args] [-- command ...]
set -euo pipefail
usage='usage: /audit <implementation|pr|prs|harness|context|skills|eval-quality|drift|full> [target options]'
fail_usage() { printf '%s\n' "$usage" >&2; exit 64; }
[[ $# -gt 0 ]] || fail_usage
target=$1; shift
case $target in implementation|pr|prs|harness|context|skills|eval-quality|drift|full) ;; *) fail_usage;; esac
args=(); command=()
while (($#)); do
  if [[ $1 == -- ]]; then shift; command=("$@"); break; fi
  args+=("$1"); shift
done
case $target in
  implementation) [[ ${args[0]:-} != '' && ${args[0]} != --* ]] || fail_usage;;
  pr) [[ ${args[0]:-} =~ ^[1-9][0-9]*$ ]] || fail_usage;;
esac
# Reject the public run-id escape hatch and validate harness external-mode combinations.
for arg in "${args[@]}"; do [[ $arg != --run-id ]] || fail_usage; done
if [[ $target == harness ]]; then
  joined=" ${args[*]} "
  [[ ! ($joined == *' --external '* && $joined == *' --focus '*) ]] || fail_usage
  if [[ $joined == *' --wiki-ingest '* || $joined == *' --apply '* || $joined == *' --confirm '* ]]; then
    [[ $joined == *' --external '* ]] || fail_usage
  fi
fi
script_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd -P)
if [[ -n ${AUDIT_RUN_ID:-} ]]; then
  [[ $AUDIT_RUN_ID =~ ^audit-[0-9]{8}T[0-9]{6}Z-[A-Za-z0-9._-]+$ ]] || { echo 'audit: invalid inherited AUDIT_RUN_ID' >&2; exit 64; }
  [[ -n ${AUDIT_ROOT:-} && -n ${AUDIT_LOG_ROOT:-} ]] || { echo 'audit: inherited run requires both roots' >&2; exit 64; }
  resolved_root=$(cd "$AUDIT_ROOT" && pwd -P) || exit 64
  resolved_log_root=$(cd "$AUDIT_LOG_ROOT" && pwd -P) || exit 64
  [[ $resolved_root == "$AUDIT_ROOT" && $resolved_log_root == "$AUDIT_LOG_ROOT" ]] || { echo 'audit: inherited roots must be canonical' >&2; exit 64; }
  outer=false
else
  if [[ -n ${CRON_WORKTREE:-} ]] && git -C "$CRON_WORKTREE" rev-parse --show-toplevel >/dev/null 2>&1; then
    resolved_root=$(git -C "$CRON_WORKTREE" rev-parse --show-toplevel)
  else
    resolved_root=$(git -C "$script_root" rev-parse --show-toplevel)
  fi
  resolved_root=$(cd "$resolved_root" && pwd -P)
  if [[ -n ${AUTOPILOT_LOG_ROOT:-} ]] && git -C "$AUTOPILOT_LOG_ROOT" rev-parse --show-toplevel >/dev/null 2>&1; then
    resolved_log_root=$(git -C "$AUTOPILOT_LOG_ROOT" rev-parse --show-toplevel)
  else
    resolved_log_root=$(git -C "$resolved_root" worktree list --porcelain | awk 'NR==1 && $1=="worktree" {sub(/^worktree /,""); print; exit}')
  fi
  resolved_log_root=$(cd "$resolved_log_root" && pwd -P)
  AUDIT_RUN_ID="audit-$(date -u +%Y%m%dT%H%M%SZ)-$BASHPID"
  AUDIT_ROOT=$resolved_root AUDIT_LOG_ROOT=$resolved_log_root
  export AUDIT_RUN_ID AUDIT_ROOT AUDIT_LOG_ROOT
  outer=true
fi
route="$AUDIT_ROOT/.oh/skills/audit/references/$target.md"
[[ -f $route ]] || { echo "audit: route missing: $route" >&2; exit 1; }
started_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
tmp_root=$(mktemp -d "${TMPDIR:-/tmp}/${AUDIT_RUN_ID}.${target}.XXXXXX")
trap 'rm -rf "$tmp_root"' EXIT INT TERM HUP
export AUDIT_TMP_ROOT="$tmp_root"
rc=0
if ((${#command[@]})); then
  "${command[@]}" || rc=$?
else
  jq -n --arg runId "$AUDIT_RUN_ID" --arg root "$AUDIT_ROOT" --arg logRoot "$AUDIT_LOG_ROOT" \
    --arg route "$route" --arg target "$target" --arg startedAt "$started_at" \
    '{runId:$runId,root:$root,logRoot:$logRoot,route:$route,target:$target,startedAt:$startedAt}'
fi
if [[ $outer == true ]]; then
  today=$(date -u +%Y-%m-%d); finished_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  log="$AUDIT_LOG_ROOT/.oh/memory/$today/log.md"
  result=complete; [[ $rc -eq 0 ]] || result=failed
  printf '## audit -- %s UTC\n- **Run-ID**: %s\n- **Target**: %s\n- **State**: %s\n- **Started**: %s\n- **Finished**: %s\n\n' \
    "$(date -u +%H:%M)" "$AUDIT_RUN_ID" "$target" "$result" "$started_at" "$finished_at" \
    | bash "$AUDIT_ROOT/.oh/scripts/locked-append.sh" "$log"
fi
exit "$rc"
