#!/usr/bin/env bash
# Executable production gates shared by /audit implementation fixtures and route.
set -euo pipefail
: "${AUDIT_ROOT:?AUDIT_ROOT is required}"
AUDIT_ROOT=$(cd "$AUDIT_ROOT" && pwd -P)
mode=${1:-}; shift || true
case $mode in
  gate1)
    slug=${1:-}; [[ $slug =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || { echo 'FAIL gate1: invalid slug' >&2; exit 64; }
    task_dir="$AUDIT_ROOT/.oh/tasks/$slug"; prd="$task_dir/prd.json"
    resolved_task=$(realpath -e -- "$task_dir" 2>/dev/null) \
      || { echo "FAIL gate1: missing task directory: $task_dir" >&2; exit 1; }
    [[ $resolved_task == "$task_dir" && -d $task_dir && ! -L $task_dir && -f $prd && ! -L $prd ]] \
      || { echo "FAIL gate1: task directory or prd.json is symlinked/non-regular: $task_dir" >&2; exit 1; }
    jq -e '(.userStories|type)=="array"
      and all(.userStories[]; type=="object")
      and ((.artifact_contract // {})|type)=="object"
      and ((.artifact_contract.required_artifacts // [])|type)=="array"
      and all((.artifact_contract.required_artifacts // [])[]; type=="string")' "$prd" >/dev/null \
      || { echo 'FAIL gate1: userStories/artifact_contract must use array contracts' >&2; exit 1; }
    unfinished=$(jq '[.userStories[] | select(.passes != true)] | length' "$prd")
    total=$(jq '.userStories | length' "$prd")
    printf 'task-graph: %s/%s stories pass\n' "$((total - unfinished))" "$total"
    [[ $unfinished -eq 0 ]] || { echo "FAIL gate1: $unfinished story(ies) not passing" >&2; exit 1; }
    while IFS= read -r artifact; do
      [[ -n $artifact && $artifact != /* ]] || { echo "FAIL gate1: artifact must be AUDIT_ROOT-relative: $artifact" >&2; exit 1; }
      path="$AUDIT_ROOT/$artifact"
      resolved=$(realpath -e -- "$path" 2>/dev/null) \
        || { echo "FAIL gate1: required_artifact missing: $artifact" >&2; exit 1; }
      # Exact canonical equality rejects '..', duplicate separators, and symlinks in
      # any path component; the prefix check keeps every artifact below AUDIT_ROOT.
      [[ $resolved == "$AUDIT_ROOT/"* && $resolved == "$path" ]] \
        || { echo "FAIL gate1: required_artifact is non-canonical, symlinked, or outside AUDIT_ROOT: $artifact" >&2; exit 1; }
    done < <(jq -r '.artifact_contract.required_artifacts // [] | .[]' "$prd")
    ;;
  classify-pr)
    repo=${1:-}; pr=${2:-}; base=${3:-development}
    [[ $repo =~ ^[^/[:space:]]+/[^/[:space:]]+$ && $pr =~ ^[1-9][0-9]*$ && -n $base ]] \
      || { echo 'usage: implementation-gates.sh classify-pr owner/name N [expected-base]' >&2; exit 64; }
    "$AUDIT_ROOT/.oh/skills/audit/scripts/pr-acquire.sh" pr --repo "$repo" --pr "$pr" --base "$base" \
      | "$AUDIT_ROOT/.oh/skills/audit/scripts/pr-classify.sh"
    ;;
  browser-required)
    slug=${1:-}; [[ $slug =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || exit 64
    prd="$AUDIT_ROOT/.oh/tasks/$slug/prd.json"; [[ -f $prd ]] || exit 1
    grep -qi 'agent-browser\|Verify in browser' "$prd"
    ;;
  browser-preflight)
    : "${AUDIT_RUN_ID:?AUDIT_RUN_ID is required}"
    : "${AUDIT_TMP_ROOT:?AUDIT_TMP_ROOT is required}"
    command -v agent-browser >/dev/null || { echo 'FAIL gate4: agent-browser not found' >&2; exit 1; }
    snapshot_repo(){
      local out=$1 path rel
      {
        # Git evidence covers index/worktree semantics. The filesystem walk also
        # hashes ignored, untracked, and already-dirty content (excluding .git).
        git -C "$AUDIT_ROOT" status --porcelain=v1 -z --untracked-files=all
        git -C "$AUDIT_ROOT" diff --binary --no-ext-diff
        git -C "$AUDIT_ROOT" diff --cached --binary --no-ext-diff
        git -C "$AUDIT_ROOT" ls-files --stage -z
        while IFS= read -r -d '' path; do
          rel=${path#"$AUDIT_ROOT"/}
          printf '%s\0' "$rel"
          stat -c '%F:%a:%s' -- "$path"
          if [[ -L $path ]]; then readlink -- "$path"
          elif [[ -f $path ]]; then sha256sum -- "$path"
          fi
        done < <(find "$AUDIT_ROOT" -path "$AUDIT_ROOT/.git" -prune -o -print0 | sort -z)
      } >"$out"
    }
    before="$AUDIT_TMP_ROOT/repo-before"; after="$AUDIT_TMP_ROOT/repo-after"
    snapshot_repo "$before"
    profile=$(mktemp -d "$AUDIT_TMP_ROOT/browser-profile.XXXXXX")
    session="audit-$AUDIT_RUN_ID"
    close_browser(){ HOME="$profile" agent-browser close --session "$session" >/dev/null 2>&1 || true; rm -rf "$profile"; }
    trap close_browser EXIT INT TERM HUP
    HOME="$profile" agent-browser --version >/dev/null 2>&1 \
      || { echo 'FAIL gate4: agent-browser version check' >&2; exit 1; }
    HOME="$profile" agent-browser open about:blank --session "$session" >/dev/null 2>&1 \
      || { echo 'FAIL gate4: Chromium launch' >&2; exit 1; }
    close_browser; trap - EXIT INT TERM HUP
    snapshot_repo "$after"
    cmp -s "$before" "$after" || { echo 'FAIL gate4: browser preflight mutated AUDIT_ROOT content or index' >&2; exit 1; }
    rm -f "$before" "$after"
    ;;
  *) echo 'usage: implementation-gates.sh <gate1|classify-pr|browser-required|browser-preflight> ...' >&2; exit 64;;
esac
