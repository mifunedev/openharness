#!/usr/bin/env bash
# tier: A
# source: wikiskill arXiv:2608.27454 (pattern layer); issue #926 (repo|external|pattern kinds)
# desc: the knowledge schema declares kind repo|external|pattern with sources: as the single
#       dependency declaration and verified_at: as the freshness pin; every tracked entry obeys
#       the kind, directory, filename, and required-section rules
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SCHEMA="$ROOT/.oh/skills/wiki/references/schema.md"
KNOWLEDGE_REL=".oh/knowledge"

if [[ ! -f "$SCHEMA" ]]; then
  echo "SKIPPED: knowledge schema absent: $SCHEMA" >&2
  exit 2
fi

failures=()

# Short, wrap-safe fragments only: headings, table cells, and code tokens cannot
# straddle a hard-wrap boundary the way a pinned sentence can.
need() {
  grep -qF -- "$1" "$SCHEMA" || failures+=("schema.md missing contract text: $1")
}

need '| `kind` | enum | yes |'
need 'Must agree with the directory'
need '| `verified_at` | commit sha | `kind: repo` only |'
need '## 4. `sources:` is the dependency declaration'
need '## 5. Freshness is a source-change fact, not an age'
need 'never snapshots this repository'
need '| Bare upstream reference |'
need '### 11a. Pattern amendment'
need 'is **append-only**'
need '## 12. Pattern persistence invariant'
need 'is never rolled back'
need 'as collateral of a skill revert is'

# Structural checks over tracked entries.
entries=()
while IFS= read -r rel; do
  [[ -n "$rel" ]] || continue
  entries+=("$rel")
done < <(git -C "$ROOT" ls-files -- \
           "$KNOWLEDGE_REL/source/*.md" \
           "$KNOWLEDGE_REL/patterns/*.md")

if ((${#entries[@]} == 0)); then
  echo "SKIPPED: no tracked knowledge entries" >&2
  exit 2
fi

for rel in "${entries[@]}"; do
  base="$(basename "$rel")"
  [[ "$base" == "README.md" ]] && continue
  abs="$ROOT/$rel"
  [[ -f "$abs" ]] || continue

  fm="$(awk '/^---$/{f=!f; next} f{print}' "$abs")"
  slug="$(grep '^slug:' <<<"$fm" | awk '{print $2}' | head -1 || true)"
  if [[ -z "$slug" ]]; then
    failures+=("$rel: no slug: in frontmatter")
    continue
  fi
  [[ "$slug" == "${base%.md}" ]] || failures+=("$rel: slug '$slug' does not match the filename")

  kind="$(grep '^kind:' <<<"$fm" | awk '{print $2}' | head -1 || true)"
  case "$kind" in
    repo|external|pattern) ;;
    "") failures+=("$rel: kind: is required (repo, external, or pattern)"); continue ;;
    *) failures+=("$rel: kind must be repo, external, or pattern, got '$kind'"); continue ;;
  esac

  # The directory IS the kind boundary; frontmatter must agree with it.
  case "$rel" in
    "$KNOWLEDGE_REL"/patterns/*)
      [[ "$kind" == "pattern" ]] \
        || failures+=("$rel: lives in patterns/ but kind is '$kind'")
      [[ "$base" == pattern-* ]] \
        || failures+=("$rel: a patterns/ filename must carry the pattern- prefix")
      ;;
    "$KNOWLEDGE_REL"/source/*)
      [[ "$kind" == "repo" || "$kind" == "external" ]] \
        || failures+=("$rel: lives in source/ but kind is '$kind'")
      [[ "$base" == pattern-* ]] \
        && failures+=("$rel: a source/ filename must not carry the pattern- prefix")
      ;;
  esac

  grep -q '^sources:' <<<"$fm" || failures+=("$rel: sources: is required")

  if [[ "$kind" == "repo" || "$kind" == "pattern" ]]; then
    grep -q '^## Relevant Source Files$' "$abs" \
      || failures+=("$rel: kind: $kind requires a '## Relevant Source Files' section")
  fi

  if [[ "$kind" == "repo" ]]; then
    grep -q '^verified_at:' <<<"$fm" \
      || failures+=("$rel: kind: repo requires verified_at: (the freshness pin)")
  fi

  if [[ "$kind" == "external" ]]; then
    grep -qE '^[[:space:]]*-[[:space:]]+(raw/|https?://)' <<<"$fm" \
      || failures+=("$rel: kind: external requires a raw/ snapshot or a bare upstream URL in sources:")
  fi
done

# Placement: nothing tracked under .oh/knowledge/ outside the three real directories.
while IFS= read -r rel; do
  [[ -n "$rel" ]] || continue
  case "$rel" in
    "$KNOWLEDGE_REL"/README.md) ;;
    "$KNOWLEDGE_REL"/source/*.md|"$KNOWLEDGE_REL"/patterns/*.md) ;;
    "$KNOWLEDGE_REL"/raw/*|"$KNOWLEDGE_REL"/local/README.md) ;;
    *) failures+=("$rel: unexpected tracked path under the knowledge surface") ;;
  esac
done < <(git -C "$ROOT" ls-files -- "$KNOWLEDGE_REL")

if ((${#failures[@]})); then
  printf 'REGRESSION: %s\n' "${failures[@]}" >&2
  exit 1
fi

echo "PASS: the knowledge schema declares repo/external/pattern kinds with verified_at freshness, and every tracked entry obeys the kind, directory, filename, and section rules" >&2
exit 0
