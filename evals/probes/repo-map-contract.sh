#!/usr/bin/env bash
# tier: A
# source: issue #464 — repo map must optimize orientation without adding a tree dependency or unmeasured performance claims
# desc: guards context/REPO_MAP.md as a tracked-source orientation contract: startup-loaded, repo-root anchored git ls-files command, no tree dependency, skip/search guidance, context-file precedence, source-map/helper smoke checks, size budget, and explicit A/B benchmark path
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REPO_MAP="$ROOT/context/REPO_MAP.md"
AGENTS="$ROOT/AGENTS.md"
CONTEXT_README="$ROOT/context/README.md"
MANIFEST="$ROOT/evals/capability/repo-orientation/tasks.json"
SCORER="$ROOT/scripts/repo-orientation-benchmark-score.mjs"
MAX_BYTES=12288

fails=()

[[ -f "$REPO_MAP" ]] || fails+=("context/REPO_MAP.md exists")
[[ -f "$AGENTS" ]] || fails+=("AGENTS.md exists")
[[ -f "$CONTEXT_README" ]] || fails+=("context/README.md exists")
[[ -f "$MANIFEST" ]] || fails+=("repo-orientation benchmark manifest exists")
[[ -x "$SCORER" ]] || fails+=("repo-orientation benchmark scorer exists and is executable")

if [[ -f "$AGENTS" ]]; then
  grep -Fq 'context/REPO_MAP.md' "$AGENTS" || fails+=("AGENTS.md startup reads include context/REPO_MAP.md")
fi

if [[ -f "$CONTEXT_README" ]]; then
  grep -Fq 'REPO_MAP.md' "$CONTEXT_README" || fails+=("context/README.md lists REPO_MAP.md")
fi

if [[ -f "$REPO_MAP" ]]; then
  bytes=$(wc -c <"$REPO_MAP" | tr -d ' ')
  if (( bytes > MAX_BYTES )); then
    fails+=("context/REPO_MAP.md is ${bytes} bytes, above ${MAX_BYTES}-byte startup budget")
  fi

  grep -Fq 'repo=$(git rev-parse --show-toplevel)' "$REPO_MAP" || fails+=("source-map command anchors at repo root")
  grep -Fq 'git -C "$repo" ls-files' "$REPO_MAP" || fails+=("source-map command uses git -C repo ls-files")
  grep -Fq 'do not paste a raw filesystem tree into context' "$REPO_MAP" || fails+=("session-start rule rejects raw filesystem tree")
  grep -Fq 'When a routed directory has `README.md`, read that first.' "$REPO_MAP" || fails+=("README-first routing is documented")
  grep -Fq 'AGENTS.md` is canonical; `CLAUDE.md` is a provider-compatibility alias' "$REPO_MAP" || fails+=("AGENTS canonical / CLAUDE alias rule documented")
  grep -Fq 'target=${1:-.}' "$REPO_MAP" || fails+=("ancestor helper supports an explicit target")
  grep -Fq 'while [ ! -d "$dir" ] && [ "$dir" != "/" ]' "$REPO_MAP" || fails+=("ancestor helper handles non-existent target paths")
  grep -Fq 'Performance caveat and acceptance metric' "$REPO_MAP" || fails+=("performance caveat section present")
  grep -Fq 'structural optimization, not benchmark proof by itself' "$REPO_MAP" || fails+=("performance caveat avoids unproven savings claim")
  grep -Fq 'compare at least 5 common orientation tasks with and without this file loaded' "$REPO_MAP" || fails+=("acceptance metric requires A/B orientation tasks")
  grep -Fq 'total input tokens' "$REPO_MAP" || fails+=("acceptance metric tracks total input tokens")
  grep -Fq 'tool calls before the first relevant file' "$REPO_MAP" || fails+=("acceptance metric tracks tool-call cost")
  grep -Fq 'accidental reads under disregard paths' "$REPO_MAP" || fails+=("acceptance metric tracks poison-path reads")
  grep -Fq 'median time/tool calls drop' "$REPO_MAP" || fails+=("acceptance metric gates on median time/tool-call improvement")

  for path in \
    'node_modules/' \
    '.pi/npm/node_modules/' \
    'packages/docs/build/' \
    'packages/oh/dist/' \
    '.mifune/skills/wiki/corpus/raw/' \
    'memory/*/log.md' \
    'tasks/*/progress.txt' \
    'evals/datasets/**/oracle/'; do
    grep -Fq "$path" "$REPO_MAP" || fails+=("skip/disregard path documented: $path")
  done

  if grep -Eiq '(^|[^[:alnum:]_/-])tree([[:space:]]|$)' "$REPO_MAP"; then
    # The only allowed reference is the prose warning against raw filesystem tree.
    allowed=$(grep -Fi 'do not paste a raw filesystem tree into context' "$REPO_MAP" | wc -l | tr -d ' ')
    total=$(grep -Eio '(^|[^[:alnum:]_/-])tree([[:space:]]|$)' "$REPO_MAP" | wc -l | tr -d ' ')
    if [[ "$total" != "$allowed" ]]; then
      fails+=("REPO_MAP.md must not introduce a tree command/dependency")
    fi
  fi

  source_map="$({
    cd "$ROOT/context"
    repo=$(git rev-parse --show-toplevel)
    git -C "$repo" ls-files -- \
      ':!:tasks/*/progress.txt' \
      ':!:.mifune/skills/wiki/corpus/raw/*' \
      ':!:evals/datasets/**/oracle/**' \
      ':!:evals/datasets/**/diff.patch' \
      ':!:evals/datasets/**/changed-files.txt'
  })"
  for required in \
    'AGENTS.md' \
    '.github/workflows/ci-harness.yml' \
    'context/REPO_MAP.md' \
    'evals/probes/repo-map-contract.sh'; do
    grep -Fxq "$required" <<<"$source_map" || fails+=("source-map smoke missing tracked root file: $required")
  done
  for forbidden_re in \
    '(^|/)node_modules/' \
    '^\.mifune/skills/wiki/corpus/raw/' \
    '^tasks/.*/progress\.txt$' \
    '^evals/datasets/.*/oracle/' \
    '^evals/datasets/.*/diff\.patch$' \
    '^evals/datasets/.*/changed-files\.txt$'; do
    if grep -Eq "$forbidden_re" <<<"$source_map"; then
      fails+=("source-map smoke included forbidden pattern: $forbidden_re")
    fi
  done

  helper=$(awk '
    found && /^```$/ { exit }
    found { print }
    /^Repo-local ancestor check helper:/ { want=1; next }
    want && /^```bash$/ { found=1 }
  ' "$REPO_MAP")
  if [[ -z "$helper" ]]; then
    fails+=("could not extract ancestor helper from REPO_MAP.md")
  else
    run_helper() {
      local target="$1"
      (cd "$ROOT" && bash -c "$helper" _ "$target")
    }
    root_out=$(run_helper ".") || fails+=("ancestor helper failed for repo root")
    grep -Fxq 'AGENTS.md' <<<"${root_out:-}" || fails+=("ancestor helper for . did not return AGENTS.md")

    new_path_out=$(run_helper "workspace/new-dir/new-file.md") || fails+=("ancestor helper failed for new workspace path")
    grep -Fxq 'workspace/AGENTS.md' <<<"${new_path_out:-}" || fails+=("ancestor helper for new workspace path missing workspace/AGENTS.md")
    grep -Fxq 'AGENTS.md' <<<"${new_path_out:-}" || fails+=("ancestor helper for new workspace path missing root AGENTS.md")
    if grep -Fxq 'workspace/CLAUDE.md' <<<"${new_path_out:-}"; then
      fails+=("ancestor helper did not de-dupe workspace/CLAUDE.md symlink")
    fi

    absolute_out=$(run_helper "$ROOT") || fails+=("ancestor helper failed for absolute repo root")
    grep -Fxq 'AGENTS.md' <<<"${absolute_out:-}" || fails+=("ancestor helper for absolute repo root did not return AGENTS.md")
  fi
fi

if [[ -f "$SCORER" && -f "$MANIFEST" ]]; then
  node "$SCORER" --manifest "$MANIFEST" --validate-only >/dev/null \
    || fails+=("repo-orientation benchmark manifest/scorer validate-only failed")
fi

if (( ${#fails[@]} > 0 )); then
  echo "REGRESSION: repo-map contract broken:" >&2
  printf '  - %s\n' "${fails[@]}" >&2
  exit 1
fi

echo "PASS: repo map contract is startup-loaded, git-ls-files based, context-aware, skip-guided, smoke-tested, size-bounded, and tied to an A/B benchmark" >&2
exit 0
