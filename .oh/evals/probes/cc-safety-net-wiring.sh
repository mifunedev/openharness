#!/usr/bin/env bash
# tier: A
# source: .oh/tasks/cc-safety-net/prd.json US-007 2026-07-19
# desc: cc-safety-net@1.0.6 destructive-command guard stays wired across claude/codex/pi + image/compose; live binary denies 'git reset --hard'
set -euo pipefail

# Resolve the repo root the way sibling probes do (worktree-aware): prefer the
# git toplevel resolved from the probe's own directory, fall back to the fixed
# .oh/evals/probes/<id>.sh -> root climb when git is unavailable.
PROBE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$PROBE_DIR" && git rev-parse --show-toplevel 2>/dev/null)" \
  || ROOT="$(cd "$PROBE_DIR/../../.." && pwd)"

PIN="1.0.6"
fail=()

# ── REPO-STATIC assertions (never SKIP — a missing wiring is a REGRESSION) ──
# Each config edit is committed source; absence means a provider lost the guard.

CLAUDE_SETTINGS="$ROOT/.claude/settings.json"
CODEX_HOOKS="$ROOT/.codex/hooks.json"
PI_SETTINGS="$ROOT/.pi/settings.json"
PI_PKG="$ROOT/.pi/npm/package.json"
DOCKERFILE="$ROOT/.devcontainer/Dockerfile"
COMPOSE="$ROOT/.devcontainer/docker-compose.yml"

# (a) claude PreToolUse/Bash guard-wrapped command (kill-switch + hook invocation on one line)
if [[ ! -f "$CLAUDE_SETTINGS" ]]; then
  fail+=("(a) .claude/settings.json absent")
elif ! grep -F 'cc-safety-net hook --claude-code' "$CLAUDE_SETTINGS" | grep -Fq 'CC_SAFETY_NET_OFF'; then
  fail+=("(a) .claude/settings.json Bash hook missing CC_SAFETY_NET_OFF-guarded 'cc-safety-net hook --claude-code'")
fi

# (b) codex the same guard-wrapped command
if [[ ! -f "$CODEX_HOOKS" ]]; then
  fail+=("(b) .codex/hooks.json absent")
elif ! grep -F 'cc-safety-net hook --claude-code' "$CODEX_HOOKS" | grep -Fq 'CC_SAFETY_NET_OFF'; then
  fail+=("(b) .codex/hooks.json Bash hook missing CC_SAFETY_NET_OFF-guarded 'cc-safety-net hook --claude-code'")
fi

# (c) pi package pin in .pi/settings.json packages[]
if [[ ! -f "$PI_SETTINGS" ]]; then
  fail+=("(c) .pi/settings.json absent")
elif ! grep -Fq "npm:cc-safety-net@${PIN}" "$PI_SETTINGS"; then
  fail+=("(c) .pi/settings.json packages[] missing 'npm:cc-safety-net@${PIN}'")
fi

# (d) pi runtime manifest .pi/npm/package.json is gitignored, boot-generated
# state — NOT asserted statically (a fresh clone legitimately lacks it). If it
# exists, its pin must match; a mismatch means runtime drift from settings.json.
if [[ -f "$PI_PKG" ]] && ! grep -Eq "\"cc-safety-net\"[[:space:]]*:[[:space:]]*\"${PIN}\"" "$PI_PKG"; then
  fail+=("(d) .pi/npm/package.json exists but pins a different cc-safety-net than ${PIN}")
fi

# (e) Dockerfile bakes the pinned global install
if [[ ! -f "$DOCKERFILE" ]]; then
  fail+=("(e) .devcontainer/Dockerfile absent")
elif ! grep -Fq "npm install -g cc-safety-net@${PIN}" "$DOCKERFILE"; then
  fail+=("(e) .devcontainer/Dockerfile missing 'npm install -g cc-safety-net@${PIN}'")
fi

# (f) compose sets both mode env vars
if [[ ! -f "$COMPOSE" ]]; then
  fail+=("(f) .devcontainer/docker-compose.yml absent")
else
  grep -Eq 'CC_SAFETY_NET_STRICT[=:][[:space:]]*1' "$COMPOSE" \
    || fail+=("(f) docker-compose.yml missing CC_SAFETY_NET_STRICT=1")
  grep -Eq 'CC_SAFETY_NET_WORKTREE[=:][[:space:]]*1' "$COMPOSE" \
    || fail+=("(f) docker-compose.yml missing CC_SAFETY_NET_WORKTREE=1")
fi

if (( ${#fail[@]} )); then
  printf 'REGRESSION: cc-safety-net wiring gaps:\n' >&2
  printf '  - %s\n' "${fail[@]}" >&2
  exit 1
fi

# ── LIVE assertion (may SKIP only when no binary is reachable) ──
# CC_SAFETY_NET_PROBE_BIN lets CI/tests point at a local install; otherwise
# fall back to whatever cc-safety-net is on PATH inside the built image.
BIN="${CC_SAFETY_NET_PROBE_BIN:-}"
if [[ -z "$BIN" ]]; then
  BIN="$(command -v cc-safety-net 2>/dev/null || true)"
fi

if [[ -z "$BIN" ]]; then
  echo "SKIPPED: cc-safety-net binary not reachable (no CC_SAFETY_NET_PROBE_BIN and none on PATH — expected outside the built sandbox image); static wiring PASSED" >&2
  exit 2
fi

if [[ ! -x "$BIN" ]]; then
  echo "REGRESSION: cc-safety-net binary '$BIN' is not executable" >&2
  exit 1
fi

# Pipe a known-destructive command and require a deny verdict.
out="$(printf '{"tool_name":"Bash","tool_input":{"command":"git reset --hard HEAD"}}' \
  | "$BIN" hook --claude-code 2>/dev/null || true)"

if ! grep -Eq '"permissionDecision"[[:space:]]*:[[:space:]]*"deny"' <<<"$out"; then
  echo "REGRESSION: cc-safety-net did not deny 'git reset --hard HEAD'" >&2
  echo "  binary: $BIN" >&2
  echo "  output: $out" >&2
  exit 1
fi

echo "PASS: cc-safety-net wiring intact across providers/image/compose and live binary denies 'git reset --hard HEAD'" >&2
exit 0
