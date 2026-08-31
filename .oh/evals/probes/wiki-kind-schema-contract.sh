#!/usr/bin/env bash
# tier: A
# source: wikiskill arXiv:2608.27454 — pattern layer added to the wiki corpus
# desc: the wiki schema declares kind: source|pattern with an absent-means-source default, the pattern merge amendment, and the persistence invariant; every tracked entry obeys the kind/filename/placement rules
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SCHEMA="$ROOT/.oh/skills/wiki/references/schema.md"
CORPUS_REL=".oh/skills/wiki/corpus"

if [[ ! -f "$SCHEMA" ]]; then
  echo "SKIPPED: wiki schema absent: $SCHEMA" >&2
  exit 2
fi

failures=()

need() {
  grep -qF -- "$1" "$SCHEMA" || failures+=("schema.md missing contract text: $1")
}

need '| `kind` | enum | no |'
need 'An absent `kind:` field means `kind: source`.'
need 'Consumers that filter on `kind` MUST apply the'
need 'Pattern placement.'
need 'a pattern in a subdirectory would be invisible to both'
need '## 7a. Pattern amendment to the body-merge strategy'
need 'is **append-only**'
need '## 8. Pattern persistence invariant'
need 'is never rolled back'
need 'Reverting a `corpus/` path as collateral of a skill revert is forbidden.'

# Structural checks over tracked corpus entries.
while IFS= read -r rel; do
  base="$(basename "$rel")"
  [[ "$base" == "README.md" ]] && continue
  [[ "$base" == "skill-impact.md" ]] && continue
  abs="$ROOT/$rel"
  [[ -f "$abs" ]] || continue

  fm="$(awk '/^---$/{f=!f; next} f{print}' "$abs")"
  slug="$(grep '^slug:' <<<"$fm" | awk '{print $2}' | head -1 || true)"
  [[ -z "$slug" ]] && continue
  kind="$(grep '^kind:' <<<"$fm" | awk '{print $2}' | head -1 || true)"
  kind="${kind:-source}"

  case "$kind" in
    source|pattern) ;;
    *) failures+=("$rel: kind must be source or pattern, got '$kind'");;
  esac

  if [[ "$base" == pattern-* && "$kind" != "pattern" ]]; then
    failures+=("$rel: filename says pattern but kind is '$kind'")
  fi
  if [[ "$kind" == "pattern" && "$base" != pattern-* ]]; then
    failures+=("$rel: kind is pattern but filename lacks the pattern- prefix")
  fi
  if [[ "$kind" == "pattern" ]]; then
    grep -q '^## Relevant Source Files$' "$abs" \
      || failures+=("$rel: kind: pattern requires a '## Relevant Source Files' section")
    grep -q '^sources:' <<<"$fm" \
      || failures+=("$rel: kind: pattern requires at least one sources: entry")
  fi
done < <(git -C "$ROOT" ls-files -- "$CORPUS_REL/*.md" ":!:$CORPUS_REL/raw/*")

# Placement: no tracked entry may live in a corpus subdirectory other than raw/.
while IFS= read -r rel; do
  [[ -n "$rel" ]] || continue
  failures+=("$rel: corpus entries are flat; only raw/ may be a subdirectory")
done < <(git -C "$ROOT" ls-files -- "$CORPUS_REL/*/*" ":!:$CORPUS_REL/raw/*")

if ((${#failures[@]})); then
  printf 'REGRESSION: %s\n' "${failures[@]}" >&2
  exit 1
fi

echo "PASS: wiki kind schema declared and every tracked corpus entry obeys the kind, filename, and placement rules" >&2
exit 0
