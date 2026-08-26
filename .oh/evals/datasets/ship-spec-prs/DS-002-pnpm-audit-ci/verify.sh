#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MANIFEST="$HERE/manifest.json"
fail() { echo "verify: $*" >&2; exit 1; }

command -v jq >/dev/null 2>&1 || fail "jq not on PATH"
[ -f "$MANIFEST" ] || fail "manifest.json missing in $HERE"
[ -f "$HERE/prompt.md" ] || fail "prompt.md missing in $HERE"

jq -e '.id and .slug and .dataset and .title
       and (.source | type == "object") and (.reward_kind | type == "array")
       and (.oracle | type == "object")' "$MANIFEST" >/dev/null 2>&1 \
  || fail "manifest.json missing required fields"

id="$(jq -r '.id' "$MANIFEST")"
case "$id" in
  DS-[0-9]*) : ;;
  *) fail "id '$id' is not DS-<n>" ;;
esac

while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  [ -f "$HERE/$rel" ] || fail "oracle file referenced but missing: $rel"
done < <(jq -r '.oracle | to_entries[] | .value | select(type == "string")' "$MANIFEST")

oracle_changed_files() {
  local cf
  cf="$(jq -r '.oracle.changed_files // empty' "$MANIFEST")"
  if [ -n "$cf" ] && [ -f "$HERE/$cf" ]; then
    sort -u "$HERE/$cf"
  elif [ -f "$HERE/oracle/diff.patch" ]; then
    grep -E '^\+\+\+ b/' "$HERE/oracle/diff.patch" | sed 's#^+++ b/##' | sort -u
  fi
}

if [ "$#" -eq 0 ]; then
  oracle_changed_files >/dev/null || true
  echo "ok: $id self-check passed ($HERE)" >&2
  exit 0
fi

cand="$1"
[ -f "$cand" ] || fail "candidate diff not found: $cand"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
oracle_changed_files >"$tmp/oracle"
if grep -qE '^\+\+\+ b/' "$cand"; then
  grep -E '^\+\+\+ b/' "$cand" | sed 's#^+++ b/##' | sort -u >"$tmp/cand"
else
  sort -u "$cand" >"$tmp/cand"
fi
total="$(wc -l <"$tmp/oracle" | tr -d ' ')"
hits="$(comm -12 "$tmp/oracle" "$tmp/cand" | wc -l | tr -d ' ')"
if [ "${total:-0}" -eq 0 ]; then
  echo "score=0.0"
else
  awk -v h="$hits" -v t="$total" 'BEGIN { printf "score=%.4f\n", h / t }'
fi
exit 0
