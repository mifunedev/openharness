#!/usr/bin/env bash
# =============================================================================
# refresh-checksums.sh — recompute skill checksums and update registry.json
# =============================================================================
#
# V0 manual workflow: run this script whenever a skill file changes.
# It walks skills/*/, computes each folder's checksum using the algorithm
# documented in docs/checksum.md, and writes the result back into
# registry.json in-place.
#
# Usage (from repo root):
#   ./scripts/refresh-checksums.sh
#
# After running, commit the updated registry.json:
#   git add registry.json
#   git commit -m "task: refresh checksums"
#
# In V1, scripts/publish-registry.sh will subsume this workflow and run
# automatically in CI (registry.yml). This script remains for local use.
#
# =============================================================================

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKILLS_DIR="$REPO_ROOT/skills"
REGISTRY="$REPO_ROOT/registry.json"

# ---------------------------------------------------------------------------
# Shared checksum function (must match validate.sh exactly — DRY)
# ---------------------------------------------------------------------------
compute_checksum() {
  local skill_name="$1"
  # Run from REPO_ROOT so paths in sha256sum output are stable
  (cd "$REPO_ROOT" && find "skills/$skill_name" -type f -not -path '*/.*' \
    | LC_ALL=C sort | xargs sha256sum | sha256sum | cut -d' ' -f1)
}

# ---------------------------------------------------------------------------
# Require jq
# ---------------------------------------------------------------------------
if ! command -v jq &>/dev/null; then
  echo "ERR: jq is required. Install with: apt-get install jq  OR  brew install jq" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Verify registry.json is valid JSON before touching it
# ---------------------------------------------------------------------------
if ! jq empty "$REGISTRY" 2>/dev/null; then
  echo "ERR: $REGISTRY is not valid JSON — fix it before running this script" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Collect skill directories
# ---------------------------------------------------------------------------
mapfile -t SKILL_DIRS < <(find "$SKILLS_DIR" -mindepth 1 -maxdepth 1 -type d | LC_ALL=C sort)

if [ "${#SKILL_DIRS[@]}" -eq 0 ]; then
  echo "ERR: No skill directories found under $SKILLS_DIR" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Recompute and write checksums
# ---------------------------------------------------------------------------
UPDATED=0
MISSING=0

# Work on a temp file to make the update atomic
TMP_REGISTRY="$(mktemp)"
cp "$REGISTRY" "$TMP_REGISTRY"
trap 'rm -f "$TMP_REGISTRY"' EXIT

for skill_dir in "${SKILL_DIRS[@]}"; do
  skill_name="$(basename "$skill_dir")"

  # Skip if not in registry (validate.sh will catch that separately)
  if ! jq -e --arg n "$skill_name" '.skills[] | select(.name == $n)' "$REGISTRY" &>/dev/null; then
    echo "SKIP $skill_name — not in registry.json (add entry manually, then rerun)"
    ((MISSING++)) || true
    continue
  fi

  computed_hash="$(compute_checksum "$skill_name")"
  new_checksum="sha256:$computed_hash"
  old_checksum="$(jq -r --arg n "$skill_name" '.skills[] | select(.name == $n) | .checksum' "$REGISTRY")"

  if [ "$new_checksum" = "$old_checksum" ]; then
    echo "OK  $skill_name — checksum unchanged ($new_checksum)"
  else
    echo "UPD $skill_name — $old_checksum -> $new_checksum"
    # Update the checksum in the temp file in-place using jq
    jq --arg n "$skill_name" --arg c "$new_checksum" \
      '(.skills[] | select(.name == $n) | .checksum) |= $c' \
      "$TMP_REGISTRY" > "${TMP_REGISTRY}.new" && mv "${TMP_REGISTRY}.new" "$TMP_REGISTRY"
    ((UPDATED++)) || true
  fi
done

# ---------------------------------------------------------------------------
# Commit the temp file back if anything changed
# ---------------------------------------------------------------------------
if [ "$UPDATED" -gt 0 ]; then
  cp "$TMP_REGISTRY" "$REGISTRY"
  echo ""
  echo "Updated $UPDATED checksum(s) in registry.json."
  echo "Next step: git add registry.json && git commit -m 'task: refresh checksums'"
else
  echo ""
  echo "No changes — all checksums already match."
fi

if [ "$MISSING" -gt 0 ]; then
  echo "WARN: $MISSING skill(s) not in registry — add entries manually."
fi
