#!/usr/bin/env bash
# tier: A
# source: .oh/tasks/cc-safety-net/prd.json US-007 2026-07-19
# desc: cc-safety-net@1.0.6 destructive-command guard stays wired across claude/codex/pi + image/compose; live binary denies 'git reset --hard'
set -euo pipefail

PROBE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$PROBE_DIR" && git rev-parse --show-toplevel 2>/dev/null)" \
  || ROOT="$(cd "$PROBE_DIR/../../.." && pwd)"

PIN="1.0.6"
fail=()


CLAUDE_SETTINGS="$ROOT/.claude/settings.json"
CODEX_HOOKS="$ROOT/.codex/hooks.json"
PI_SETTINGS="$ROOT/.pi/settings.json"
PI_NPM="${CC_SAFETY_NET_PROBE_PI_NPM:-$ROOT/.pi/npm}"
DOCKERFILE="$ROOT/.devcontainer/Dockerfile"
COMPOSE="$ROOT/.devcontainer/docker-compose.yml"

if [[ ! -f "$CLAUDE_SETTINGS" ]]; then
  fail+=("(a) .claude/settings.json absent")
elif ! grep -F 'cc-safety-net hook --claude-code' "$CLAUDE_SETTINGS" | grep -Fq 'CC_SAFETY_NET_OFF'; then
  fail+=("(a) .claude/settings.json Bash hook missing CC_SAFETY_NET_OFF-guarded 'cc-safety-net hook --claude-code'")
fi

if [[ ! -f "$CODEX_HOOKS" ]]; then
  fail+=("(b) .codex/hooks.json absent")
elif ! grep -F 'cc-safety-net hook --claude-code' "$CODEX_HOOKS" | grep -Fq 'CC_SAFETY_NET_OFF'; then
  fail+=("(b) .codex/hooks.json Bash hook missing CC_SAFETY_NET_OFF-guarded 'cc-safety-net hook --claude-code'")
fi

if [[ ! -f "$PI_SETTINGS" ]]; then
  fail+=("(c) .pi/settings.json absent")
elif ! grep -Fq "npm:cc-safety-net@${PIN}" "$PI_SETTINGS"; then
  fail+=("(c) .pi/settings.json packages[] missing 'npm:cc-safety-net@${PIN}'")
fi

PI_LOCK="$PI_NPM/package-lock.json"
PI_INSTALLED="$PI_NPM/node_modules/cc-safety-net/package.json"
PI_MANIFEST="$PI_NPM/package.json"
D_NODE="$(command -v node 2>/dev/null || true)"
D_FIX="reinstall .pi/npm, or bump the pin in .pi/settings.json + .devcontainer/Dockerfile"
d_found=0
d_lines=${#fail[@]}

d_json_read() {
  "$D_NODE" -e '
const fs = require("fs");
const [file, kind] = process.argv.slice(1);
const j = JSON.parse(fs.readFileSync(file, "utf8"));
const dep = "cc-safety-net";
let v = "";
if (kind === "lock") {
  const pkgs = j.packages || {};
  const deps = j.dependencies || {};
  v = (pkgs["node_modules/" + dep] || {}).version || (deps[dep] || {}).version || "";
} else if (kind === "installed") {
  v = j.version || "";
} else {
  for (const m of ["dependencies", "devDependencies", "optionalDependencies"]) {
    if (j[m] && typeof j[m][dep] === "string") { v = j[m][dep]; break; }
  }
}
if (typeof v === "string" && v) process.stdout.write(v);
' "$1" "$2"
}

d_check() {
  local file="$1" kind="$2" label ver
  [[ -f "$file" ]] || return 0
  label="${file#"$ROOT"/}"
  if [[ -z "$D_NODE" ]]; then
    fail+=("(d) $label unread: no node on PATH to check cc-safety-net against pin ${PIN} — install node")
    return 0
  fi
  if ! ver="$(d_json_read "$file" "$kind" 2>/dev/null)"; then
    fail+=("(d) $label is not readable JSON, so cc-safety-net ${PIN} stays unverified — ${D_FIX}")
    return 0
  fi
  [[ -n "$ver" ]] || return 0
  if [[ "$kind" == "declared" ]]; then
    fail+=("(d) $label declares cc-safety-net $ver but nothing resolves it (pin ${PIN}) — ${D_FIX}")
    return 0
  fi
  d_found=1
  if [[ "$ver" != "$PIN" ]]; then
    fail+=("(d) $label resolves cc-safety-net $ver, not the pinned ${PIN} — ${D_FIX}")
  fi
  return 0
}

if [[ -n "${CC_SAFETY_NET_PROBE_PI_NPM:-}" && ! -d "$PI_NPM" ]]; then
  fail+=("(d) CC_SAFETY_NET_PROBE_PI_NPM='$PI_NPM' is not a directory, so cc-safety-net ${PIN} is unverified — point it at an installed .pi/npm tree")
elif [[ -d "$PI_NPM" ]]; then
  d_check "$PI_LOCK" lock
  d_check "$PI_INSTALLED" installed
  if (( d_found == 0 && ${#fail[@]} == d_lines )); then
    d_check "$PI_MANIFEST" declared
  fi
  if (( d_found == 0 && ${#fail[@]} == d_lines )) && [[ -n "${CC_SAFETY_NET_PROBE_PI_NPM:-}" ]]; then
    fail+=("(d) CC_SAFETY_NET_PROBE_PI_NPM='$PI_NPM' resolves no cc-safety-net version to check against ${PIN} — point it at an installed .pi/npm tree")
  fi
fi

if [[ ! -f "$DOCKERFILE" ]]; then
  fail+=("(e) .devcontainer/Dockerfile absent")
elif ! grep -Fq "npm install -g cc-safety-net@${PIN}" "$DOCKERFILE"; then
  fail+=("(e) .devcontainer/Dockerfile missing 'npm install -g cc-safety-net@${PIN}'")
fi

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
