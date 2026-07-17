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
# A route driver is mandatory: the lifecycle must surround actual route work.
((${#command[@]})) || fail_usage
repo_re='^[^/[:space:]]+/[^/[:space:]]+$'; number_re='^[1-9][0-9]*$'; uint_re='^[0-9]+$'
value(){ (($2 < ${#args[@]})) && [[ -n ${args[$2]} && ${args[$2]} != --* ]]; }
case $target in
  implementation)
    ((${#args[@]} >= 1)) && [[ ${args[0]} =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || fail_usage
    have_pr=false; have_repo=false; i=1
    while ((i < ${#args[@]})); do
      case ${args[$i]} in
        --pr) value "$i" "$((i+1))" && [[ ${args[$((i+1))]} =~ $number_re ]] || fail_usage; have_pr=true; ((i+=2));;
        --repo) value "$i" "$((i+1))" && [[ ${args[$((i+1))]} =~ $repo_re ]] || fail_usage; have_repo=true; ((i+=2));;
        --branch) value "$i" "$((i+1))" || fail_usage; ((i+=2));;
        *) fail_usage;;
      esac
    done
    [[ $have_pr == "$have_repo" ]] || fail_usage
    ;;
  pr)
    ((${#args[@]} >= 3)) && [[ ${args[0]} =~ $number_re ]] || fail_usage
    have_repo=false; i=1
    while ((i < ${#args[@]})); do
      case ${args[$i]} in
        --repo) value "$i" "$((i+1))" && [[ ${args[$((i+1))]} =~ $repo_re ]] || fail_usage; have_repo=true; ((i+=2));;
        --deep|--proof|--dry-run) ((i+=1));;
        *) fail_usage;;
      esac
    done
    [[ $have_repo == true ]] || fail_usage
    ;;
  prs)
    have_repo=false; have_author=false; mine=false; close=false; close_days=false; i=0
    while ((i < ${#args[@]})); do
      case ${args[$i]} in
        --repo) value "$i" "$((i+1))" && [[ ${args[$((i+1))]} =~ $repo_re ]] || fail_usage; have_repo=true; ((i+=2));;
        --label|--base) value "$i" "$((i+1))" || fail_usage; ((i+=2));;
        --author) value "$i" "$((i+1))" || fail_usage; have_author=true; ((i+=2));;
        --mine) mine=true; ((i+=1));;
        --stale-days|--close-stale-days) value "$i" "$((i+1))" && [[ ${args[$((i+1))]} =~ $uint_re ]] || fail_usage; [[ ${args[$i]} == --close-stale-days ]] && close_days=true; ((i+=2));;
        --apply) value "$i" "$((i+1))" || fail_usage; [[ ${args[$((i+1))]} =~ ^(proof|labels|close)$ ]] || fail_usage; [[ ${args[$((i+1))]} == close ]] && close=true; ((i+=2));;
        --deep|--dry-run) ((i+=1));;
        *) fail_usage;;
      esac
    done
    [[ $have_repo == true && ! ($have_author == true && $mine == true) && $close == "$close_days" ]] || fail_usage
    ;;
  harness)
    external=false; focus=false; apply=false; confirm=false; i=0
    while ((i < ${#args[@]})); do
      case ${args[$i]} in
        --focus) value "$i" "$((i+1))" || fail_usage; focus=true; ((i+=2));;
        --external) value "$i" "$((i+1))" || fail_usage; external=true; ((i+=2));;
        --apply) value "$i" "$((i+1))" && [[ ${args[$((i+1))]} == issue ]] || fail_usage; apply=true; ((i+=2));;
        --confirm) confirm=true; ((i+=1));;
        --wiki-ingest|--dry-run) ((i+=1));;
        *) fail_usage;;
      esac
    done
    [[ ! ($external == true && $focus == true) ]] || fail_usage
    if [[ $apply == true || $confirm == true ]] || [[ " ${args[*]} " == *' --wiki-ingest '* ]]; then [[ $external == true ]] || fail_usage; fi
    [[ $confirm == false || $apply == true ]] || fail_usage
    ;;
  context)
    case ${#args[@]}:${args[0]:-} in 0:|1:all|1:--baseline) :;; 2:--ablate) [[ -n ${args[1]} && ${args[1]} != --* ]] || fail_usage;; *) fail_usage;; esac
    ;;
  skills) ((${#args[@]} <= 1)) && [[ ${args[0]:-all} =~ ^(all|root|workspace|[A-Za-z0-9._-]+)$ ]] || fail_usage;;
  eval-quality) ((${#args[@]} <= 1)) && [[ ${args[0]:-all} =~ ^(all|probes|capability|[A-Za-z0-9._-]+)$ ]] || fail_usage;;
  drift) ((${#args[@]} == 0)) || fail_usage;;
  full)
    i=0; while ((i < ${#args[@]})); do case ${args[$i]} in --focus|--health-target) value "$i" "$((i+1))" || fail_usage; ((i+=2));; *) fail_usage;; esac; done
    ;;
esac
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
[[ -f $route && ! -L $route ]] || { echo "audit: route missing or symlinked: $route" >&2; exit 1; }
export AUDIT_ROUTE="$route"
started_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
tmp_root=$(mktemp -d "${TMPDIR:-/tmp}/${AUDIT_RUN_ID}.${target}.XXXXXX")
trap 'rm -rf "$tmp_root"' EXIT INT TERM HUP
export AUDIT_TMP_ROOT="$tmp_root"
rc=0
"${command[@]}" || rc=$?
if [[ $outer == true ]]; then
  today=$(date -u +%Y-%m-%d); finished_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  log="$AUDIT_LOG_ROOT/.oh/memory/$today/log.md"
  result=complete; [[ $rc -eq 0 ]] || result=failed
  printf '## audit -- %s UTC\n- **Run-ID**: %s\n- **Target**: %s\n- **State**: %s\n- **Started**: %s\n- **Finished**: %s\n\n' \
    "$(date -u +%H:%M)" "$AUDIT_RUN_ID" "$target" "$result" "$started_at" "$finished_at" \
    | bash "$AUDIT_ROOT/.oh/scripts/locked-append.sh" "$log"
fi
exit "$rc"
