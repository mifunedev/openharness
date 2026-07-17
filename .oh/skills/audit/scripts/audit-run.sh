#!/usr/bin/env bash
# Executable lifecycle and route bridge for one /audit target.
# Usage: audit-run.sh <target> [target args] -- <route-driver> [driver options]
set -euo pipefail
usage_line='usage: /audit <implementation|pr|prs|harness|context|skills|eval-quality|drift|full> [target options]'
usage() {
  printf '%s\n' "$usage_line" >&2
  cat >&2 <<'EOF'
| Target | Invocation | Native result |
|---|---|---|
| implementation | `/audit implementation <slug> [--pr N --repo O/N] [--branch B]` | `AUDIT-PASS` / `AUDIT-FAIL` |
| pr | `/audit pr <N> [--repo O/N] [--deep] [--proof] [--dry-run]` | `PR-AUDIT-PROMOTABLE` / `PR-AUDIT-BLOCKED` / `PR-AUDIT-UNKNOWN` |
| prs | `/audit prs [--repo O/N] [filters/actions]` | buckets + `PRS-AUDIT-COMPLETE` / `PRS-AUDIT-PARTIAL` |
| harness | `/audit harness [--focus area] [--external URL|path] [actions]` | Tier 1/2/3 + Recommended Next 3 Actions |
| context | `/audit context [all|--baseline|--ablate file]` | `KEEP` / `TRIM` / `DEMOTE` / `CUT` |
| skills | `/audit skills [all|root|workspace|name]` | `CURRENT` / `STALE` / `BROKEN` / `DELETE` |
| eval-quality | `/audit eval-quality [all|probes|capability|id]` | `KEEP` / `GROOM` / `CUT` |
| drift | `/audit drift` | per-class `OK` / aggregate `DRIFT:` |
| full | `/audit full [--repo O/N] [--focus area] [--health-target target]` | `AUDIT-CAMPAIGN-COMPLETE` / `AUDIT-CAMPAIGN-PARTIAL` |
EOF
  exit 64
}
[[ $# -gt 0 ]] || usage
target=$1; shift
case $target in implementation|pr|prs|harness|context|skills|eval-quality|drift|full) ;; *) usage;; esac
args=(); command=()
while (($#)); do
  if [[ $1 == -- ]]; then shift; command=("$@"); break; fi
  args+=("$1"); shift
done
# The bridge must remain open around actual route work; a preflight-only invocation is invalid.
((${#command[@]})) || usage
repo_re='^[^/[:space:]]+/[^/[:space:]]+$'; number_re='^[1-9][0-9]*$'; uint_re='^[0-9]+$'
value(){ (($2 < ${#args[@]})) && [[ -n ${args[$2]} && ${args[$2]} != --* ]]; }
case $target in
  implementation)
    ((${#args[@]} >= 1)) && [[ ${args[0]} =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || usage
    have_pr=false; have_repo=false; i=1
    while ((i < ${#args[@]})); do
      case ${args[$i]} in
        --pr) value "$i" "$((i+1))" && [[ ${args[$((i+1))]} =~ $number_re ]] || usage; have_pr=true; ((i+=2));;
        --repo) value "$i" "$((i+1))" && [[ ${args[$((i+1))]} =~ $repo_re ]] || usage; have_repo=true; ((i+=2));;
        --branch) value "$i" "$((i+1))" || usage; ((i+=2));;
        *) usage;;
      esac
    done
    [[ $have_pr == "$have_repo" ]] || usage
    ;;
  pr)
    ((${#args[@]} >= 1)) && [[ ${args[0]} =~ $number_re ]] || usage
    i=1
    while ((i < ${#args[@]})); do
      case ${args[$i]} in
        --repo) value "$i" "$((i+1))" && [[ ${args[$((i+1))]} =~ $repo_re ]] || usage; ((i+=2));;
        --deep|--proof|--dry-run) ((i+=1));;
        *) usage;;
      esac
    done
    ;;
  prs)
    have_author=false; mine=false; close=false; close_days=false; i=0
    while ((i < ${#args[@]})); do
      case ${args[$i]} in
        --repo) value "$i" "$((i+1))" && [[ ${args[$((i+1))]} =~ $repo_re ]] || usage; ((i+=2));;
        --label|--base) value "$i" "$((i+1))" || usage; ((i+=2));;
        --author) value "$i" "$((i+1))" || usage; have_author=true; ((i+=2));;
        --mine) mine=true; ((i+=1));;
        --stale-days|--close-stale-days) value "$i" "$((i+1))" && [[ ${args[$((i+1))]} =~ $uint_re ]] || usage; [[ ${args[$i]} == --close-stale-days ]] && close_days=true; ((i+=2));;
        --apply) value "$i" "$((i+1))" || usage; [[ ${args[$((i+1))]} =~ ^(proof|labels|close)$ ]] || usage; [[ ${args[$((i+1))]} == close ]] && close=true; ((i+=2));;
        --deep|--dry-run) ((i+=1));;
        *) usage;;
      esac
    done
    [[ ! ($have_author == true && $mine == true) && $close == "$close_days" ]] || usage
    ;;
  harness)
    external=false; focus=false; apply=false; confirm=false; wiki=false; i=0
    while ((i < ${#args[@]})); do
      case ${args[$i]} in
        --focus) value "$i" "$((i+1))" || usage; focus=true; ((i+=2));;
        --external) value "$i" "$((i+1))" || usage; external=true; ((i+=2));;
        --apply) value "$i" "$((i+1))" && [[ ${args[$((i+1))]} == issue ]] || usage; apply=true; ((i+=2));;
        --confirm) confirm=true; ((i+=1));;
        --wiki-ingest) wiki=true; ((i+=1));;
        --dry-run) ((i+=1));;
        *) usage;;
      esac
    done
    [[ ! ($external == true && $focus == true) ]] || usage
    if [[ $apply == true || $confirm == true || $wiki == true ]]; then [[ $external == true ]] || usage; fi
    [[ $confirm == false || $apply == true ]] || usage
    ;;
  context)
    case ${#args[@]}:${args[0]:-} in 0:|1:all|1:--baseline) :;; 2:--ablate) [[ -n ${args[1]} && ${args[1]} != --* ]] || usage;; *) usage;; esac
    ;;
  skills) ((${#args[@]} <= 1)) && [[ ${args[0]:-all} =~ ^(all|root|workspace|[A-Za-z0-9._-]+)$ ]] || usage;;
  eval-quality) ((${#args[@]} <= 1)) && [[ ${args[0]:-all} =~ ^(all|probes|capability|[A-Za-z0-9._-]+)$ ]] || usage;;
  drift) ((${#args[@]} == 0)) || usage;;
  full)
    i=0; while ((i < ${#args[@]})); do
      case ${args[$i]} in
        --repo) value "$i" "$((i+1))" && [[ ${args[$((i+1))]} =~ $repo_re ]] || usage; ((i+=2));;
        --focus|--health-target) value "$i" "$((i+1))" || usage; ((i+=2));;
        *) usage;;
      esac
    done
    ;;
esac
command -v -- "${command[0]}" >/dev/null 2>&1 || usage

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
export AUDIT_ROUTE="$route" AUDIT_TARGET="$target"
AUDIT_TARGET_ARGS_JSON=$(jq -cn --args '$ARGS.positional' -- "${args[@]}")
export AUDIT_TARGET_ARGS_JSON
started_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
tmp_root=$(mktemp -d "${TMPDIR:-/tmp}/${AUDIT_RUN_ID}.${target}.XXXXXX")
export AUDIT_TMP_ROOT="$tmp_root"
child_pid='' child_group=false interrupted=''
# shellcheck disable=SC2329 # invoked by the EXIT trap
cleanup(){ rm -rf "$tmp_root"; }
# shellcheck disable=SC2329 # invoked by INT/TERM/HUP traps
forward_signal(){
  local sig=$1
  interrupted=$sig
  [[ -n $child_pid ]] || return 0
  if [[ $child_group == true ]]; then kill -s "$sig" -- "-$child_pid" 2>/dev/null || true
  else kill -s "$sig" "$child_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT
trap 'forward_signal INT' INT
trap 'forward_signal TERM' TERM
trap 'forward_signal HUP' HUP
cd "$AUDIT_ROOT"
# The driver receives the validated target and target arguments verbatim after its own options.
# AUDIT_ROUTE and AUDIT_TARGET_ARGS_JSON provide equivalent named/machine-readable bindings.
if command -v setsid >/dev/null 2>&1; then
  setsid -- "${command[@]}" "$target" "${args[@]}" & child_pid=$!; child_group=true
else
  "${command[@]}" "$target" "${args[@]}" & child_pid=$!
fi
rc=0
wait "$child_pid" || rc=$?
if [[ -n $interrupted ]]; then
  # A trapped signal can interrupt wait before the child/group has reaped.
  if kill -0 "$child_pid" 2>/dev/null; then wait "$child_pid" || true; fi
  rc=$((128 + $(kill -l "$interrupted")))
fi
trap - INT TERM HUP
if [[ $outer == true ]]; then
  today=$(date -u +%Y-%m-%d); finished_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  log="$AUDIT_LOG_ROOT/.oh/memory/$today/log.md"
  state=complete; [[ $rc -eq 0 ]] || state=failed; [[ -z $interrupted ]] || state=interrupted
  if ! printf '## audit -- %s UTC\n- **Run-ID**: %s\n- **Target**: %s\n- **State**: %s\n- **Exit**: %s\n- **Started**: %s\n- **Finished**: %s\n\n' \
    "$(date -u +%H:%M)" "$AUDIT_RUN_ID" "$target" "$state" "$rc" "$started_at" "$finished_at" \
    | bash "$AUDIT_ROOT/.oh/scripts/locked-append.sh" "$log"; then
    echo 'audit: terminal log append failed' >&2
    [[ $rc -ne 0 ]] || rc=1
  fi
fi
exit "$rc"
