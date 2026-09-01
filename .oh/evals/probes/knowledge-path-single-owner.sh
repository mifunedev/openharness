#!/usr/bin/env bash
# tier: A
# source: issue #926 — durable knowledge moved to .oh/knowledge/ with no compatibility alias
# desc: exactly one writable knowledge location survives the migration — nothing is tracked
#       under the retired corpus path, the directory does not exist, and no active tracked
#       surface still names it
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

# Assembled from fragments so this probe is not itself a hit for the pattern it
# enforces, and therefore needs no self-exemption in its own grep.
RETIRED=".oh/skills/wiki/""corpus"

failures=()

[[ -e "$RETIRED" ]] && failures+=("the retired corpus directory still exists on disk: $RETIRED")

tracked="$(git ls-files -- "$RETIRED" || true)"
[[ -n "$tracked" ]] && failures+=("files are still tracked under the retired corpus path: $(tr '\n' ' ' <<<"$tracked")")

# No active tracked surface may reference it. CHANGELOG.md, the preserved
# changelog rationale, and .oh/knowledge/raw/ are historical records, excluded
# here for the same reason .oh/evals/probes/audit-stale-references.sh excludes
# them — an immutable capture is never rewritten to match a later rename.
set +e
refs="$(git grep -n -F -- "$RETIRED" -- \
  ':!CHANGELOG.md' \
  ':!docs/rfcs/preserved-changelog-rationale.md' \
  ':!.oh/knowledge/raw/**' \
  ':!.oh/evals/RESULTS.md' \
  ":!${BASH_SOURCE[0]#"$ROOT"/}")"
rc=$?
set -e
[[ $rc -eq 0 || $rc -eq 1 ]] || failures+=("reference scan failed")
[[ -n "$refs" ]] && failures+=("active surface still references the retired corpus path: $(tr '\n' ' ' <<<"$refs")")

# The replacement surface must actually be there, and be the writable one.
for d in .oh/knowledge/source .oh/knowledge/patterns .oh/knowledge/raw .oh/knowledge/local; do
  [[ -d "$d" ]] || failures+=("knowledge surface missing: $d")
done
[[ -f .oh/knowledge/README.md ]] || failures+=("knowledge index missing: .oh/knowledge/README.md")

# .oh/knowledge/ must ship with the payload, or a consumer repo silently loses it.
grep -qF '"knowledge/**"' .oh/manifest.json \
  || failures+=(".oh/manifest.json does not ship knowledge/** — consumer repos would lose the surface")

# CI must react to knowledge changes on both event types.
push_paths="$(awk '/^  push:/{p=1} /^  pull_request:/{p=0} p' .github/workflows/ci-harness.yml)"
pr_paths="$(awk '/^  pull_request:/{p=1} /^concurrency:/{p=0} p' .github/workflows/ci-harness.yml)"
grep -qF '.oh/knowledge/**' <<<"$push_paths" \
  || failures+=("ci-harness.yml push paths do not include .oh/knowledge/**")
grep -qF '.oh/knowledge/**' <<<"$pr_paths" \
  || failures+=("ci-harness.yml pull_request paths do not include .oh/knowledge/**")

if ((${#failures[@]})); then
  printf 'REGRESSION: %s\n' "${failures[@]}" >&2
  exit 1
fi

echo "PASS: one writable knowledge surface at .oh/knowledge/ — the retired corpus path is gone from disk, from git, and from every active reference, and the new surface ships and gates in CI" >&2
exit 0
