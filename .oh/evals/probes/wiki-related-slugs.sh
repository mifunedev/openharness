#!/usr/bin/env bash
# tier: A
# source: wikiskill arXiv:2608.27454 — wiki lint link checks
# desc: every related: frontmatter slug and every [[slug]] body link in a tracked knowledge
#       entry resolves to an existing tracked entry, and /wiki lint declares both checks
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
LINT="$ROOT/.oh/skills/wiki/references/lint.md"
KNOWLEDGE_REL=".oh/knowledge"

if [[ ! -f "$LINT" ]]; then
  echo "SKIPPED: wiki lint reference absent" >&2
  exit 2
fi

failures=()
for lit in \
  '### 7. Check 4 — broken outbound' \
  '### 8. Check 5 — broken `related:` slugs' \
  'RELATED_BROKEN' \
  'BROKEN_LINKS' \
  'Broken related-slug findings' \
  'Broken outbound link findings'
do
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
  abs="$ROOT/$rel"
  [[ -f "$abs" ]] || continue
  slug="$(awk '/^---$/{f=!f; next} f{print}' "$abs" | grep '^slug:' | awk '{print $2}' | head -1 || true)"
  [[ -z "$slug" ]] && continue
  KNOWN["$slug"]=1
  entries+=("$rel")
done < <(git -C "$ROOT" ls-files -- \
           "$KNOWLEDGE_REL/source/*.md" \
           "$KNOWLEDGE_REL/patterns/*.md")

if ((${#entries[@]} == 0)); then
  echo "SKIPPED: no tracked knowledge entries" >&2
  exit 2
fi

broken=(); seen_related=0; seen_link=0
for rel in "${entries[@]}"; do
  fm="$(awk '/^---$/{f=!f; next} f{print}' "$ROOT/$rel")"
  line="$(grep '^related:' <<<"$fm" | head -1 || true)"
  if [[ -n "$line" ]]; then
    seen_related=1
    rel_slugs="$(sed 's/^related: *//; s/[][]//g; s/,/ /g' <<<"$line")"
    for r in $rel_slugs; do
      [[ -z "$r" ]] && continue
      [[ -n "${KNOWN[$r]:-}" ]] || broken+=("$rel -> related: $r (no such entry)")
    done
  fi

  # A [[slug]] inside a code span or fence is a MENTION (schema prose showing the
  # syntax), not a navigational link. Strip both before extracting.
  body="$(awk '/^---$/{n++; if(n==2){p=1; next}} p{print}' "$ROOT/$rel" \
          | awk '/^```/{f=!f; next} !f' \
          | sed 's/`[^`]*`//g')"
  while IFS= read -r link; do
    [[ -z "$link" ]] && continue
    seen_link=1
    [[ -n "${KNOWN[$link]:-}" ]] || broken+=("$rel -> [[$link]] (no such entry)")
  done < <(grep -oE '\[\[[a-z0-9-]+\]\]' <<<"$body" | sed 's/\[\[\(.*\)\]\]/\1/')
done

if (( seen_related == 0 && seen_link == 0 )); then
  echo "SKIPPED: no tracked entry declares a related: field or a [[slug]] link" >&2
  exit 2
fi
if ((${#broken[@]})); then
  printf 'REGRESSION: %s\n' "${broken[@]}" >&2
  exit 1
fi

echo "PASS: every related: slug and every [[slug]] body link in the tracked knowledge base resolves to an existing entry" >&2
exit 0
