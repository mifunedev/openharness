#!/usr/bin/env bash
# scripts/autopilot-caps.sh — deterministic autopilot PR-cap preflight gate.
#
# Canonical source of truth for the autopilot caps (the cap math + skip-logging
# extracted verbatim from the in-session shell in
# .claude/skills/autopilot/SKILL.md §1). The cron runtime runs this as a
# `preflight:` gate BEFORE any worktree/tmux/agent is created
# (scripts/cron-runtime.ts → runPreflight). On a capped hour it exits non-zero,
# so the runtime logs SKIPPED_PREFLIGHT and spawns nothing — no session, no
# model query, no worktree. Only PROCEED (exit 0) launches the agent.
#
# Contract — the FINAL stdout line is the STATUS token the runtime reads as the
# skip reason; every diagnostic goes to stderr so it can never shadow that line:
#   TOTAL_OPEN >= cap → log SKIPPED-CAP-TOTAL (memory + liveness), exit 11
#   OPEN_TODAY >= cap → log SKIPPED-CAP-DAILY (memory + liveness), exit 10
#   headroom          → PROCEED total=.../... today=.../...        , exit 0
#   gh error/non-num  → PROCEED-GH-ERROR (fail-open)               , exit 0
# The total ceiling is checked FIRST (matching SKILL.md §1 order). Fail-open is
# deliberate: the gate is an optimization; the in-session §1 recheck is the
# backstop, so a transient gh failure must never wedge the loop shut.
#
# Cap defaults are configurable in harness.yaml (`autopilot.total_cap` /
# `autopilot.daily_cap`), read live at each fire. Precedence: an explicit env
# override > the harness.yaml value > the hard-coded fallback below.
#
# Env knobs:
#   AUTOPILOT_TOTAL_CAP   override total-open ceiling (else harness.yaml, else 10)
#   AUTOPILOT_DAILY_CAP   override per-UTC-day cap    (else harness.yaml, else 6)
#   AUTOPILOT_REPO=mifunedev/openharness  AUTOPILOT_LABEL=autopilot
#   GH_BIN=gh  AUTOPILOT_LOG_ROOT=<resolved>
#   HARNESS_YAML          override the harness.yaml path (default <root>/harness.yaml)
set -euo pipefail

# This script lives in <root>/scripts/; resolve the harness root so the caps can
# default from harness.yaml via the canonical POSIX parser (scripts/harness-config.sh).
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
HARNESS_YAML="${HARNESS_YAML:-$REPO_ROOT/harness.yaml}"

# Read a flat section.key from harness.yaml (empty when the file/key is absent or
# commented). harness-config.sh is the single source of truth for the format.
harness_cfg() {
  [ -f "$HARNESS_YAML" ] && [ -f "$SCRIPT_DIR/harness-config.sh" ] \
    && sh "$SCRIPT_DIR/harness-config.sh" get "$1" "$HARNESS_YAML" 2>/dev/null || true
}

TOTAL_CAP="${AUTOPILOT_TOTAL_CAP:-$(harness_cfg autopilot.total_cap)}"; TOTAL_CAP="${TOTAL_CAP:-10}"
DAILY_CAP="${AUTOPILOT_DAILY_CAP:-$(harness_cfg autopilot.daily_cap)}"; DAILY_CAP="${DAILY_CAP:-6}"
LABEL="${AUTOPILOT_LABEL:-autopilot}"
REPO="${AUTOPILOT_REPO:-mifunedev/openharness}"
GH_BIN="${GH_BIN:-gh}"
TODAY=$(date -u +%Y-%m-%d)

if ! [[ "$REPO" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || [[ "$REPO" == *..* ]] || [[ "$REPO" == -* ]]; then
  printf 'autopilot-caps: invalid AUTOPILOT_REPO=%q; failing open\n' "$REPO" >&2
  echo "PROCEED-GH-ERROR"
  exit 0
fi

# Resolve where memory/liveness logs are written. Byte-identical to
# .claude/skills/autopilot/SKILL.md §1 resolve_autopilot_log_root: honor an
# explicit override, else map a worktree fire back to the shared root checkout,
# else the current toplevel. At preflight time CRON_WORKTREE is unset (the
# worktree is created later, in fireTmux), so this resolves to the root checkout
# the cron runtime runs in — exactly where heartbeat/watchdog read.
resolve_autopilot_log_root() {
  if [ -n "${AUTOPILOT_LOG_ROOT:-}" ]; then printf '%s\n' "$AUTOPILOT_LOG_ROOT"; return; fi
  if [ -n "${CRON_WORKTREE:-}" ]; then
    root=$(git -C "$CRON_WORKTREE" worktree list --porcelain 2>/dev/null | awk 'NR==1 && $1 == "worktree" { sub(/^worktree /, ""); print; exit }' || true)
    [ -z "$root" ] && root="${CRON_WORKTREE%%/.worktrees/cron/*}"
    if [ -n "$root" ] && git -C "$root" rev-parse --show-toplevel >/dev/null 2>&1; then
      git -C "$root" rev-parse --show-toplevel
      return
    fi
  fi
  git rev-parse --show-toplevel
}

# Write the byte-faithful skip record — the same `## Autopilot -- HH:MM UTC …
# Result: SKIPPED-CAP-*` memory block + `[ISO8601] autopilot: <STATUS>` liveness
# line the autopilot model wrote by hand on a capped hour — so heartbeat/watchdog
# parsing is unchanged. Diagnostics → stderr (stdout stays the STATUS token).
append_runtime_log() {
  local target="$1"
  if [ -x "$SCRIPT_DIR/locked-append.sh" ]; then
    "$SCRIPT_DIR/locked-append.sh" "$target" || {
      printf 'autopilot-caps: WARNING: locked append failed for %s; log entry dropped\n' "$target" >&2
      cat >/dev/null || true
    }
  else
    printf 'autopilot-caps: WARNING: missing scripts/locked-append.sh; appending without serialization to %s\n' "$target" >&2
    cat >> "$target" 2>/dev/null || true
  fi
}

log_skip() {
  local status="$1" action="$2" observation="$3" root day time
  root=$(resolve_autopilot_log_root)
  mkdir -p "$root/crons"
  printf '[%s] autopilot: %s\n' "$(date -Iseconds)" "$status" | append_runtime_log "$root/crons/.cron.log"
  day=$(date -u +%Y-%m-%d); time=$(date -u +%H:%M)
  mkdir -p "$root/memory/$day"
  append_runtime_log "$root/memory/$day/log.md" <<EOF

## Autopilot -- $time UTC
- **Result**: $status
- **Executor**: ${AUTOPILOT_EXECUTOR:-delegate-advisor}
- **Selected**: none
- **Session**: ${CRON_TMUX_SESSION:-none}
- **Action**: $action
- **Observation**: $observation
EOF
  printf 'autopilot-caps: %s — logged to %s/memory/%s/log.md + crons/.cron.log\n' "$status" "$root" "$day" >&2
}

# Query open autopilot PR counts. `|| echo ERR` keeps `set -e` from killing us on
# a gh failure; the numeric guard below then routes to PROCEED-GH-ERROR.
TOTAL_OPEN=$("$GH_BIN" pr list --repo "$REPO" --state open --label "$LABEL" --json number --jq 'length' 2>/dev/null || echo ERR)
OPEN_TODAY=$("$GH_BIN" pr list --repo "$REPO" --state open --search "label:$LABEL created:>=$TODAY" --json number --jq 'length' 2>/dev/null || echo ERR)

if ! [[ "$TOTAL_OPEN" =~ ^[0-9]+$ ]] || ! [[ "$OPEN_TODAY" =~ ^[0-9]+$ ]]; then
  printf 'autopilot-caps: gh query failed (total=%q today=%q); failing open\n' "$TOTAL_OPEN" "$OPEN_TODAY" >&2
  echo "PROCEED-GH-ERROR"
  exit 0
fi

printf 'autopilot-caps: repo=%s total=%s/%s today=%s/%s\n' "$REPO" "$TOTAL_OPEN" "$TOTAL_CAP" "$OPEN_TODAY" "$DAILY_CAP" >&2

if [ "$TOTAL_OPEN" -ge "$TOTAL_CAP" ]; then
  log_skip "SKIPPED-CAP-TOTAL" \
    "Skipped before selection because the total open autopilot PR ceiling is already full." \
    "$TOTAL_OPEN open autopilot PRs (ceiling $TOTAL_CAP); no issue selection, branch, or PR was produced."
  echo "SKIPPED-CAP-TOTAL"
  exit 11
fi

if [ "$OPEN_TODAY" -ge "$DAILY_CAP" ]; then
  log_skip "SKIPPED-CAP-DAILY" \
    "Skipped before selection because the daily open autopilot PR cap is already full." \
    "$OPEN_TODAY open autopilot PRs were created today (cap $DAILY_CAP); no issue selection, branch, or PR was produced."
  echo "SKIPPED-CAP-DAILY"
  exit 10
fi

echo "PROCEED total=$TOTAL_OPEN/$TOTAL_CAP today=$OPEN_TODAY/$DAILY_CAP"
exit 0
