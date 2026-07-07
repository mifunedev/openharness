#!/usr/bin/env bash
# Self-healing supervisor for the gateway client sessions (client-slack-<backend>
# tmux sessions).
#
# Launched by .devcontainer/entrypoint.sh (pi) or .oh/scripts/gateway.sh with
# HARNESS / LOG exported, plus:
#   pi (default):  PI_SLACK_* tokens, BRIDGE_ENTRY, RECOVERY_ENTRY.
#   hermes:        GATEWAY_BACKEND=hermes and SUPERVISE_CMD=<the hermes launch
#                  command> — a GENERIC crash-restart loop with NONE of the
#                  pi-specific stale-ctx/lock/recovery logic below.
#
# Why this exists (pi): pi-messenger-bridge binds its long-lived Slack socket to a
# session-scoped pi ctx. When pi replaces the session (compaction, fork, switch,
# reload) that ctx goes stale and every subsequent Slack message throws
# "extension ctx is stale after session replacement or reload" — the package has
# no recovery hook, so the bridge silently stops responding while the process
# keeps running. This loop restarts pi on that signature (and on any crash),
# clearing the single-instance lock each time so the fresh process reconnects.
#
# pi runs INTERACTIVELY, attached to the tmux pane's real TTY (stdin + stdout are
# the pane pty), with NO `| tee` pipe and NO `--mode rpc`. On a TTY pi resolves to
# interactive mode, so the loaded UI extensions (prompt-suggester, pi-recap)
# RENDER in the TUI instead of serializing every setStatus/setWidget call to
# stdout as `extension_ui_request` JSON frames — that flood is an rpc-mode
# artifact. Interactive pi also stays alive at idle (it is a REPL), so the
# session no longer needs `--mode rpc` to avoid the idle exit.
#
# Logging is out-of-band (we lost `tee`): pi's stderr is redirected to $LOG, and
# the entrypoint additionally mirrors the visible pane into $LOG (ANSI-stripped)
# via `tmux pipe-pane`. Both feed the stale-ctx watchdog below.
#
# A 2nd --extension loads the standalone Codex retry-recovery extension
# (.pi/bridge-recovery/index.ts), which re-injects a failed Slack-originated turn
# once on `previous_response_not_found` — recovery the npm bridge lacks.
#
# Health/observability: each launch stamps a non-secret state file and a
# background ticker refreshes a heartbeat (proving the session is actively
# supervised, not merely "a tmux session exists") and caps $LOG in place so a
# long-lived session cannot grow it without bound. `gateway status` reads these.
#
# A clean exit (rc=0) stops the loop; a crash or watchdog-kill (rc!=0) restarts it.
#
# NOTE: intentionally no `set -e` — pkill/kill return non-zero when there is
# nothing to signal, which is normal control flow here, not an error.
set -u

BACKEND="${GATEWAY_BACKEND:-pi}"
SUPERVISE_CMD="${SUPERVISE_CMD:-}"
HARNESS="${HARNESS:-${OH_PROJECT_ROOT:-/home/sandbox/harness}}"
BRIDGE_ENTRY="${BRIDGE_ENTRY:-$HARNESS/.pi/bridge/node_modules/pi-messenger-bridge/dist/index.js}"
RECOVERY_ENTRY="${RECOVERY_ENTRY:-$HARNESS/.pi/bridge-recovery/index.ts}"
LOG="${LOG:-/tmp/client-slack-$BACKEND.log}"
LOCK="$HOME/.pi/msg-bridge.lock"

# Non-secret runtime state consumed by `gateway status` (see gateway.sh).
STATE_DIR="${GATEWAY_STATE_DIR:-$HOME/.pi/gateway}"
STATE="$STATE_DIR/$BACKEND.state"
HEARTBEAT_FILE="$STATE_DIR/$BACKEND.heartbeat"
STALE_FILE="$STATE_DIR/$BACKEND.stale"
HEARTBEAT_INTERVAL="${GATEWAY_HEARTBEAT_INTERVAL:-20}"
LOG_MAX_BYTES="${GATEWAY_LOG_MAX_BYTES:-5242880}"  # 5 MiB
mkdir -p "$STATE_DIR" 2>/dev/null || true
rm -f "$STALE_FILE" 2>/dev/null || true

if [ "$BACKEND" = pi ] && [ -n "${PI_SLACK_BOT_TOKEN:-}" ]; then TOKEN_STATE=present
elif [ "$BACKEND" = pi ]; then TOKEN_STATE=absent
else TOKEN_STATE="n/a"; fi

STARTED_ISO="$(date -u +%FT%TZ)"
LAUNCHES=0

# Atomic single-line/kv writes (never carry secrets). Writers are disjoint per
# file: the main loop owns $STATE, the ticker owns $HEARTBEAT_FILE, the watchdog
# owns $STALE_FILE — so no locking is needed.
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

# Copytruncate cap: keep the last half, then rewrite the SAME inode in place so
# the pipe-pane / pi-stderr append fds and the stale-ctx `tail -F` stay valid
# (a rename/create would leave them writing to the rotated-away inode).
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

  # Heartbeat + in-place log cap ticker: refreshes while the process runs, torn
  # down when it exits. Fully redirected so it never touches the pane pty.
  ( while true; do write_heartbeat; cap_log; sleep "$HEARTBEAT_INTERVAL"; done ) </dev/null >/dev/null 2>&1 &
  HB=$!

  WD=""
  if [ "$BACKEND" = pi ]; then
    # Watchdog: tail $LOG from end-of-file (old stale-ctx lines never re-trigger),
    # strip ANSI/CR so a TUI-rendered error is still greppable, record the recovery
    # for `gateway status`, and kill the bridge pi — matched by its unique
    # --extension path — on the first stale-ctx line so the loop relaunches a
    # fresh, non-stale process. Fully redirected (incl. stdin from /dev/null) so it
    # never reads the pane pty or holds a stdout pipe open.
    ( tail -Fn0 "$LOG" 2>/dev/null \
        | sed -u 's/\x1b\[[0-9;?]*[A-Za-z]//g; s/\r//g' \
        | grep -m1 'ctx is stale' >/dev/null 2>&1 \
        && { echo "[bridge-supervisor] stale-ctx detected — restarting pi ($(date -u +%FT%TZ))" >>"$LOG"; \
             date -u +%s >"$STALE_FILE" 2>/dev/null; \
             pkill -f 'pi-messenger-bridge/dist/index.js'; } ) </dev/null >/dev/null 2>&1 &
    WD=$!

    # Interactive TTY launch: stdin+stdout = pane pty (-> interactive mode, no JSON
    # flood, stays alive at idle), stderr -> $LOG. No pipe, no --mode rpc.
    pi --extension "$BRIDGE_ENTRY" --extension "$RECOVERY_ENTRY" --approve 2>>"$LOG"
    rc=$?
  else
    # Generic backend (hermes): crash-restart-with-backoff only. SUPERVISE_CMD
    # ends in `exec <bin> gateway run`, so it replaces this subshell and returns
    # the backend's own exit code. No stale-ctx/lock/recovery — those are
    # pi-bridge-specific.
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
