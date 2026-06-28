#!/usr/bin/env bash
# tier: A
# source: issue #132 — wiki README index drift guard
# desc: .mifune/skills/wiki/corpus/README.md Index must match the git-tracked corpus/*.md frontmatter
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WIKI="$ROOT/.mifune/skills/wiki/corpus"
README="$WIKI/README.md"

if [[ ! -d "$WIKI" ]]; then
  echo "SKIPPED: wiki dir absent: $WIKI" >&2
  exit 2
fi

if [[ ! -f "$README" ]]; then
  echo "REGRESSION: .mifune/skills/wiki/corpus/README.md is missing" >&2
  exit 1
fi

expected_tmp="$(mktemp)"
actual_tmp="$(mktemp)"
rows_tmp="$(mktemp)"
trap 'rm -f "$expected_tmp" "$actual_tmp" "$rows_tmp"' EXIT

# Enumerate ONLY git-tracked entries (the whitelisted curated corpus), not a raw
# filesystem glob: corpus/* is gitignored-by-default, so a fresh CI clone carries
# only the whitelisted set the committed README is built from, and an operator's
# local-only scratch entry can never make this probe red. raw/ snapshots are
# excluded explicitly (they carry no slug: frontmatter anyway).
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
done < <(git -C "$ROOT" ls-files -- '.mifune/skills/wiki/corpus/*.md' ':!:.mifune/skills/wiki/corpus/raw/*')

sort -r "$rows_tmp" | cut -f2- > "$expected_tmp"

awk '
  /^\| --- \| --- \| --- \| --- \|$/ { in_index=1; next }
  in_index && /^\| / { print; next }
  in_index && !/^\| / { exit }
' "$README" > "$actual_tmp"

if ! diff_output="$(diff -u "$expected_tmp" "$actual_tmp")"; then
  echo "REGRESSION: .mifune/skills/wiki/corpus/README.md Index is out of sync with the tracked corpus/*.md frontmatter" >&2
  echo "$diff_output" >&2
  exit 1
fi

echo "PASS: .mifune/skills/wiki/corpus/README.md Index matches the git-tracked corpus/*.md frontmatter" >&2
exit 0
