#!/usr/bin/env bash
# Self-healing supervisor for client-slack-<backend> tmux sessions.
#
# Pi uses one isolated persistent session directory and always launches with
# --continue, so a post-compaction reconnect reopens the compacted active path
# instead of starting a bare session. The bridge package owns the authenticated
# Slack compact request, exact chat/thread acknowledgement, ctx.compact call,
# and Slack disconnect. This supervisor owns only process/session continuity.
#
# Compact completion crosses that boundary through a per-launch Unix-domain
# socket. Its mode-0600 listener is ready before Pi starts and accepts the
# completion byte only from the exact supervised Pi PID, authenticated with
# Linux SO_PEERCRED plus direct-child/session/group identity. The pathname is
# rendezvous metadata, not a secret: tool children may discover it but have a
# different peer PID and are rejected.
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
SUPERVISOR_PID=$$
LAUNCHES=0
HB=""
COMPACT_WATCHER=""
STALE_WATCHER=""
PI_PID=""
PI_PGID=""
IPC_SOCKET=""
IPC_READY=""
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
    # /proc children is a single whitespace-delimited PID record by contract.
    # shellcheck disable=SC2013
    for child in $(cat "/proc/$pid/task/$pid/children" 2>/dev/null); do
      terminate_exact_tree "$child"
    done
  fi
  kill -TERM "$pid" 2>/dev/null || true
}

terminate_exact_pid() {
  local pid="$1" attempts=200
  case "$pid" in ''|*[!0-9]*) return 0 ;; esac
  kill -TERM "$pid" 2>/dev/null || true
  while kill -0 "$pid" 2>/dev/null && [ "$attempts" -gt 0 ]; do
    attempts=$((attempts - 1))
    sleep 0.01
  done
  if kill -0 "$pid" 2>/dev/null; then kill -KILL "$pid" 2>/dev/null || true; fi
}

# Pi launches as the supervisor's direct child in a fresh session/process group
# whose SID/PGID equal its PID. Revalidate that exact identity before signaling;
# PID/PGID state files are observability only and are never sufficient authority.
is_exact_supervised_leader() {
  local leader="$1" identity ppid pgid sid
  case "$leader" in ''|*[!0-9]*) return 1 ;; esac
  identity=$(ps -o ppid=,pgid=,sid= -p "$leader" 2>/dev/null) || return 1
  read -r ppid pgid sid <<<"$identity"
  [ "$ppid" = "$SUPERVISOR_PID" ] && [ "$pgid" = "$leader" ] && [ "$sid" = "$leader" ]
}

# Signal only the revalidated group. TERM gets a bounded grace period, then KILL
# closes stubborn descendants without touching sibling Pi/Hermes jobs.
terminate_exact_group() {
  local pgid="$1" leader="$2" attempts=200
  case "$pgid:$leader" in *[!0-9:]*) return 0 ;; esac
  [ -n "$pgid" ] && [ "$pgid" = "$leader" ] || return 0
  is_exact_supervised_leader "$leader" || return 0
  kill -TERM -- "-$pgid" 2>/dev/null || true
  while kill -0 -- "-$pgid" 2>/dev/null && [ "$attempts" -gt 0 ]; do
    attempts=$((attempts - 1))
    sleep 0.01
  done
  if kill -0 -- "-$pgid" 2>/dev/null; then
    kill -KILL -- "-$pgid" 2>/dev/null || true
  fi
}

# A group reaching this helper was established while its leader was alive:
# either SO_PEERCRED plus direct-child SID/PGID authenticated the compact peer,
# or the supervisor itself observed its just-launched child at SID=PGID=PID.
# Keep that exact group identity usable after the leader exits so descendants
# cannot escape.
terminate_authenticated_group() {
  local pgid="$1" attempts=50
  case "$pgid" in ''|*[!0-9]*) return 0 ;; esac
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
  local kind="$1" authenticated_pid="${2:-}" pid pgid attempts=500
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
  if [ "$kind" = compact ] && [ -n "$authenticated_pid" ]; then
    terminate_authenticated_group "$authenticated_pid"
    return 0
  else
    while { [ ! -s "$PI_PID_FILE" ] || [ ! -s "$PI_GROUP_FILE" ]; } && [ "$attempts" -gt 0 ]; do
      attempts=$((attempts - 1))
      sleep 0.01
    done
    pid=$(cat "$PI_PID_FILE" 2>/dev/null || true)
    pgid=$(cat "$PI_GROUP_FILE" 2>/dev/null || true)
  fi
  terminate_exact_group "$pgid" "$pid"
}

stop_launch_helpers() {
  if [ -n "$COMPACT_WATCHER" ]; then
    terminate_exact_tree "$COMPACT_WATCHER"
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
  unset PI_MSG_BRIDGE_COMPACT_SOCKET
  rm -f "$PI_PID_FILE" "$PI_GROUP_FILE" "$IPC_SOCKET" "$IPC_READY" "$IPC_SETTLED" 2>/dev/null || true
  IPC_SOCKET=""; IPC_READY=""; IPC_SETTLED=""
}

cleanup_all() {
  local live_pgid=""
  [ "$STOPPING" -eq 0 ] || return 0
  STOPPING=1
  if [ -n "$PI_PID" ]; then
    live_pgid="$PI_PGID"
    if [ -z "$live_pgid" ]; then
      live_pgid=$(ps -o pgid= -p "$PI_PID" 2>/dev/null | tr -d ' ' || true)
    fi
    if [ "$live_pgid" = "$PI_PID" ]; then
      terminate_exact_group "$live_pgid" "$PI_PID"
    else
      # Signal can arrive between fork and setsid/PGID observation. Kill the
      # exact not-yet-isolated leader rather than leaving that launch orphaned.
      terminate_exact_pid "$PI_PID"
    fi
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
  IPC_SOCKET="$base.sock"
  IPC_READY="$base.ready"
  IPC_SETTLED="$base.settled"

  (
    local authenticated_pid="" rc=1
    authenticated_pid=$(python3 - "$IPC_SOCKET" "$IPC_READY" "$SUPERVISOR_PID" <<'PY'
import os
import socket
import struct
import sys

socket_path, ready_path, supervisor_pid_text = sys.argv[1:]
supervisor_pid = int(supervisor_pid_text)
server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
try:
    if not hasattr(socket, "SO_PEERCRED"):
        raise RuntimeError("Linux SO_PEERCRED is required")
    try:
        os.unlink(socket_path)
    except FileNotFoundError:
        pass
    server.bind(socket_path)
    os.chmod(socket_path, 0o600)
    server.listen(16)
    with open(ready_path, "x", encoding="utf-8"):
        pass

    while True:
        connection, _ = server.accept()
        try:
            credentials = connection.getsockopt(
                socket.SOL_SOCKET,
                socket.SO_PEERCRED,
                struct.calcsize("3i"),
            )
            peer_pid, _peer_uid, _peer_gid = struct.unpack("3i", credentials)
            with open(f"/proc/{peer_pid}/stat", encoding="utf-8") as stat_file:
                stat = stat_file.read()
            fields = stat[stat.rfind(")") + 2 :].split()
            peer_ppid = int(fields[1])
            peer_pgid = int(fields[2])
            peer_sid = int(fields[3])
            if (
                peer_ppid != supervisor_pid
                or peer_pgid != peer_pid
                or peer_sid != peer_pid
            ):
                continue
            if connection.recv(2) == b"C":
                connection.sendall(b"A")
                print(peer_pid, flush=True)
                sys.exit(0)
        except (FileNotFoundError, ProcessLookupError, ValueError):
            continue
        finally:
            connection.close()
finally:
    server.close()
    try:
        os.unlink(socket_path)
    except FileNotFoundError:
        pass
PY
    )
    rc=$?
    if [ "$rc" -eq 0 ] && [[ "$authenticated_pid" =~ ^[0-9]+$ ]]; then
      claim_restart_and_signal compact "$authenticated_pid"
    elif [ "$rc" -ne 143 ]; then
      echo "[bridge-supervisor] compact peer listener exited without an authenticated Pi PID (rc=$rc)" >>"$LOG"
    fi
    : >"$IPC_SETTLED"
    exit "$rc"
  ) </dev/null >/dev/null 2>&1 &
  COMPACT_WATCHER=$!

  wait_for_file "$IPC_READY" || return 1
  [ "$(stat -c %a "$IPC_SOCKET" 2>/dev/null || true)" = 600 ] || return 1
  export PI_MSG_BRIDGE_COMPACT_SOCKET="$IPC_SOCKET"
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
      terminate_exact_pid "$PI_PID"
      wait "$PI_PID" 2>/dev/null || true
      rc=1
    else
      printf '%s\n' "$PI_PID" >"$PI_PID_FILE"
      printf '%s\n' "$PI_PGID" >"$PI_GROUP_FILE"
      wait "$PI_PID"
      rc=$?
      # The leader may exit before descendants. Always close the isolated group
      # with bounded TERM→KILL before the next launch.
      terminate_authenticated_group "$PI_PGID"
    fi

    # Give an authenticated listener a bounded window to publish its restart
    # claim after acknowledging the byte. A clean unrelated exit leaves the
    # one-shot listener waiting, so stop it after that window. Settle either
    # path before evaluating rc, including simultaneous completion + rc=0.
    if ! wait_for_file "$IPC_SETTLED" 100; then
      terminate_exact_tree "$COMPACT_WATCHER"
    fi
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
