#!/usr/bin/env bash
# tier: A
# source: issue #132 — knowledge README index drift guard
# desc: .oh/knowledge/README.md Index must match the tracked source/*.md and patterns/*.md frontmatter
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
WIKI="$ROOT/.oh/knowledge"
README="$WIKI/README.md"

if [[ ! -d "$WIKI" ]]; then
  echo "SKIPPED: knowledge surface absent: $WIKI" >&2
  exit 2
fi

if [[ ! -f "$README" ]]; then
  echo "REGRESSION: .oh/knowledge/README.md is missing" >&2
  exit 1
fi

expected_tmp="$(mktemp)"
actual_tmp="$(mktemp)"
rows_tmp="$(mktemp)"
trap 'rm -f "$expected_tmp" "$actual_tmp" "$rows_tmp"' EXIT

tracked_wiki_files() {
  git -C "$ROOT" ls-files -- \
    '.oh/knowledge/source/*.md' \
    '.oh/knowledge/patterns/*.md'
}

while IFS= read -r relpath; do
  entry="$ROOT/$relpath"
  [[ "$(basename "$entry")" == "README.md" ]] && continue
  [[ -f "$entry" ]] || continue
  frontmatter="$(awk '/^---$/{f=!f; next} f{print}' "$entry")"
  slug="$(grep '^slug:' <<<"$frontmatter" | awk '{print $2}' | head -1 || true)"
  [[ -z "$slug" ]] && continue
  title="$(grep '^title:' <<<"$frontmatter" | sed 's/^title: *//' | tr -d '"' | head -1 || true)"
  tags="$(grep '^tags:' <<<"$frontmatter" | sed 's/^tags: *//' | head -1 || true)"
  updated="$(grep '^updated:' <<<"$frontmatter" | awk '{print $2}' | head -1 || true)"
  printf '%s %s\t| %s | %s | %s | %s |\n' "${updated:-0000-00-00}" "$slug" "$slug" "$title" "$tags" "$updated" >> "$rows_tmp"
done < <(tracked_wiki_files)

sort -r "$rows_tmp" | cut -f2- > "$expected_tmp"

# Anchor on the ## Index heading first: the README preamble may legitimately
# contain other four-column tables, and the separator line alone is ambiguous.
awk '
  /^## Index$/ { at_index=1; next }
  at_index && /^\| --- \| --- \| --- \| --- \|$/ { in_index=1; next }
  in_index && /^\| / { print; next }
  in_index && !/^\| / { exit }
' "$README" > "$actual_tmp"

if ! diff_output="$(diff -u "$expected_tmp" "$actual_tmp")"; then
  echo "REGRESSION: .oh/knowledge/README.md Index is out of sync with the tracked entry frontmatter" >&2
  echo "$diff_output" >&2
  exit 1
fi

echo "PASS: .oh/knowledge/README.md Index matches the tracked source/ and patterns/ frontmatter" >&2
exit 0
