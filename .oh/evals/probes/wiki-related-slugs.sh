#!/usr/bin/env bash
# tier: A
# source: wikiskill arXiv:2608.27454 — wiki lint related-slug check
# desc: every related: frontmatter slug in a tracked wiki entry resolves to an existing tracked entry, and /wiki lint declares the check
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
LINT="$ROOT/.oh/skills/wiki/references/lint.md"
CORPUS_REL=".oh/skills/wiki/corpus"

if [[ ! -f "$LINT" ]]; then
  echo "SKIPPED: wiki lint reference absent" >&2
  exit 2
fi

failures=()
for lit in '### 7a. Broken related-slug check' 'RELATED_BROKEN' 'Broken related-slug findings'; do
  grep -qF -- "$lit" "$LINT" || failures+=("lint.md missing contract text: $lit")
done
if ((${#failures[@]})); then
  printf 'REGRESSION: %s\n' "${failures[@]}" >&2
  exit 1
fi

declare -A KNOWN
entries=()
while IFS= read -r rel; do
  base="$(basename "$rel")"
  [[ "$base" == "README.md" ]] && continue
  [[ "$base" == "skill-impact.md" ]] && continue
  abs="$ROOT/$rel"
  [[ -f "$abs" ]] || continue
  slug="$(awk '/^---$/{f=!f; next} f{print}' "$abs" | grep '^slug:' | awk '{print $2}' | head -1 || true)"
  [[ -z "$slug" ]] && continue
  KNOWN["$slug"]=1
  entries+=("$rel")
done < <(git -C "$ROOT" ls-files -- "$CORPUS_REL/*.md" ":!:$CORPUS_REL/raw/*")

if ((${#entries[@]} == 0)); then
  echo "SKIPPED: no tracked corpus entries" >&2
  exit 2
fi

broken=(); seen_related=0
for rel in "${entries[@]}"; do
  fm="$(awk '/^---$/{f=!f; next} f{print}' "$ROOT/$rel")"
  line="$(grep '^related:' <<<"$fm" | head -1 || true)"
  [[ -z "$line" ]] && continue
  seen_related=1
  rel_slugs="$(sed 's/^related: *//; s/[][]//g; s/,/ /g' <<<"$line")"
  for r in $rel_slugs; do
    [[ -z "$r" ]] && continue
    [[ -n "${KNOWN[$r]:-}" ]] || broken+=("$rel -> related: $r (no such entry)")
  done
done

if (( seen_related == 0 )); then
  echo "SKIPPED: no tracked entry declares a related: field" >&2
  exit 2
fi
if ((${#broken[@]})); then
  printf 'REGRESSION: %s\n' "${broken[@]}" >&2
  exit 1
fi

echo "PASS: every related: slug in the tracked corpus resolves to an existing entry" >&2
exit 0
