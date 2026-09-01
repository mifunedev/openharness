#!/usr/bin/env bash
# tier: A
# source: issue #926 — age is telemetry; a page is stale when a declared source moved
# desc: knowledge freshness is source-change and commit-aware, not age-based — every tracked
#       sources: entry resolves, and knowledge-impact.sh really marks a page needs-review when
#       a declared dependency changes after verified_at (exercised against a scratch repo)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SCRIPT="$ROOT/.oh/skills/wiki/scripts/knowledge-impact.sh"
SCHEMA="$ROOT/.oh/skills/wiki/references/schema.md"
LINT="$ROOT/.oh/skills/wiki/references/lint.md"

for f in "$SCRIPT" "$SCHEMA" "$LINT"; do
  [[ -f "$f" ]] || { echo "SKIPPED: required file absent: $f" >&2; exit 2; }
done

failures=()
unverifiable=0

# --- contract -------------------------------------------------------------
grep -qF '## 5. Freshness is a source-change fact, not an age' "$SCHEMA" \
  || failures+=("schema.md no longer declares source-change freshness")
grep -qF 'telemetry, not a validity test' "$SCHEMA" \
  || failures+=("schema.md no longer demotes age to telemetry")
grep -qF 'knowledge-impact.sh --verified' "$LINT" \
  || failures+=("lint.md's freshness check no longer calls the one implementation")
grep -qF 'Age does not decide validity' "$LINT" \
  || failures+=("lint.md no longer records that the age rule was retired as a validity test")

# --- every declared source must resolve in the form it declares -----------
resolve_sources() {
  local rel="$1" abs="$ROOT/$1" fm dep sha path
  fm="$(awk '/^---$/{f=!f; next} f{print}' "$abs")"
  while IFS= read -r dep; do
    [[ -n "$dep" ]] || continue
    case "$dep" in
      raw/*)
        [[ -f "$ROOT/.oh/knowledge/$dep" ]] \
          || failures+=("$rel: snapshot source does not resolve: $dep")
        ;;
      http://*|https://*)
        # A bare upstream reference is the weakest provenance form (schema.md § 4).
        # It cannot be resolved locally; it is accepted, not verified.
        ;;
      *@*)
        sha="${dep##*@}"; path="${dep%@*}"
        # A shallow clone (CI checks out depth 1) simply does not have the pinned
        # commit. That is a clone-depth fact, not a provenance defect, so the pin is
        # counted UNVERIFIABLE here rather than failed — the check still runs, and
        # still fails, for every pin whose commit IS present.
        if ! git -C "$ROOT" cat-file -e "${sha}^{commit}" 2>/dev/null; then
          unverifiable=$((unverifiable + 1))
          continue
        fi
        # A pin names a revision of the file's CONTENT. If the path has since moved,
        # look the basename up in that commit's tree rather than calling it broken.
        if ! git -C "$ROOT" cat-file -e "$sha:$path" 2>/dev/null; then
          # `git ... | grep -q` would SIGPIPE git and trip pipefail on a MATCH,
          # so capture the tree first and match against the captured text.
          tree="$(git -C "$ROOT" ls-tree -r --name-only "$sha" 2>/dev/null || true)"
          # A basename that matches more than one path proves nothing about WHICH
          # file the pin meant, so an ambiguous fallback is a failure, not a hit.
          hits="$(grep -cE "(^|/)$(basename "$path" | sed 's/[].[^$*\\]/\\&/g')\$" <<<"$tree" || true)"
          [[ "$hits" == "1" ]] \
            || failures+=("$rel: pinned source does not resolve at $sha (basename hits: $hits): $dep")
        fi
        ;;
      *)
        # shellcheck disable=SC2086 # deliberate glob expansion
        compgen -G "$ROOT/$dep" >/dev/null 2>&1 \
          || failures+=("$rel: repository source does not resolve: $dep")
        ;;
    esac
  done < <(awk '
    /^sources:/ {s=1; next}
    s && /^[[:space:]]*-[[:space:]]/ { sub(/^[[:space:]]*-[[:space:]]*/, ""); print; next }
    s { exit }
  ' <<<"$fm")
}

while IFS= read -r rel; do
  [[ -n "$rel" ]] || continue
  [[ "$(basename "$rel")" == "README.md" ]] && continue
  resolve_sources "$rel"
done < <(git -C "$ROOT" ls-files -- '.oh/knowledge/source/*.md' '.oh/knowledge/patterns/*.md')

# --- behavioral: drive the NEEDS-REVIEW branch, not just the PASS branch ---
# A probe whose failing branch has never been seen has an unverified oracle, so
# this builds a scratch repository where the answer is known in both directions.
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

(
  cd "$tmp"
  git init -q .
  git config user.email probe@example.com
  git config user.name probe
  mkdir -p .oh/knowledge/source src
  printf 'v1\n' > src/watched.txt
  printf 'v1\n' > src/ignored.txt
  git add -A && git commit -qm base
  BASE="$(git rev-parse HEAD)"

  cat > .oh/knowledge/source/watched.md <<PAGE
---
title: "Watched"
slug: watched
kind: repo
tags: [probe]
created: 2026-01-01
updated: 2026-01-01
sources:
  - src/watched.txt
verified_at: $BASE
confidence: provisional
---

# Watched

## Relevant Source Files
- \`src/watched.txt\` — the dependency under test

## Summary
Probe fixture.

## Detail
Probe fixture.

## See Also
PAGE
  git add -A && git commit -qm page
) >/dev/null 2>&1

before="$(bash "$SCRIPT" --root "$tmp" --format slugs || true)"
if [[ -n "$before" ]]; then
  failures+=("a page whose declared source has not changed was reported needs-review: $before")
fi

(
  cd "$tmp"
  printf 'v2\n' > src/watched.txt
  git add -A && git commit -qm "touch the declared dependency"
) >/dev/null 2>&1

after="$(bash "$SCRIPT" --root "$tmp" --format slugs || true)"
if [[ "$after" != "watched" ]]; then
  failures+=("changing a declared dependency did not mark the page needs-review (got: '${after:-none}')")
fi

# A page must not be invalidated by churn it never declared. Reset the watched
# dependency to its verified content and move an UNdeclared path instead.
(
  cd "$tmp"
  git checkout -q "$(git rev-list --max-parents=0 HEAD)" -- src/watched.txt
  printf 'v2\n' > src/ignored.txt
  git add -A && git commit -qm "restore the declared dependency; touch an undeclared path"
) >/dev/null 2>&1

undeclared="$(bash "$SCRIPT" --root "$tmp" --format slugs || true)"
if [[ -n "$undeclared" ]]; then
  failures+=("a change to an undeclared path invalidated a page: $undeclared")
fi

if ((${#failures[@]})); then
  printf 'REGRESSION: %s\n' "${failures[@]}" >&2
  exit 1
fi

echo "PASS: knowledge freshness is source-change aware, every resolvable declared source resolves (${unverifiable} pin(s) unverifiable in this clone depth), and both the needs-review and the not-affected branches were exercised against a scratch repository" >&2
exit 0
