#!/usr/bin/env bash
# tier: A
# source: issue #645 — deterministic focused and queue PR classifier
# desc: frozen CI/readiness enums, draft limbo, duplicates, unknowns, and byte stability hold
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"; C="$ROOT/.oh/skills/audit/scripts/pr-classify.sh"
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail(){ echo "REGRESSION: $*" >&2; exit 1; }
env(){ jq -n --arg mode "$1" --argjson prs "$2" '{schemaVersion:1,observedAt:"2026-07-17T12:00:00Z",repo:"o/r",mode:$mode,options:{staleDays:14,expectedBase:"development",maxChangedFiles:50},truncated:false,prs:$prs}'; }
base='{"number":1,"title":"FROM x TO development","headRefName":"feat/1-x","baseRefName":"development","isDraft":false,"mergeable":"MERGEABLE","mergeStateStatus":"CLEAN","reviewDecision":"","updatedAt":"2026-07-17T00:00:00Z","changedFiles":1,"body":"Closes #9","closingIssuesReferences":[]}'
check_ci(){ local raw=$1 expect=$2 field=${3:-conclusion}; p=$(jq -c --arg f "$field" --arg v "$raw" '.+{statusCheckRollup:[{($f):$v}]}' <<<"$base"); out=$(env pr "[$p]"|bash "$C"); [[ $(jq -r .ci<<<"$out") == "$expect" ]]||fail "$raw != $expect"; }
for x in ACTION_REQUIRED CANCELLED ERROR FAILURE STARTUP_FAILURE STALE TIMED_OUT; do check_ci "$x" FAIL; done
for x in EXPECTED IN_PROGRESS PENDING QUEUED REQUESTED WAITING; do check_ci "$x" PENDING status; done
for x in SUCCESS NEUTRAL SKIPPED; do check_ci "$x" PASS; done
p=$(jq -c '.+{statusCheckRollup:[]}'<<<"$base"); [[ $(env pr "[$p]"|bash "$C"|jq -r .ci) == NONE ]]||fail NONE
for bad in BRAND_NEW ''; do p=$(jq -c --arg x "$bad" '.+{statusCheckRollup:[{conclusion:$x}]}'<<<"$base"); out=$(env pr "[$p]"|bash "$C"); [[ $(jq -r '.ci+":"+(.evidenceComplete|tostring)'<<<"$out") == UNKNOWN:false ]]||fail unknown; done
for review in APPROVED '' null; do p=$(jq -c --arg r "$review" '.+{statusCheckRollup:[{conclusion:"SUCCESS"}],reviewDecision:(if $r=="null" then null else $r end)}'<<<"$base"); out=$(env pr "[$p]"|bash "$C"); [[ $(jq -r '[.readyForReview,.readyToMerge,.promotable]|join(":")'<<<"$out") == false:true:true ]]||fail "solo readiness $review"; done
p=$(jq -c '.+{isDraft:true,statusCheckRollup:[{conclusion:"SUCCESS"}],updatedAt:"2026-06-01T00:00:00Z"}'<<<"$base"); out=$(env pr "[$p]"|bash "$C"); [[ $(jq -r '[.draftStatus,.draftLimbo,.readyForReview,.readyToMerge]|join(":")'<<<"$out") == promotable:true:true:false ]]||fail limbo
p1=$(jq -c '.+{statusCheckRollup:[{conclusion:"SUCCESS"}]}'<<<"$base"); p2=$(jq -c '.+{number:2,statusCheckRollup:[{conclusion:"SUCCESS"}]}'<<<"$base"); input=$(env prs "[$p1,$p2]"); a=$(bash "$C"<<<"$input"); b=$(bash "$C"<<<"$input"); [[ $a == "$b" ]]||fail nondeterministic; [[ $(jq '[.prs[]|select(.flags|index("duplicate-issue-reference"))]|length'<<<"$a") == 2 ]]||fail duplicates
[[ $(jq '[.prs[]|select((.readyForReview and .readyToMerge) or ((.isDraft|not) and .readyForReview) or (.isDraft and .readyToMerge))]|length'<<<"$a") == 0 ]]||fail exclusion
echo 'PASS: classifier contract' >&2
