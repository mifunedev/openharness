#!/usr/bin/env bash
# tier: A
# source: retro lesson 2026-08-31 (prose-literal pinning) — two assertions failed on first run purely from source line wrapping
# desc: no probe pins a fixed-string literal long enough to straddle a hard wrap in the document it guards; the contract for pinning is documented
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PROBES="$ROOT/.oh/evals/probes"
README="$ROOT/.oh/evals/README.md"
MAX=72   # a pinned literal longer than this is likely to span a hard wrap

[[ -d "$PROBES" ]] || { echo "SKIPPED: probe dir absent" >&2; exit 2; }

failures=()
grep -qF -- '### Pinning contract text' "$README" \
  || failures+=("evals/README.md missing the '### Pinning contract text' contract")

# Flag long fixed-string literals passed to grep -F / -qF across the corpus.
while IFS= read -r hit; do
  [[ -n "$hit" ]] || continue
  file="${hit%%:*}"
  [[ "$(basename "$file")" == "$(basename "${BASH_SOURCE[0]}")" ]] && continue
  lit="$(sed -E "s/.*grep -[A-Za-z]*F[A-Za-z]* -- '([^']*)'.*/\1/" <<<"$hit")"
  [[ "$lit" == "$hit" ]] && continue
  (( ${#lit} > MAX )) && failures+=("$(basename "$file"): pinned literal is ${#lit} chars (>$MAX), likely to straddle a wrap: ${lit:0:48}...")
done < <(grep -rn "grep -[A-Za-z]*F[A-Za-z]* -- '" "$PROBES" 2>/dev/null || true)

# A probe must not write into the repository. `>&2` sends output to stderr; `&>2`
# is a valid but different construct that CREATES A FILE NAMED 2 in the working
# directory, so a probe carrying it silently commits scratch on every suite run.
while IFS= read -r hit; do
  [[ -n "$hit" ]] || continue
  file="${hit%%:*}"
  [[ "$(basename "$file")" == "$(basename "${BASH_SOURCE[0]}")" ]] && continue
  failures+=("$(basename "$file"): '&>N' redirects to a FILE named N, not to a descriptor — use '>&N'")
done < <(grep -rnE '&>[0-9]' "$PROBES" 2>/dev/null || true)

if ((${#failures[@]})); then
  printf 'REGRESSION: %s\n' "${failures[@]}" >&2
  exit 1
fi

echo "PASS: no probe pins an over-long fixed-string literal or redirects into a numbered file, and the pinning contract is documented" >&2
exit 0
