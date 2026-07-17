#!/usr/bin/env bash
# Executable production gates shared by /audit implementation fixtures and route.
set -euo pipefail
: "${AUDIT_ROOT:?AUDIT_ROOT is required}"
AUDIT_ROOT=$(cd "$AUDIT_ROOT" && pwd -P)
mode=${1:-}; shift || true
case $mode in
  gate1)
    slug=${1:-}; [[ $slug =~ ^[A-Za-z0-9._-]+$ ]] || { echo 'FAIL gate1: invalid slug' >&2; exit 64; }
    prd="$AUDIT_ROOT/.oh/tasks/$slug/prd.json"
    [[ -f $prd && ! -L $prd ]] || { echo "FAIL gate1: no regular $prd" >&2; exit 1; }
    unfinished=$(jq '[.userStories[] | select(.passes != true)] | length' "$prd")
    total=$(jq '.userStories | length' "$prd")
    printf 'task-graph: %s/%s stories pass\n' "$((total - unfinished))" "$total"
    [[ $unfinished -eq 0 ]] || { echo "FAIL gate1: $unfinished story(ies) not passing" >&2; exit 1; }
    while IFS= read -r artifact; do
      [[ -n $artifact ]] || continue
      [[ $artifact != /* ]] || { echo "FAIL gate1: artifact must be AUDIT_ROOT-relative: $artifact" >&2; exit 1; }
      path="$AUDIT_ROOT/$artifact"
      [[ ! -L $path && -e $path ]] || { echo "FAIL gate1: required_artifact missing or symlinked: $artifact" >&2; exit 1; }
    done < <(jq -r '.artifact_contract.required_artifacts // [] | .[]' "$prd")
    ;;
  classify-pr)
    repo=${1:-}; pr=${2:-}
    [[ $repo =~ ^[^/[:space:]]+/[^/[:space:]]+$ && $pr =~ ^[1-9][0-9]*$ ]] \
      || { echo 'usage: implementation-gates.sh classify-pr owner/name N' >&2; exit 64; }
    "$AUDIT_ROOT/.oh/skills/audit/scripts/pr-acquire.sh" pr --repo "$repo" --pr "$pr" \
      | "$AUDIT_ROOT/.oh/skills/audit/scripts/pr-classify.sh"
    ;;
  browser-required)
    slug=${1:-}; [[ $slug =~ ^[A-Za-z0-9._-]+$ ]] || exit 64
    prd="$AUDIT_ROOT/.oh/tasks/$slug/prd.json"; [[ -f $prd ]] || exit 1
    grep -qi 'agent-browser\|Verify in browser' "$prd"
    ;;
  browser-preflight)
    : "${AUDIT_RUN_ID:?AUDIT_RUN_ID is required}"
    : "${AUDIT_TMP_ROOT:?AUDIT_TMP_ROOT is required}"
    command -v agent-browser >/dev/null || { echo 'FAIL gate4: agent-browser not found' >&2; exit 1; }
    before=$(git -C "$AUDIT_ROOT" status --porcelain=v1 --untracked-files=all)
    profile=$(mktemp -d "$AUDIT_TMP_ROOT/browser-profile.XXXXXX")
    session="audit-$AUDIT_RUN_ID"
    close_browser(){ HOME="$profile" agent-browser close --session "$session" >/dev/null 2>&1 || true; rm -rf "$profile"; }
    trap close_browser EXIT INT TERM HUP
    HOME="$profile" agent-browser --version >/dev/null 2>&1 \
      || { echo 'FAIL gate4: agent-browser version check' >&2; exit 1; }
    HOME="$profile" agent-browser open about:blank --session "$session" >/dev/null 2>&1 \
      || { echo 'FAIL gate4: Chromium launch' >&2; exit 1; }
    close_browser; trap - EXIT INT TERM HUP
    after=$(git -C "$AUDIT_ROOT" status --porcelain=v1 --untracked-files=all)
    [[ $before == "$after" ]] || { echo 'FAIL gate4: browser preflight mutated AUDIT_ROOT' >&2; exit 1; }
    ;;
  *) echo 'usage: implementation-gates.sh <gate1|classify-pr|browser-required|browser-preflight> ...' >&2; exit 64;;
esac
