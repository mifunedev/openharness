#!/usr/bin/env bash
set -euo pipefail

# test-install.sh — Negative (and positive) test harness for scripts/install.sh
#
# IMPORTANT: This test harness does NOT perform any real network git clone.
# Instead, it creates a local mock registry repo and patches install.sh to
# point REGISTRY_REPO at the local mock. This keeps tests hermetic and
# offline-safe.
#
# Six scenarios tested:
#   1. Happy path        — install succeeds, SKILL.md written, lock SHA is 40-char hex, exit 0
#   2. Idempotent re-run — second install prints "already installed", no file changes, exit 0
#   3. Harness safeguard — .claude/protected-paths.txt + context/SOUL.md present, exit 3
#   4. No git root       — no .git in walk-up tree, exit 4
#   5. User scope V1     — --scope user deferred to V1, exit 5
#   6. Symlink V1        — --symlink deferred to V1, exit 5
#
# Usage: bash scripts/test-install.sh
# Exit 0 only when all six scenarios pass.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INSTALL_SH="${SCRIPT_DIR}/install.sh"
PASS=0
FAIL=0

# Color helpers (disable if not a tty)
if [[ -t 1 ]]; then
  GREEN='\033[0;32m'
  RED='\033[0;31m'
  RESET='\033[0m'
else
  GREEN=''
  RED=''
  RESET=''
fi

log_pass() { echo -e "${GREEN}PASS${RESET}: $1"; PASS=$((PASS + 1)); }
log_fail() { echo -e "${RED}FAIL${RESET}: $1 — $2"; FAIL=$((FAIL + 1)); }

# ---- run a command capturing both stdout+stderr and exit code ---------------
# Usage: run_capture <outvar> <exitvar> cmd [args...]
# Sets $outvar to combined output, $exitvar to exit code.
run_capture() {
  local _out_var="$1"
  local _ec_var="$2"
  shift 2
  local _out _ec
  _out="$("$@" 2>&1)" && _ec=0 || _ec=$?
  printf -v "$_out_var" '%s' "$_out"
  printf -v "$_ec_var" '%s' "$_ec"
}

# ---- build a patched copy of install.sh pointing at local mock repo ---------

build_patched_installer() {
  local mock_repo="$1"
  local out="$2"
  sed "s|REGISTRY_REPO=.*|REGISTRY_REPO=\"${mock_repo}\"|" "$INSTALL_SH" > "$out"
  chmod +x "$out"
}

# ---- create a minimal mock skills registry repo ----------------------------
# The mock repo has its own git history so the installer captures a real SHA.

create_mock_registry() {
  local mock_dir="$1"
  mkdir -p "${mock_dir}/skills/open-harness-review"
  cat > "${mock_dir}/skills/open-harness-review/SKILL.md" <<'SKILLEOF'
---
name: open-harness-review
description: Test skill for install harness
license: Apache-2.0
metadata:
  mifune:
    version: "0.1.0"
    category: test
    requires-tools: []
---
# open-harness-review

A test skill used by the install harness.
SKILLEOF

  git -C "$mock_dir" init -q
  git -C "$mock_dir" config user.email "test@example.com"
  git -C "$mock_dir" config user.name "Test"
  git -C "$mock_dir" add .
  git -C "$mock_dir" commit -q -m "init mock registry"
  git -C "$mock_dir" branch -m main 2>/dev/null || true
}

# ---- setup: create mock registry once used by all tests --------------------

MOCK_REGISTRY="$(mktemp -d)"
create_mock_registry "$MOCK_REGISTRY"

# shellcheck disable=SC2329
cleanup_all() {
  rm -rf "$MOCK_REGISTRY"
}
trap cleanup_all EXIT

# ============================================================================
# Scenario 1: Happy path
# ============================================================================
scenario_1() {
  local tmp patched out exit_code commit_sha
  tmp="$(mktemp -d)"
  patched="${tmp}/install.sh"
  build_patched_installer "$MOCK_REGISTRY" "$patched"

  git -C "$tmp" init -q
  git -C "$tmp" config user.email "test@example.com"
  git -C "$tmp" config user.name "Test"

  run_capture out exit_code bash -c "cd '$tmp' && bash '$patched' install open-harness-review --scope project --client agents"

  if [[ "$exit_code" -ne 0 ]]; then
    log_fail "scenario 1 (happy path)" "expected exit 0, got $exit_code. Output: $out"
    rm -rf "$tmp"
    return
  fi

  if [[ ! -f "${tmp}/.agents/skills/open-harness-review/SKILL.md" ]]; then
    log_fail "scenario 1 (happy path)" "SKILL.md not found at .agents/skills/open-harness-review/SKILL.md"
    rm -rf "$tmp"
    return
  fi

  if [[ ! -f "${tmp}/.mifune/skills.lock" ]]; then
    log_fail "scenario 1 (happy path)" ".mifune/skills.lock not written"
    rm -rf "$tmp"
    return
  fi

  commit_sha="$(python3 -c "
import json
data = json.load(open('${tmp}/.mifune/skills.lock'))
print(data['skills']['open-harness-review']['commit'])
" 2>/dev/null || echo "")"

  if ! echo "$commit_sha" | grep -qE '^[0-9a-f]{40}$'; then
    log_fail "scenario 1 (happy path)" "lock commit SHA not 40-char hex: '$commit_sha'"
    rm -rf "$tmp"
    return
  fi

  log_pass "scenario 1 (happy path) — exit 0, SKILL.md written, lock SHA: ${commit_sha:0:7}..."
  rm -rf "$tmp"
}

# ============================================================================
# Scenario 2: Idempotent re-run
# ============================================================================
scenario_2() {
  local tmp patched out exit_code before_count after_count
  tmp="$(mktemp -d)"
  patched="${tmp}/install.sh"
  build_patched_installer "$MOCK_REGISTRY" "$patched"

  git -C "$tmp" init -q
  git -C "$tmp" config user.email "test@example.com"
  git -C "$tmp" config user.name "Test"

  # First install (must succeed)
  run_capture out exit_code bash -c "cd '$tmp' && bash '$patched' install open-harness-review --scope project --client agents"
  if [[ "$exit_code" -ne 0 ]]; then
    log_fail "scenario 2 (idempotent re-run)" "first install failed (exit $exit_code): $out"
    rm -rf "$tmp"
    return
  fi

  before_count="$(find "${tmp}/.agents" -type f 2>/dev/null | wc -l)"

  # Second install — must be idempotent
  run_capture out exit_code bash -c "cd '$tmp' && bash '$patched' install open-harness-review --scope project --client agents"

  after_count="$(find "${tmp}/.agents" -type f 2>/dev/null | wc -l)"

  if [[ "$exit_code" -ne 0 ]]; then
    log_fail "scenario 2 (idempotent re-run)" "expected exit 0, got $exit_code"
    rm -rf "$tmp"
    return
  fi

  if ! echo "$out" | grep -q "already installed at"; then
    log_fail "scenario 2 (idempotent re-run)" "expected 'already installed at' in output; got: $out"
    rm -rf "$tmp"
    return
  fi

  if [[ "$before_count" -ne "$after_count" ]]; then
    log_fail "scenario 2 (idempotent re-run)" "file count changed ($before_count -> $after_count)"
    rm -rf "$tmp"
    return
  fi

  log_pass "scenario 2 (idempotent re-run) — exit 0, 'already installed' printed, no file changes"
  rm -rf "$tmp"
}

# ============================================================================
# Scenario 3: Open-harness safeguard
# ============================================================================
scenario_3() {
  local tmp patched out exit_code
  tmp="$(mktemp -d)"
  patched="${tmp}/install.sh"
  build_patched_installer "$MOCK_REGISTRY" "$patched"

  git -C "$tmp" init -q
  git -C "$tmp" config user.email "test@example.com"
  git -C "$tmp" config user.name "Test"

  # Plant the two sentinel files that identify the open-harness repo
  mkdir -p "${tmp}/.claude" "${tmp}/context"
  touch "${tmp}/.claude/protected-paths.txt"
  touch "${tmp}/context/SOUL.md"

  run_capture out exit_code bash -c "cd '$tmp' && bash '$patched' install open-harness-review --scope project --client harness"

  if [[ "$exit_code" -ne 3 ]]; then
    log_fail "scenario 3 (harness safeguard)" "expected exit 3, got $exit_code. Output: $out"
    rm -rf "$tmp"
    return
  fi

  if ! echo "$out" | grep -q "ERR: refusing to write into the open-harness skill namespace"; then
    log_fail "scenario 3 (harness safeguard)" "expected ERR message in output; got: $out"
    rm -rf "$tmp"
    return
  fi

  # Verify no skill files were written
  if [[ -d "${tmp}/.claude/skills" || -d "${tmp}/.agents/skills" ]]; then
    log_fail "scenario 3 (harness safeguard)" "partial skill files found after refused install"
    rm -rf "$tmp"
    return
  fi

  log_pass "scenario 3 (harness safeguard) — exit 3, ERR message present, no files written"
  rm -rf "$tmp"
}

# ============================================================================
# Scenario 4: No git root
# ============================================================================
scenario_4() {
  local tmp patched out exit_code
  tmp="$(mktemp -d)"
  patched="${tmp}/install.sh"
  build_patched_installer "$MOCK_REGISTRY" "$patched"

  # Deliberately NO git init — no .git anywhere in the walk-up under /tmp

  run_capture out exit_code bash -c "cd '$tmp' && bash '$patched' install open-harness-review --scope project --client agents"

  if [[ "$exit_code" -ne 4 ]]; then
    log_fail "scenario 4 (no git root)" "expected exit 4, got $exit_code. Output: $out"
    rm -rf "$tmp"
    return
  fi

  if ! echo "$out" | grep -q "ERR: --scope project requires a git working tree"; then
    log_fail "scenario 4 (no git root)" "expected ERR message in output; got: $out"
    rm -rf "$tmp"
    return
  fi

  log_pass "scenario 4 (no git root) — exit 4, ERR message present"
  rm -rf "$tmp"
}

# ============================================================================
# Scenario 5: --scope user deferred to V1
# ============================================================================
scenario_5() {
  local tmp patched out exit_code
  tmp="$(mktemp -d)"
  patched="${tmp}/install.sh"
  build_patched_installer "$MOCK_REGISTRY" "$patched"

  run_capture out exit_code bash -c "cd '$tmp' && bash '$patched' install open-harness-review --scope user --client agents"

  if [[ "$exit_code" -ne 5 ]]; then
    log_fail "scenario 5 (--scope user V1 deferred)" "expected exit 5, got $exit_code. Output: $out"
    rm -rf "$tmp"
    return
  fi

  if ! echo "$out" | grep -q "deferred to V1"; then
    log_fail "scenario 5 (--scope user V1 deferred)" "expected 'deferred to V1' in output; got: $out"
    rm -rf "$tmp"
    return
  fi

  log_pass "scenario 5 (--scope user V1 deferred) — exit 5, 'deferred to V1' present"
  rm -rf "$tmp"
}

# ============================================================================
# Scenario 6: --symlink deferred to V1
# ============================================================================
scenario_6() {
  local tmp patched out exit_code
  tmp="$(mktemp -d)"
  patched="${tmp}/install.sh"
  build_patched_installer "$MOCK_REGISTRY" "$patched"

  git -C "$tmp" init -q
  git -C "$tmp" config user.email "test@example.com"
  git -C "$tmp" config user.name "Test"

  run_capture out exit_code bash -c "cd '$tmp' && bash '$patched' install open-harness-review --scope project --client agents --symlink"

  if [[ "$exit_code" -ne 5 ]]; then
    log_fail "scenario 6 (--symlink V1 deferred)" "expected exit 5, got $exit_code. Output: $out"
    rm -rf "$tmp"
    return
  fi

  if ! echo "$out" | grep -q "deferred to V1"; then
    log_fail "scenario 6 (--symlink V1 deferred)" "expected 'deferred to V1' in output; got: $out"
    rm -rf "$tmp"
    return
  fi

  log_pass "scenario 6 (--symlink V1 deferred) — exit 5, 'deferred to V1' present"
  rm -rf "$tmp"
}

# ============================================================================
# Run all scenarios
# ============================================================================

echo "=== Mifune install.sh test harness ==="
echo ""

scenario_1
scenario_2
scenario_3
scenario_4
scenario_5
scenario_6

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="

if [[ $FAIL -gt 0 ]]; then
  exit 1
fi
exit 0
