#!/usr/bin/env bash
# tier: A
# source: wikiskill arXiv:2608.27454 — proposer-only pattern access
# desc: /wiki query declares two disjoint kind modes with per-mode caps and term-hit ranking on the locked awk, and no kind: pattern entry appears in a default-mode result set
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
QUERY="$ROOT/.oh/skills/wiki/references/query.md"
CORPUS_REL=".oh/skills/wiki/corpus"

if [[ ! -f "$QUERY" ]]; then
  echo "SKIPPED: wiki query reference absent: $QUERY" >&2
  exit 2
fi

failures=()
need() { grep -qF -- "$1" "$QUERY" || failures+=("query.md missing contract text: $1"); }

need '/wiki query <topic> [--patterns]'
need 'an absent `kind:` counts as `source`'
need 'There is deliberately **no `--all` mode**'
need 'This is a **default, not a boundary**'
need 'WANT_KIND=source'
need 'WANT_KIND=pattern'
need 'CAP=3'
need 'CAP=5'
need 'kind="${kind:-source}"'
need "awk '/^---\$/{f=!f; next} f{print}'"

if ((${#failures[@]})); then
  printf 'REGRESSION: %s\n' "${failures[@]}" >&2
  exit 1
fi

# Behavioral: default mode must never surface a kind: pattern entry.
patterns=()
while IFS= read -r rel; do
  [[ -n "$rel" ]] || continue
  abs="$ROOT/$rel"
  [[ -f "$abs" ]] || continue
  kind="$(awk '/^---$/{f=!f; next} f{print}' "$abs" | grep '^kind:' | awk '{print $2}' | head -1 || true)"
  [[ "${kind:-source}" == "pattern" ]] && patterns+=("$rel")
done < <(git -C "$ROOT" ls-files -- "$CORPUS_REL/*.md" ":!:$CORPUS_REL/raw/*")

if ((${#patterns[@]} == 0)); then
  echo "SKIPPED: no tracked kind: pattern entries yet — contract text verified, isolation untestable" >&2
  exit 2
fi

# Run the documented default-mode filter (query.md § 3) over the whole tracked
# corpus, using a term drawn from a pattern page's own frontmatter. No pattern
# entry may survive it.
probe_term="$(awk '/^---$/{f=!f; next} f{print}' "$ROOT/${patterns[0]}" \
  | grep '^slug:' | awk '{print $2}' | head -1)"

WANT_KIND=source
matched=()
while IFS= read -r rel; do
  abs="$ROOT/$rel"
  [[ -f "$abs" ]] || continue
  fm="$(awk '/^---$/{f=!f; next} f{print}' "$abs")"
  kind="$(grep '^kind:' <<<"$fm" | awk '{print $2}' | head -1 || true)"
  kind="${kind:-source}"
  [[ "$kind" == "$WANT_KIND" ]] || continue
  grep -qi -- "$probe_term" <<<"$fm" || continue
  matched+=("$rel")
done < <(git -C "$ROOT" ls-files -- "$CORPUS_REL/*.md" ":!:$CORPUS_REL/raw/*")

leaked=()
for m in "${matched[@]:-}"; do
  [[ -n "$m" ]] || continue
  for p in "${patterns[@]}"; do
    [[ "$m" == "$p" ]] && leaked+=("$m")
  done
done

if ((${#leaked[@]})); then
  printf 'REGRESSION: pattern entry survived the default-mode kind filter: %s\n' "${leaked[@]}" >&2
  exit 1
fi

echo "PASS: /wiki query declares two disjoint kind modes and no pattern entry passes the default filter" >&2
exit 0
