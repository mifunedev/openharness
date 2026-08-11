#!/usr/bin/env bash
# Self-healing supervisor for client-slack-<backend> tmux sessions.
#
# Pi uses one isolated persistent session directory and always launches with
# --continue, so a post-compaction reconnect reopens the compacted active path
# instead of starting a bare session. The bridge package owns the authenticated
# Slack compact request, exact chat/thread acknowledgement, ctx.compact call,
# and Slack disconnect. This supervisor owns only process/session continuity.
#
# Compact completion crosses that boundary through a per-launch anonymous pipe:
# the supervisor creates a mode-700 private FIFO, opens a synchronized one-shot
# reader before Pi starts, passes only the inherited write fd, then unlinks the
# FIFO. Node does not pass non-stdio descriptors to ordinary tool subprocesses.
# Pane/log text and tool output therefore cannot forge the completion byte.
#
# NOTE: intentionally no `set -e`; non-zero wait/kill results are normal control
# flow in a supervisor.
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
COMPACT_FILE="$STATE_DIR/$BACKEND.compact"
RESTART_TRIGGER_FILE="$STATE_DIR/$BACKEND.restart-trigger"
RESTART_CLAIM_DIR="$STATE_DIR/$BACKEND.restart-claim"
PI_PID_FILE="$STATE_DIR/$BACKEND.pid"
PI_GROUP_FILE="$STATE_DIR/$BACKEND.pgid"
SESSION_DIR="${GATEWAY_PI_SESSION_DIR:-$STATE_DIR/pi-sessions}"
HEARTBEAT_INTERVAL="${GATEWAY_HEARTBEAT_INTERVAL:-20}"
RESTART_DELAY="${GATEWAY_RESTART_DELAY:-3}"
LOG_MAX_BYTES="${GATEWAY_LOG_MAX_BYTES:-5242880}"

mkdir -p "$STATE_DIR" 2>/dev/null || true
chmod 700 "$STATE_DIR" 2>/dev/null || true
if [ "$BACKEND" = pi ]; then
  mkdir -p "$SESSION_DIR" 2>/dev/null || true
  chmod 700 "$SESSION_DIR" 2>/dev/null || true
fi
rm -f "$STALE_FILE" "$COMPACT_FILE" "$RESTART_TRIGGER_FILE" "$PI_PID_FILE" "$PI_GROUP_FILE" 2>/dev/null || true
rmdir "$RESTART_CLAIM_DIR" 2>/dev/null || true

if [ "$BACKEND" = pi ] && [ -n "${PI_SLACK_BOT_TOKEN:-}" ]; then TOKEN_STATE=present
elif [ "$BACKEND" = pi ]; then TOKEN_STATE=absent
else TOKEN_STATE="n/a"; fi

if ! cd "$HARNESS"; then
  echo "[bridge-supervisor] harness cwd unavailable: $HARNESS" >>"$LOG"
  exit 1
fi

STARTED_ISO="$(date -u +%FT%TZ)"
LAUNCHES=0
HB=""
COMPACT_WATCHER=""
STALE_WATCHER=""
PI_PID=""
PI_PGID=""
COMPACT_WRITE_FD=""
IPC_FIFO=""
IPC_READY=""
IPC_OPEN=""
IPC_SETTLED=""
STOPPING=0

write_state() {
  local tmp
  tmp=$(mktemp "$STATE_DIR/.state.XXXXXX" 2>/dev/null) || return 0
  {
    printf 'backend=%s\n' "$BACKEND"
    printf 'session=%s\n' "client-slack-$BACKEND"
    printf 'bridge_token=%s\n' "$TOKEN_STATE"
    printf 'started=%s\n' "$STARTED_ISO"
    printf 'last_launch=%s\n' "$(date -u +%FT%TZ)"
    printf 'launches=%s\n' "$LAUNCHES"
    if [ "$BACKEND" = pi ]; then printf 'session_dir=%s\n' "$SESSION_DIR"; fi
  } >"$tmp" 2>/dev/null && mv -f "$tmp" "$STATE" 2>/dev/null || rm -f "$tmp" 2>/dev/null || true
}

write_heartbeat() {
  local tmp
  tmp=$(mktemp "$STATE_DIR/.hb.XXXXXX" 2>/dev/null) || return 0
  date -u +%s >"$tmp" 2>/dev/null && mv -f "$tmp" "$HEARTBEAT_FILE" 2>/dev/null || rm -f "$tmp" 2>/dev/null || true
}

cap_log() {
  [ -f "$LOG" ] || return 0
  local sz keep tmp
  sz=$(stat -c %s "$LOG" 2>/dev/null || echo 0)
  case "$sz" in ''|*[!0-9]*) return 0 ;; esac
  [ "$sz" -gt "$LOG_MAX_BYTES" ] || return 0
  keep=$((LOG_MAX_BYTES / 2))
  tmp=$(mktemp "$STATE_DIR/.log.XXXXXX" 2>/dev/null) || return 0
  tail -c "$keep" "$LOG" >"$tmp" 2>/dev/null && cat "$tmp" >"$LOG" 2>/dev/null
  rm -f "$tmp" 2>/dev/null || true
}

# Kill only the recorded process and its exact /proc descendants. No name-based
# pkill is used, so sibling Pi/bridge sessions survive.
terminate_exact_tree() {
  local pid="$1" child
  case "$pid" in ''|*[!0-9]*) return 0 ;; esac
  if [ -r "/proc/$pid/task/$pid/children" ]; then
    for child in $(cat "/proc/$pid/task/$pid/children" 2>/dev/null); do
      terminate_exact_tree "$child"
    done
  fi
  kill -TERM "$pid" 2>/dev/null || true
}

# Pi launches in a fresh session/process group whose PGID equals its recorded
# leader PID. Signal only that verified group. TERM gets a bounded grace period,
# then KILL closes stubborn descendants without touching sibling Pi/Hermes jobs.
terminate_exact_group() {
  local pgid="$1" leader="$2" attempts=200
  case "$pgid:$leader" in *[!0-9:]*) return 0 ;; esac
  [ -n "$pgid" ] && [ "$pgid" = "$leader" ] || return 0
  kill -TERM -- "-$pgid" 2>/dev/null || true
  while kill -0 -- "-$pgid" 2>/dev/null && [ "$attempts" -gt 0 ]; do
    attempts=$((attempts - 1))
    sleep 0.01
  done
  if kill -0 -- "-$pgid" 2>/dev/null; then
    kill -KILL -- "-$pgid" 2>/dev/null || true
  fi
}

wait_for_file() {
  local file="$1" attempts="${2:-500}"
  while [ ! -f "$file" ] && [ "$attempts" -gt 0 ]; do
    attempts=$((attempts - 1))
    sleep 0.01
  done
  [ -f "$file" ]
}

claim_restart_and_signal() {
  local kind="$1" pid pgid attempts=500
  mkdir "$RESTART_CLAIM_DIR" 2>/dev/null || return 0
  printf '%s\n' "$kind" >"$RESTART_TRIGGER_FILE" 2>/dev/null
  case "$kind" in
    compact)
      date -u +%s >"$COMPACT_FILE" 2>/dev/null
      echo "[bridge-supervisor] Slack compaction completed — restarting exact Pi process group ($(date -u +%FT%TZ))" >>"$LOG"
      ;;
    stale)
      date -u +%s >"$STALE_FILE" 2>/dev/null
      echo "[bridge-supervisor] stale-ctx detected — restarting exact Pi process group ($(date -u +%FT%TZ))" >>"$LOG"
      ;;
  esac
  while { [ ! -s "$PI_PID_FILE" ] || [ ! -s "$PI_GROUP_FILE" ]; } && [ "$attempts" -gt 0 ]; do
    attempts=$((attempts - 1))
    sleep 0.01
  done
  pid=$(cat "$PI_PID_FILE" 2>/dev/null || true)
  pgid=$(cat "$PI_GROUP_FILE" 2>/dev/null || true)
  terminate_exact_group "$pgid" "$pid"
}

close_compact_writer() {
  if [ -n "$COMPACT_WRITE_FD" ]; then
    eval "exec ${COMPACT_WRITE_FD}>&-"
    COMPACT_WRITE_FD=""
    unset PI_MSG_BRIDGE_COMPACT_FD
  fi
}

stop_launch_helpers() {
  close_compact_writer
  if [ -n "$COMPACT_WATCHER" ]; then
    wait "$COMPACT_WATCHER" 2>/dev/null || true
    COMPACT_WATCHER=""
  fi
  if [ -n "$STALE_WATCHER" ]; then
    terminate_exact_tree "$STALE_WATCHER"
    wait "$STALE_WATCHER" 2>/dev/null || true
    STALE_WATCHER=""
  fi
  if [ -n "$HB" ]; then
    terminate_exact_tree "$HB"
    wait "$HB" 2>/dev/null || true
    HB=""
  fi
  rm -f "$PI_PID_FILE" "$PI_GROUP_FILE" "$IPC_FIFO" "$IPC_READY" "$IPC_OPEN" "$IPC_SETTLED" 2>/dev/null || true
  IPC_FIFO=""; IPC_READY=""; IPC_OPEN=""; IPC_SETTLED=""
}

cleanup_all() {
  [ "$STOPPING" -eq 0 ] || return 0
  STOPPING=1
  if [ -n "$PI_PID" ] && [ -n "$PI_PGID" ]; then
    terminate_exact_group "$PI_PGID" "$PI_PID"
  fi
  stop_launch_helpers
  rm -f "$HEARTBEAT_FILE" "$PI_PID_FILE" "$PI_GROUP_FILE" "$RESTART_TRIGGER_FILE" 2>/dev/null || true
  if [ "$BACKEND" = pi ]; then rm -f "$LOCK" 2>/dev/null || true; fi
  rmdir "$RESTART_CLAIM_DIR" 2>/dev/null || true
}

on_signal() {
  cleanup_all
  exit 0
}
trap on_signal INT TERM HUP
trap cleanup_all EXIT

prepare_compact_watcher() {
  local base
  base=$(mktemp "$STATE_DIR/.compact-ipc.XXXXXX" 2>/dev/null) || return 1
  rm -f "$base"
  IPC_FIFO="$base.fifo"
  IPC_READY="$base.ready"
  IPC_OPEN="$base.open"
  IPC_SETTLED="$base.settled"
  mkfifo -m 600 "$IPC_FIFO" || return 1

  (
    local read_fd byte=""
    : >"$IPC_READY"
    exec {read_fd}<"$IPC_FIFO" || { : >"$IPC_SETTLED"; exit 1; }
    : >"$IPC_OPEN"
    if IFS= read -r -N 1 byte <&$read_fd && [ "$byte" = C ]; then
      claim_restart_and_signal compact
    fi
    eval "exec ${read_fd}<&-"
    : >"$IPC_SETTLED"
  ) </dev/null >/dev/null 2>&1 &
  COMPACT_WATCHER=$!

  wait_for_file "$IPC_READY" || return 1
  exec {COMPACT_WRITE_FD}>"$IPC_FIFO" || return 1
  export PI_MSG_BRIDGE_COMPACT_FD="$COMPACT_WRITE_FD"
  wait_for_file "$IPC_OPEN" || return 1
  rm -f "$IPC_FIFO"
  IPC_FIFO=""
  return 0
}

launch_pi_isolated() {
  # A non-interactive supervisor backgrounds Pi, which would otherwise inherit
  # /dev/null on stdin. Reopen the tmux controlling TTY before setsid, then exec
  # so the recorded PID is the isolated Pi session/group leader.
  if [ -r /dev/tty ]; then
    exec setsid pi --session-dir "$SESSION_DIR" --continue \
      --extension "$BRIDGE_ENTRY" --extension "$RECOVERY_ENTRY" --approve </dev/tty
  fi
  exec setsid pi --session-dir "$SESSION_DIR" --continue \
    --extension "$BRIDGE_ENTRY" --extension "$RECOVERY_ENTRY" --approve
}

prepare_stale_watcher() {
  local ready="$STATE_DIR/.stale-ready.$$.${LAUNCHES}" offset
  offset=$(stat -c %s "$LOG" 2>/dev/null || echo 0)
  (
    local current chunk carry=""
    # This watcher must not retain the compact pipe's write end; otherwise an
    # ordinary clean Pi exit could never produce EOF for the one-shot reader.
    if [ -n "$COMPACT_WRITE_FD" ]; then eval "exec ${COMPACT_WRITE_FD}>&-"; fi
    : >"$ready"
    while true; do
      current=$(stat -c %s "$LOG" 2>/dev/null || echo 0)
      case "$current:$offset" in *[!0-9:]*) current=0; offset=0 ;; esac
      if [ "$current" -lt "$offset" ]; then offset=0; carry=""; fi
      if [ "$current" -gt "$offset" ]; then
        chunk=$(dd if="$LOG" bs=1 skip="$offset" count="$((current - offset))" 2>/dev/null || true)
        offset=$current
        carry="$carry$chunk"
        if [[ "$carry" == *"ctx is stale"* ]]; then
          claim_restart_and_signal stale
          break
        fi
        if [ "${#carry}" -gt 256 ]; then carry="${carry: -256}"; fi
      fi
      sleep 0.1
    done
    rm -f "$ready" 2>/dev/null || true
  ) </dev/null >/dev/null 2>&1 &
  STALE_WATCHER=$!
  wait_for_file "$ready" || return 1
  rm -f "$ready" 2>/dev/null || true
}

while true; do
  LAUNCHES=$((LAUNCHES + 1))
  rm -f "$RESTART_TRIGGER_FILE" "$PI_PID_FILE" "$PI_GROUP_FILE" 2>/dev/null || true
  rmdir "$RESTART_CLAIM_DIR" 2>/dev/null || true
  if [ "$BACKEND" = pi ]; then rm -f "$LOCK" 2>/dev/null || true; fi

  echo "[bridge-supervisor] launching $BACKEND bridge ($(date -u +%FT%TZ))" >>"$LOG"
  write_state
  ( while true; do write_heartbeat; cap_log; sleep "$HEARTBEAT_INTERVAL"; done ) </dev/null >/dev/null 2>&1 &
  HB=$!

  if [ "$BACKEND" = pi ]; then
    if ! prepare_compact_watcher || ! prepare_stale_watcher; then
      echo "[bridge-supervisor] failed to prepare restart watchers — stopping" >>"$LOG"
      break
    fi

    # The watcher handshakes above complete before Pi starts. Every launch uses
    # the same private directory and explicit continuation, including launch 1.
    launch_pi_isolated 2>>"$LOG" &
    PI_PID=$!
    PI_PGID=""
    attempts=200
    while [ "$attempts" -gt 0 ]; do
      PI_PGID=$(ps -o pgid= -p "$PI_PID" 2>/dev/null | tr -d ' ' || true)
      [ "$PI_PGID" = "$PI_PID" ] && break
      attempts=$((attempts - 1))
      sleep 0.01
    done
    if [ "$PI_PGID" != "$PI_PID" ]; then
      echo "[bridge-supervisor] failed to isolate exact Pi process group" >>"$LOG"
      kill -TERM "$PI_PID" 2>/dev/null || true
      wait "$PI_PID" 2>/dev/null || true
      rc=1
    else
      printf '%s\n' "$PI_PID" >"$PI_PID_FILE"
      printf '%s\n' "$PI_PGID" >"$PI_GROUP_FILE"
      wait "$PI_PID"
      rc=$?
      # The leader may exit before descendants. Always close the isolated group
      # with bounded TERM→KILL before the next launch.
      terminate_exact_group "$PI_PGID" "$PI_PID"
    fi

    # Closing the supervisor's writer after the exact Pi exits gives the reader
    # either the completion byte or EOF. Wait for that settled result before
    # evaluating rc, covering simultaneous completion + rc=0.
    close_compact_writer
    wait "$COMPACT_WATCHER" 2>/dev/null || true
    COMPACT_WATCHER=""
    PI_PID=""
    PI_PGID=""
  else
    if [ -z "$SUPERVISE_CMD" ]; then
      echo "[bridge-supervisor] no SUPERVISE_CMD for backend '$BACKEND' — exiting" >>"$LOG"
      break
    fi
    bash -c "$SUPERVISE_CMD" 2>>"$LOG"
    rc=$?
  fi

  stop_launch_helpers
  restart_trigger=""
  if [ "$BACKEND" = pi ] && [ -f "$RESTART_TRIGGER_FILE" ]; then
    restart_trigger=$(cat "$RESTART_TRIGGER_FILE" 2>/dev/null || true)
    rm -f "$RESTART_TRIGGER_FILE" 2>/dev/null || true
    rmdir "$RESTART_CLAIM_DIR" 2>/dev/null || true
  fi
  if [ "$rc" -eq 0 ] && [ -z "$restart_trigger" ]; then
    echo "[bridge-supervisor] $BACKEND exited cleanly (rc=0) — stopping ($(date -u +%FT%TZ))" >>"$LOG"
    rm -f "$HEARTBEAT_FILE" 2>/dev/null || true
    if [ "$BACKEND" = pi ]; then rm -f "$LOCK" 2>/dev/null || true; fi
    break
  fi
  echo "[bridge-supervisor] $BACKEND exited rc=$rc — restarting in ${RESTART_DELAY}s ($(date -u +%FT%TZ))" >>"$LOG"
  sleep "$RESTART_DELAY"
done
