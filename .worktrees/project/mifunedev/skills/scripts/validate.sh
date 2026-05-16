#!/usr/bin/env bash
# =============================================================================
# validate.sh — CI gatekeeper for the mifunedev/skills library
# =============================================================================
#
# Runs three layers of validation against every skill in skills/*/:
#
#   1. skills-ref validate   — portable-spec compliance (requires skills-ref@0.1.5)
#   2. Registry parity       — every skills/ folder appears in registry.json;
#                              registry.json parses as valid JSON
#   3. Checksum integrity    — recomputes each skill's folder hash and compares
#                              to the registry's recorded value
#   4. Body rules            — no SKILL.md exceeds 500 lines; no SKILL.md
#                              references $CLAUDE_SKILL_DIR
#   5. Frontmatter deny-list — rejects Claude-Code-specific top-level keys
#                              (see § Mifune Portability Policy below)
#
# Exit: 0 = all checks pass; 1 = one or more failures (summary printed to stderr)
#
# Usage (from repo root):
#   ./scripts/validate.sh
#
# For CI, install skills-ref before invoking:
#   npm install skills-ref@0.1.5
#   ./scripts/validate.sh
#
# =============================================================================
# Mifune Portability Policy — frontmatter deny-list
# =============================================================================
#
# The following Claude-Code-specific top-level frontmatter keys are BANNED in
# this library. They are Claude-Code-only extensions that non-Claude-Code
# clients silently ignore, which creates invisible behaviour divergence.
#
#   disable-model-invocation
#   user-invocable
#   paths
#   context
#   agent
#   argument-hint
#   arguments
#   hooks
#
# When a skill genuinely needs these capabilities for Claude Code, lift them
# into metadata.mifune.claude-code.* so they are clearly namespaced and an
# install adapter can promote them at copy time. See docs/portability.md for
# the full rationale.
#
# =============================================================================

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKILLS_DIR="$REPO_ROOT/skills"
REGISTRY="$REPO_ROOT/registry.json"

# ---------------------------------------------------------------------------
# Shared checksum function (must match refresh-checksums.sh exactly — DRY)
# ---------------------------------------------------------------------------
compute_checksum() {
  local skill_name="$1"
  # Run from REPO_ROOT so paths in sha256sum output are stable
  (cd "$REPO_ROOT" && find "skills/$skill_name" -type f -not -path '*/.*' \
    | LC_ALL=C sort | xargs sha256sum | sha256sum | cut -d' ' -f1)
}

# ---------------------------------------------------------------------------
# Locate skills-ref
# ---------------------------------------------------------------------------
if command -v skills-ref &>/dev/null; then
  SKILLS_REF="skills-ref"
elif [ -x "$REPO_ROOT/node_modules/.bin/skills-ref" ]; then
  SKILLS_REF="$REPO_ROOT/node_modules/.bin/skills-ref"
elif command -v npx &>/dev/null && npx --yes skills-ref@0.1.5 --version &>/dev/null 2>&1; then
  SKILLS_REF="npx skills-ref@0.1.5"
else
  echo "WARN: skills-ref not found. Install with: npm install skills-ref@0.1.5" >&2
  echo "WARN: Skipping skills-ref validation — install skills-ref@0.1.5 to enable." >&2
  SKILLS_REF=""
fi

# ---------------------------------------------------------------------------
# Deny-list of forbidden top-level frontmatter keys (Mifune portability policy)
# ---------------------------------------------------------------------------
DENY_LIST=(
  "disable-model-invocation"
  "user-invocable"
  "paths"
  "context"
  "agent"
  "argument-hint"
  "arguments"
  "hooks"
)

# ---------------------------------------------------------------------------
# Collect all skill directories
# ---------------------------------------------------------------------------
mapfile -t SKILL_DIRS < <(find "$SKILLS_DIR" -mindepth 1 -maxdepth 1 -type d | LC_ALL=C sort)

if [ "${#SKILL_DIRS[@]}" -eq 0 ]; then
  echo "ERR: No skill directories found under $SKILLS_DIR" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# State tracking
# ---------------------------------------------------------------------------
FAILURES=()
PASS_COUNT=0

fail() {
  FAILURES+=("$1")
}

# ---------------------------------------------------------------------------
# Check 1: registry.json parses as valid JSON
# ---------------------------------------------------------------------------
echo "--- Check 1: registry.json JSON validity ---"
if ! jq empty "$REGISTRY" 2>/dev/null; then
  fail "registry.json: not valid JSON"
else
  echo "OK  registry.json parses as valid JSON"
  ((PASS_COUNT++)) || true
fi

# ---------------------------------------------------------------------------
# Check 2: every skills/ folder is listed in registry.json
# ---------------------------------------------------------------------------
echo ""
echo "--- Check 2: registry.json lists every skill folder ---"
for skill_dir in "${SKILL_DIRS[@]}"; do
  skill_name="$(basename "$skill_dir")"
  if ! jq -e --arg n "$skill_name" '.skills[] | select(.name == $n)' "$REGISTRY" &>/dev/null; then
    fail "registry.json: missing entry for skills/$skill_name/"
  else
    echo "OK  $skill_name in registry"
    ((PASS_COUNT++)) || true
  fi
done

# ---------------------------------------------------------------------------
# Per-skill checks (3-5)
# ---------------------------------------------------------------------------
for skill_dir in "${SKILL_DIRS[@]}"; do
  skill_name="$(basename "$skill_dir")"
  skill_md="$skill_dir/SKILL.md"

  echo ""
  echo "=== Skill: $skill_name ==="

  if [ ! -f "$skill_md" ]; then
    fail "$skill_name/SKILL.md: file not found"
    continue
  fi

  # -----------------------------------------------------------------------
  # Check 3: skills-ref validate (portable spec compliance)
  # -----------------------------------------------------------------------
  echo "--- Check 3: skills-ref validate ---"
  if [ -n "$SKILLS_REF" ]; then
    # skills-ref validate accepts path relative to cwd or absolute
    if $SKILLS_REF validate "$skill_dir/"; then
      echo "OK  skills-ref: $skill_name"
      ((PASS_COUNT++)) || true
    else
      fail "skills-ref validate failed for skills/$skill_name/"
    fi
  else
    echo "SKIP skills-ref validate (skills-ref not installed — see WARN above)"
  fi

  # -----------------------------------------------------------------------
  # Check 4a: SKILL.md ≤ 500 lines
  # -----------------------------------------------------------------------
  echo "--- Check 4a: line count ≤ 500 ---"
  line_count="$(wc -l < "$skill_md")"
  if [ "$line_count" -gt 500 ]; then
    fail "skills/$skill_name/SKILL.md: $line_count lines exceeds 500-line limit"
  else
    echo "OK  $skill_name: $line_count lines"
    ((PASS_COUNT++)) || true
  fi

  # -----------------------------------------------------------------------
  # Check 4b: no $CLAUDE_SKILL_DIR references
  # -----------------------------------------------------------------------
  echo "--- Check 4b: no \$CLAUDE_SKILL_DIR ---"
  # shellcheck disable=SC2016  # literal $ in grep pattern is intentional
  if grep -q '$CLAUDE_SKILL_DIR' "$skill_md"; then
    fail "skills/$skill_name/SKILL.md: references \$CLAUDE_SKILL_DIR (Claude-Code-specific; use relative paths)"
  else
    echo "OK  $skill_name: no \$CLAUDE_SKILL_DIR"
    ((PASS_COUNT++)) || true
  fi

  # -----------------------------------------------------------------------
  # Check 5: deny-list — no forbidden top-level frontmatter keys
  # -----------------------------------------------------------------------
  echo "--- Check 5: frontmatter deny-list ---"
  # Extract frontmatter block (between the first pair of --- lines)
  frontmatter="$(awk 'BEGIN{fm=0} /^---/{fm++; if(fm==2)exit; next} fm==1{print}' "$skill_md")"
  deny_hit=0
  for key in "${DENY_LIST[@]}"; do
    # Match key at the start of a line (top-level YAML key)
    if echo "$frontmatter" | grep -qE "^${key}:"; then
      fail "skills/$skill_name/SKILL.md: forbidden top-level frontmatter key '$key' (Mifune portability policy — see docs/portability.md)"
      deny_hit=1
    fi
  done
  if [ "$deny_hit" -eq 0 ]; then
    echo "OK  $skill_name: no deny-list keys"
    ((PASS_COUNT++)) || true
  fi

  # -----------------------------------------------------------------------
  # Check 6: checksum integrity
  # -----------------------------------------------------------------------
  echo "--- Check 6: checksum integrity ---"
  registry_checksum="$(jq -r --arg n "$skill_name" \
    '.skills[] | select(.name == $n) | .checksum' "$REGISTRY" 2>/dev/null || echo "")"

  if [ -z "$registry_checksum" ] || [ "$registry_checksum" = "null" ]; then
    fail "skills/$skill_name/: no checksum in registry (run scripts/refresh-checksums.sh)"
  else
    computed_hash="$(compute_checksum "$skill_name")"
    computed_checksum="sha256:$computed_hash"
    if [ "$computed_checksum" != "$registry_checksum" ]; then
      fail "ERR: checksum drift in skills/$skill_name/: registry says $registry_checksum, computed $computed_checksum. Run scripts/refresh-checksums.sh to update the registry."
    else
      echo "OK  $skill_name: checksum matches ($computed_checksum)"
      ((PASS_COUNT++)) || true
    fi
  fi
done

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "============================================================"
if [ "${#FAILURES[@]}" -eq 0 ]; then
  echo "PASS — all checks passed ($PASS_COUNT checks)"
  exit 0
else
  echo "FAIL — $PASS_COUNT checks passed, ${#FAILURES[@]} failure(s):" >&2
  for msg in "${FAILURES[@]}"; do
    echo "  - $msg" >&2
  done
  exit 1
fi
