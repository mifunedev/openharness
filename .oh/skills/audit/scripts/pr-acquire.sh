#!/usr/bin/env bash
# Private GitHub acquisition seam for /audit pr, prs, implementation, and fresh actions.
set -euo pipefail
usage() { echo 'usage: pr-acquire.sh <pr|prs> --repo owner/name [--pr N] [--label L] [--author A|--mine] [--base B] [--stale-days N]' >&2; exit 64; }
mode=${1:-}; shift || true
[[ "$mode" == pr || "$mode" == prs ]] || usage
repo='' pr='' label='' author='' base='' stale=14 mine=false
while (($#)); do
  case $1 in
    --repo) repo=${2:-}; shift 2;;
    --pr) pr=${2:-}; shift 2;;
    --label) label=${2:-}; shift 2;;
    --author) author=${2:-}; shift 2;;
    --mine) mine=true; shift;;
    --base) base=${2:-}; shift 2;;
    --stale-days) stale=${2:-}; shift 2;;
    *) usage;;
  esac
done
[[ $repo =~ ^[^/[:space:]]+/[^/[:space:]]+$ ]] || { echo 'ERROR: --repo must be owner/name' >&2; exit 64; }
[[ $stale =~ ^[0-9]+$ ]] || usage
[[ $mine == false || -z $author ]] || { echo 'ERROR: --author and --mine are mutually exclusive' >&2; exit 64; }
if [[ $mode == pr ]]; then
  [[ $pr =~ ^[1-9][0-9]*$ ]] || usage
  [[ -z $label && -z $author && -z $base && $mine == false ]] || usage
else
  [[ -z $pr ]] || usage
fi
run=${AUDIT_RUN_ID:-audit-unscoped}
work=$(mktemp -d "${TMPDIR:-/tmp}/${run}.pr-acquire.XXXXXX")
trap 'rm -rf "$work"' EXIT INT TERM HUP
tmp="$work/snapshot.json"
fields=number,title,headRefName,baseRefName,isDraft,mergeable,mergeStateStatus,reviewDecision,statusCheckRollup,createdAt,updatedAt,author,additions,deletions,changedFiles,labels,url,body,closingIssuesReferences
if [[ $mode == pr ]]; then
  gh pr view "$pr" --repo "$repo" --json "$fields" | jq -s '.' >"$tmp"
  truncated=false
else
  args=(pr list --state open --repo "$repo" --limit 200 --json "$fields")
  [[ -n $label ]] && args+=(--label "$label")
  [[ $mine == true ]] && author='@me'
  [[ -n $author ]] && args+=(--author "$author")
  [[ -n $base ]] && args+=(--base "$base")
  gh "${args[@]}" >"$tmp"
  [[ $(jq 'length' "$tmp") -ge 200 ]] && truncated=true || truncated=false
fi
expected_base=${base:-development}
jq -n --arg observedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg repo "$repo" --arg mode "$mode" \
  --arg expectedBase "$expected_base" --argjson staleDays "$stale" --argjson truncated "$truncated" --slurpfile prs "$tmp" \
  '{schemaVersion:1,observedAt:$observedAt,repo:$repo,mode:$mode,options:{staleDays:$staleDays,expectedBase:$expectedBase,maxChangedFiles:50},truncated:$truncated,prs:$prs[0]}'
