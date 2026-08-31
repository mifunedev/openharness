#!/usr/bin/env bash
# tier: A
# source: wikiskill arXiv:2608.27454 — pattern pages are never rolled back
# desc: every kind: pattern entry tracked at the merge-base is still tracked at HEAD, and no pattern's sources: list has shrunk
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
CORPUS_REL=".oh/skills/wiki/corpus"

base=""
for cand in development main master; do
  if git -C "$ROOT" show-ref --verify --quiet "refs/heads/$cand"; then
    base="$(git -C "$ROOT" merge-base HEAD "$cand" 2>/dev/null || true)"
    [[ -n "$base" ]] && break
  fi
done
if [[ -z "$base" ]]; then
  echo "SKIPPED: no merge-base against development/main/master (shallow or detached checkout)" >&2
  exit 2
fi

base_patterns=()
while IFS= read -r rel; do
  [[ -n "$rel" ]] || continue
  [[ "$(basename "$rel")" == pattern-* ]] || continue
  base_patterns+=("$rel")
done < <(git -C "$ROOT" ls-tree -r --name-only "$base" -- "$CORPUS_REL" | grep '\.md$' || true)

if ((${#base_patterns[@]} == 0)); then
  echo "SKIPPED: no kind: pattern entries tracked at the merge-base — nothing to protect yet" >&2
  exit 2
fi


deleted=(); shrunk=()
for rel in "${base_patterns[@]}"; do
  if ! git -C "$ROOT" ls-files --error-unmatch "$rel" >/dev/null 2>&1; then
    deleted+=("$rel")
    continue
  fi
  before="$(git -C "$ROOT" show "$base:$rel" | awk '/^---$/{f=!f; next} f{print}' \
            | awk '/^sources:/{s=1; next} s && /^[a-z_-]+:/{s=0} s && /^[[:space:]]*- /{n++} END{print n+0}')"
  after="$(awk '/^---$/{f=!f; next} f{print}' "$ROOT/$rel" \
            | awk '/^sources:/{s=1; next} s && /^[a-z_-]+:/{s=0} s && /^[[:space:]]*- /{n++} END{print n+0}')"
  if (( after < before )); then
    shrunk+=("$rel ($before -> $after)")
  fi
done

if ((${#deleted[@]})); then
  printf 'REGRESSION: pattern page removed since the merge-base — see schema.md § 8, patterns are never rolled back: %s\n' "${deleted[@]}" >&2
  exit 1
fi
if ((${#shrunk[@]})); then
  printf 'REGRESSION: pattern sources: list shrank since the merge-base (provenance is append-only): %s\n' "${shrunk[@]}" >&2
  exit 1
fi

echo "PASS: every pattern page tracked at the merge-base survives at HEAD with its provenance intact" >&2
exit 0
