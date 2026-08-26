#!/usr/bin/env bash
# the pane pty), with NO `| tee` pipe and NO `--mode rpc`. On a TTY pi resolves to
# session no longer needs `--mode rpc` to avoid the idle exit.
set -u

BACKEND="${GATEWAY_BACKEND:-pi}"
SUPERVISE_CMD="${SUPERVISE_CMD:-}"
HARNESS="${HARNESS:-${OH_PROJECT_ROOT:-/home/sandbox/harness}}"
BRIDGE_ENTRY="${BRIDGE_ENTRY:-$HARNESS/.pi/bridge/node_modules/pi-messenger-bridge/dist/index.js}"
RECOVERY_ENTRY="${RECOVERY_ENTRY:-$HARNESS/.pi/bridge-recovery/index.ts}"
LOG="${LOG:-/tmp/client-slack-$BACKEND.log}"
LOCK="$HOME/.pi/msg-bridge.lock"

STATE_DIR="${GATEWAY_STATE_DIR:-$HOME/.pi/gateway}"
STATE="$STATE_DIR/$BACKEND.state"
HEARTBEAT_FILE="$STATE_DIR/$BACKEND.heartbeat"
STALE_FILE="$STATE_DIR/$BACKEND.stale"
HEARTBEAT_INTERVAL="${GATEWAY_HEARTBEAT_INTERVAL:-20}"
LOG_MAX_BYTES="${GATEWAY_LOG_MAX_BYTES:-5242880}"
mkdir -p "$STATE_DIR" 2>/dev/null || true
rm -f "$STALE_FILE" 2>/dev/null || true

if [ "$BACKEND" = pi ] && [ -n "${PI_SLACK_BOT_TOKEN:-}" ]; then TOKEN_STATE=present
elif [ "$BACKEND" = pi ]; then TOKEN_STATE=absent
else TOKEN_STATE="n/a"; fi

STARTED_ISO="$(date -u +%FT%TZ)"
LAUNCHES=0

write_state() {
  local tmp
  tmp=$(mktemp "$STATE_DIR/.state.XXXXXX" 2>/dev/null) || return 0
  {
    printf 'backend=%s\n'      "$BACKEND"
    printf 'session=%s\n'      "client-slack-$BACKEND"
    printf 'bridge_token=%s\n' "$TOKEN_STATE"
    printf 'started=%s\n'      "$STARTED_ISO"
    printf 'last_launch=%s\n'  "$(date -u +%FT%TZ)"
    printf 'launches=%s\n'     "$LAUNCHES"
  } >"$tmp" 2>/dev/null && mv -f "$tmp" "$STATE" 2>/dev/null || rm -f "$tmp" 2>/dev/null || true
}

write_heartbeat() {
  local tmp
  tmp=$(mktemp "$STATE_DIR/.hb.XXXXXX" 2>/dev/null) || return 0
  date -u +%s >"$tmp" 2>/dev/null && mv -f "$tmp" "$HEARTBEAT_FILE" 2>/dev/null || rm -f "$tmp" 2>/dev/null || true
}

cap_log() {
  [ -f "$LOG" ] || return 0
  local sz; sz=$(stat -c %s "$LOG" 2>/dev/null || echo 0)
  case "$sz" in ''|*[!0-9]*) return 0 ;; esac
  [ "$sz" -gt "$LOG_MAX_BYTES" ] || return 0
  local keep=$((LOG_MAX_BYTES / 2)) tmp
  tmp=$(mktemp "$STATE_DIR/.log.XXXXXX" 2>/dev/null) || return 0
  tail -c "$keep" "$LOG" >"$tmp" 2>/dev/null && cat "$tmp" >"$LOG" 2>/dev/null
  rm -f "$tmp" 2>/dev/null || true
}

while true; do
  LAUNCHES=$((LAUNCHES + 1))
  [ "$BACKEND" = pi ] && { rm -f "$LOCK" 2>/dev/null || true; }
  echo "[bridge-supervisor] launching $BACKEND bridge ($(date -u +%FT%TZ))" >>"$LOG"
  write_state

  ( while true; do write_heartbeat; cap_log; sleep "$HEARTBEAT_INTERVAL"; done ) </dev/null >/dev/null 2>&1 &
  HB=$!

  WD=""
  if [ "$BACKEND" = pi ]; then
    ( tail -Fn0 "$LOG" 2>/dev/null \
        | sed -u 's/\x1b\[[0-9;?]*[A-Za-z]//g; s/\r//g' \
        | grep -m1 'ctx is stale' >/dev/null 2>&1 \
        && { echo "[bridge-supervisor] stale-ctx detected — restarting pi ($(date -u +%FT%TZ))" >>"$LOG"; \
             date -u +%s >"$STALE_FILE" 2>/dev/null; \
             pkill -f 'pi-messenger-bridge/dist/index.js'; } ) </dev/null >/dev/null 2>&1 &
    WD=$!

    # flood, stays alive at idle), stderr -> $LOG. No pipe, no --mode rpc.
    pi --extension "$BRIDGE_ENTRY" --extension "$RECOVERY_ENTRY" --approve 2>>"$LOG"
    rc=$?
  else
    if [ -z "$SUPERVISE_CMD" ]; then
      echo "[bridge-supervisor] no SUPERVISE_CMD for backend '$BACKEND' — exiting" >>"$LOG"
      break
    fi
    bash -c "$SUPERVISE_CMD" 2>>"$LOG"
    rc=$?
  fi

  kill "$HB" 2>/dev/null || true
  pkill -P "$HB" 2>/dev/null || true
  if [ -n "$WD" ]; then kill "$WD" 2>/dev/null || true; pkill -P "$WD" 2>/dev/null || true; fi

  if [ "$rc" -eq 0 ]; then
    echo "[bridge-supervisor] $BACKEND exited cleanly (rc=0) — stopping ($(date -u +%FT%TZ))" >>"$LOG"
    rm -f "$HEARTBEAT_FILE" 2>/dev/null || true
    break
  fi
  echo "[bridge-supervisor] $BACKEND exited rc=$rc — restarting in 3s ($(date -u +%FT%TZ))" >>"$LOG"
  sleep 3
done
