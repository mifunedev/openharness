#!/usr/bin/env bash
set -euo pipefail
: "${AUDIT_ROOT:?AUDIT_ROOT is required}"
AUDIT_ROOT=$(cd "$AUDIT_ROOT" && pwd -P)
CCN_MAX=${CCN_MAX:-10}
ROUND_CAP=${ROUND_CAP:-3}
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
    browsers=${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}
    [[ -d $browsers ]] || {
      echo "FAIL gate4: no Playwright browser cache at $browsers; install one with: agent-browser install --with-deps" >&2
      exit 1
    }
    snapshot_repo(){
      local out=$1 path rel
      {
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
    runtime=$(mktemp -d "${TMPDIR:-/tmp}/oh-audit-xdg.XXXXXX")
    sock="$runtime/agent-browser/$session.sock"
    ((${#sock} < 108)) || {
      echo "FAIL gate4: daemon socket path is ${#sock} bytes, over the 107-byte unix limit: $sock" >&2
      rm -rf "$runtime"; exit 1
    }
    browser_env=(HOME="$profile" XDG_RUNTIME_DIR="$runtime" PLAYWRIGHT_BROWSERS_PATH="$browsers")
    close_browser(){ env "${browser_env[@]}" agent-browser close --session "$session" >/dev/null 2>&1 || true; rm -rf "$profile" "$runtime"; }
    trap close_browser EXIT INT TERM HUP
    env "${browser_env[@]}" agent-browser --version >/dev/null 2>&1 \
      || { echo 'FAIL gate4: agent-browser version check' >&2; exit 1; }
    env "${browser_env[@]}" agent-browser open about:blank --session "$session" >/dev/null 2>&1 \
      || { echo 'FAIL gate4: Chromium launch' >&2; exit 1; }
    close_browser; trap - EXIT INT TERM HUP
    snapshot_repo "$after"
    cmp -s "$before" "$after" || { echo 'FAIL gate4: browser preflight mutated AUDIT_ROOT content or index' >&2; exit 1; }
    rm -f "$before" "$after"
    ;;
  slop-metrics)
    base=${1:-development}
    [[ $base =~ ^[A-Za-z0-9._/-]+$ ]] || { echo 'usage: implementation-gates.sh slop-metrics <base-ref>' >&2; exit 64; }
    git -C "$AUDIT_ROOT" rev-parse --verify --quiet "$base^{commit}" >/dev/null \
      || { echo "FAIL gate5: unknown base ref: $base" >&2; exit 64; }
    counted(){ case $1 in *pnpm-lock.yaml|*package-lock.json|*.oh/evals/RESULTS.md) return 1;; esac; [[ ! -L $AUDIT_ROOT/$1 ]]; }
    added=0; removed=0
    while read -r a r path; do
      [[ $a == '-' ]] && continue
      counted "$path" || continue
      added=$((added + a)); removed=$((removed + r))
    done < <(git -C "$AUDIT_ROOT" diff --numstat "$base...HEAD")
    sh_delta=$(git -C "$AUDIT_ROOT" diff -U0 "$base...HEAD" -- '*.sh' | awk '
      /^\+\+\+/ || /^---/ { next }
      /^[+-]/ {
        sign = (substr($0,1,1)=="+") ? 1 : -1; line = " " substr($0,2) " "
        n = gsub(/&&|\|\|/, "", line)
        n += gsub(/[^[:alnum:]_](if|elif|while|until|for|case)[^[:alnum:]_]/, " ", line)
        total += sign * n
      }
      END { print total+0 }')
    mapfile -t ts < <(git -C "$AUDIT_ROOT" diff --name-only --diff-filter=d "$base...HEAD" -- '*.ts' '*.mjs' '*.js')
    tool=unavailable; over='[]'
    if ((${#ts[@]})); then
      if ver=$(uvx lizard --version 2>/dev/null); then
        tool="lizard $ver"
        warnings=$(cd "$AUDIT_ROOT" && uvx lizard -w --CCN "$CCN_MAX" "${ts[@]}" 2>/dev/null || true)
        over=$(sed -nE 's/^(.+): warning: (\S+) has [0-9]+ NLOC, ([0-9]+) CCN.*/\1 \2 CCN \3/p' <<<"$warnings" | jq -R . | jq -s .)
      fi
    else
      tool='lizard n/a (no analysable files changed)'
    fi
    jq -n --argjson netAdded "$added" --argjson netRemoved "$removed" \
      --argjson shBranchPoints "$sh_delta" \
      --argjson tsOverCcn "$over" --arg tool "$tool" --argjson ccnMax "$CCN_MAX" \
      '{netAdded:$netAdded,netRemoved:$netRemoved,shBranchPoints:$shBranchPoints,ccnMax:$ccnMax,tsOverCcn:$tsOverCcn,tool:$tool}'
    ;;
  simplicity-round)
    slug=${1:-}; [[ $slug =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || { echo 'FAIL gate5: invalid slug' >&2; exit 64; }
    task_dir="$AUDIT_ROOT/.oh/tasks/$slug"; counter="$task_dir/simplify-rounds.json"
    resolved_task=$(realpath -e -- "$task_dir" 2>/dev/null) \
      || { echo "FAIL gate5: missing task directory: $task_dir" >&2; exit 1; }
    [[ $resolved_task == "$task_dir" && ! -L $task_dir ]] \
      || { echo "FAIL gate5: task directory is symlinked: $task_dir" >&2; exit 1; }
    rounds=0; prev=none
    if [[ -f $counter && ! -L $counter ]]; then
      jq -e '(.rounds|type)=="number"' "$counter" >/dev/null \
        || { echo "FAIL gate5: malformed counter: $counter" >&2; exit 1; }
      rounds=$(jq -r '.rounds' "$counter"); prev=$(jq -r '.netAdded // "none"' "$counter")
    fi
    escalate=false; (( rounds >= ROUND_CAP )) && escalate=true
    printf 'rounds=%s cap=%s escalate=%s prevNetAdded=%s\n' "$rounds" "$ROUND_CAP" "$escalate" "$prev"
    ;;
  *) echo 'usage: implementation-gates.sh <gate1|classify-pr|browser-required|browser-preflight|slop-metrics|simplicity-round> ...' >&2; exit 64;;
esac
