#!/usr/bin/env bash
# tier: A
# source: issue #132 — wiki README index drift guard
# desc: wiki/README.md Index must match the tracked wiki/*.md frontmatter corpus
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WIKI="$ROOT/wiki"
README="$WIKI/README.md"

if [[ ! -d "$WIKI" ]]; then
  echo "SKIPPED: wiki dir absent: $WIKI" >&2
  exit 2
fi

if [[ ! -f "$README" ]]; then
  echo "REGRESSION: wiki/README.md is missing" >&2
  exit 1
fi

expected_tmp="$(mktemp)"
actual_tmp="$(mktemp)"
rows_tmp="$(mktemp)"
trap 'rm -f "$expected_tmp" "$actual_tmp" "$rows_tmp"' EXIT

shopt -s nullglob
for entry in "$WIKI"/*.md; do
  [[ "$(basename "$entry")" == "README.md" ]] && continue
  frontmatter="$(awk '/^---$/{f=!f; next} f{print}' "$entry")"
  slug="$(grep '^slug:' <<<"$frontmatter" | awk '{print $2}' | head -1 || true)"
  [[ -z "$slug" ]] && continue
  title="$(grep '^title:' <<<"$frontmatter" | sed 's/^title: *//' | tr -d '"' | head -1 || true)"
  tags="$(grep '^tags:' <<<"$frontmatter" | sed 's/^tags: *//' | head -1 || true)"
  updated="$(grep '^updated:' <<<"$frontmatter" | awk '{print $2}' | head -1 || true)"
  printf '%s %s\t| %s | %s | %s | %s |\n' "${updated:-0000-00-00}" "$slug" "$slug" "$title" "$tags" "$updated" >> "$rows_tmp"
done

sort -r "$rows_tmp" | cut -f2- > "$expected_tmp"

awk '
  /^\| --- \| --- \| --- \| --- \|$/ { in_index=1; next }
  in_index && /^\| / { print; next }
  in_index && !/^\| / { exit }
' "$README" > "$actual_tmp"

if ! diff_output="$(diff -u "$expected_tmp" "$actual_tmp")"; then
  echo "REGRESSION: wiki/README.md Index is out of sync with wiki/*.md frontmatter" >&2
  echo "$diff_output" >&2
  exit 1
fi

echo "PASS: wiki/README.md Index matches wiki/*.md frontmatter" >&2
exit 0
