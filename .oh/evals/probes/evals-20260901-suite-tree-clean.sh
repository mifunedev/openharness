#!/usr/bin/env bash
# tier: A
# source: retro lesson 2026-09-01 (issue #926) — a probe carrying `&>2` wrote a file named 2
#         into the repository root on every suite run, for hours, while the suite reported
#         all-green; it reached git through a merge commit
# desc: no probe writes into the repository — no `&>N` file redirect, no redirect targeting a
#       path under $ROOT — and no redirect residue is tracked at the repository root.
#       This is a STATIC guard plus a residue check, deliberately narrow: it cannot run the
#       suite to observe writes without recursing into itself, and a broad "any relative
#       redirect" scan is unusable noise (shell comparisons, prose arrows, and heredocs
#       written inside mktemp directories all match it).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PROBES="$ROOT/.oh/evals/probes"
SELF="$(basename "${BASH_SOURCE[0]}")"

[[ -d "$PROBES" ]] || { echo "SKIPPED: probe directory absent: $PROBES" >&2; exit 2; }

failures=()

# --- 1. `&>N` redirects to a FILE named N, not to descriptor N -------------
# The exact defect this lesson comes from. `>&N` duplicates a descriptor; `&>N`
# creates a file. Both are valid shell, one character apart, and the suite stays
# green either way because the probe's own exit status is unaffected.
while IFS= read -r hit; do
  [[ -n "$hit" ]] || continue
  file="${hit%%:*}"
  [[ "$(basename "$file")" == "$SELF" ]] && continue
  failures+=("$(basename "$file"): '&>N' redirects to a FILE named N, not to a descriptor — use '>&N'")
done < <(grep -rnE '&>[0-9]' "$PROBES" 2>/dev/null || true)

# --- 2. no redirect writes into the repository by path --------------------
# Anchored on $ROOT / $HARNESS rather than on "any relative path": the loose form
# also matches `(( n > CAP ))`, `a -> b` in prose, and heredocs a probe writes
# inside its own mktemp directory, which makes it noise rather than a check.
# $AUDIT_ROOT is deliberately NOT anchored: it is invocation-scoped by contract, and
# probes legitimately point it at a mktemp fixture they created.
while IFS= read -r hit; do
  [[ -n "$hit" ]] || continue
  file="${hit%%:*}"
  [[ "$(basename "$file")" == "$SELF" ]] && continue
  rest="${hit#*:}"; line="${rest#*:}"
  code="${line%%#*}"
  grep -qE '>>?[[:space:]]*"?\$\{?(ROOT|HARNESS)\b' <<<"$code" || continue
  failures+=("$(basename "$file"): redirect writes into the repository: ${code## }")
done < <(grep -rnE '>>?[[:space:]]*"?\$\{?(ROOT|HARNESS)' "$PROBES" 2>/dev/null || true)

# --- 3. no redirect residue tracked at the repository root ----------------
# The file that motivated this probe entered the tree in a merge commit and passed
# every gate. A tracked root entry named for a bare descriptor number is residue,
# never source.
while IFS= read -r rel; do
  [[ -n "$rel" ]] || continue
  case "$rel" in */*) continue ;; esac
  grep -qE '^([0-9]+|&[0-9]+)$' <<<"$rel" \
    && failures+=("$rel: tracked repository-root file is redirect residue, not source")
done < <(git -C "$ROOT" ls-files)

if ((${#failures[@]})); then
  printf 'REGRESSION: a probe writes into the repository, or redirect residue is tracked:\n' >&2
  printf '  - %s\n' "${failures[@]}" >&2
  exit 1
fi

echo "PASS: no probe redirects into the repository and no redirect residue is tracked at the root" >&2
exit 0
