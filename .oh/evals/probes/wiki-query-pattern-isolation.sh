#!/usr/bin/env bash
# tier: A
# source: wikiskill arXiv:2608.27454 — proposer-only pattern access
# desc: /wiki query declares two disjoint directory-scoped modes with per-mode caps and
#       term-hit ranking on the locked awk, and no kind: pattern entry can appear in a
#       default-mode result set
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
QUERY="$ROOT/.oh/skills/wiki/references/query.md"
KNOWLEDGE_REL=".oh/knowledge"

if [[ ! -f "$QUERY" ]]; then
  echo "SKIPPED: wiki query reference absent: $QUERY" >&2
  exit 2
fi

failures=()
need() { grep -qF -- "$1" "$QUERY" || failures+=("query.md missing contract text: $1"); }

need '/wiki query <topic> [--patterns]'
need 'There is deliberately **no `--all` mode**'
need 'This is a **default, not a boundary**'
need 'DIR="$KNOWLEDGE/source"'
need 'DIR="$KNOWLEDGE/patterns"'
need 'CAP=3'
need 'CAP=5'
need "awk '/^---\$/{f=!f; next} f{print}'"

if ((${#failures[@]})); then
  printf 'REGRESSION: %s\n' "${failures[@]}" >&2
  exit 1
fi

# Behavioral: the directory IS the mode, so default mode enumerates source/ only.
# A kind: pattern page tracked under source/ would leak into every default result.
patterns=()
leaked=()
while IFS= read -r rel; do
  [[ -n "$rel" ]] || continue
  abs="$ROOT/$rel"
  [[ -f "$abs" ]] || continue
  kind="$(awk '/^---$/{f=!f; next} f{print}' "$abs" | grep '^kind:' | awk '{print $2}' | head -1 || true)"
  case "$rel" in
    "$KNOWLEDGE_REL"/patterns/*)
      [[ "$kind" == "pattern" ]] && patterns+=("$rel")
      ;;
    "$KNOWLEDGE_REL"/source/*)
      [[ "$kind" == "pattern" ]] && leaked+=("$rel")
      ;;
  esac
done < <(git -C "$ROOT" ls-files -- \
           "$KNOWLEDGE_REL/source/*.md" \
           "$KNOWLEDGE_REL/patterns/*.md")

if ((${#leaked[@]})); then
  printf 'REGRESSION: kind: pattern entry tracked in source/, where default-mode query reads it: %s\n' "${leaked[@]}" >&2
  exit 1
fi

if ((${#patterns[@]} == 0)); then
  echo "SKIPPED: no tracked kind: pattern entries yet — contract text verified, split untestable" >&2
  exit 2
fi

# Run the documented default-mode enumeration (query.md § 2) with a term drawn from
# a pattern page's own frontmatter. No pattern page may survive it.
probe_term="$(awk '/^---$/{f=!f; next} f{print}' "$ROOT/${patterns[0]}" \
  | grep '^slug:' | awk '{print $2}' | head -1)"

matched=()
for entry in "$ROOT/$KNOWLEDGE_REL"/source/*.md; do
  [[ -f "$entry" ]] || continue
  [[ "$(basename "$entry")" == "README.md" ]] && continue
  fm="$(awk '/^---$/{f=!f; next} f{print}' "$entry")"
  grep -qi -- "$probe_term" <<<"$fm" || continue
  matched+=("${entry#"$ROOT"/}")
done

for m in "${matched[@]:-}"; do
  [[ -n "$m" ]] || continue
  for p in "${patterns[@]}"; do
    [[ "$m" == "$p" ]] && leaked+=("$m")
  done
done

if ((${#leaked[@]})); then
  printf 'REGRESSION: pattern entry survived the default-mode enumeration: %s\n' "${leaked[@]}" >&2
  exit 1
fi

echo "PASS: /wiki query declares two disjoint directory-scoped modes and no pattern entry can reach a default-mode result set" >&2
exit 0
