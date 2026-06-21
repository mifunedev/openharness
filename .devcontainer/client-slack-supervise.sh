#!/usr/bin/env bash
# Self-healing supervisor for the dedicated Slack bridge (client-slack tmux session).
#
# Launched by .devcontainer/entrypoint.sh with the PI_SLACK_* tokens already in
# the environment and HARNESS / BRIDGE_ENTRY / LOG exported.
#
# Why this exists: pi-messenger-bridge binds its long-lived Slack socket to a
# session-scoped pi ctx. When pi replaces the session (compaction, fork, switch,
# reload) that ctx goes stale and every subsequent Slack message throws
# "extension ctx is stale after session replacement or reload" — the package has
# no recovery hook, so the bridge silently stops responding while the process
# keeps running. This loop restarts pi on that signature (and on any crash),
# clearing the single-instance lock each time so the fresh process reconnects.
#
# pi runs in the FOREGROUND piped to `tee` so `--mode rpc` keeps stdin on the
# pty and stays alive at idle (a backgrounded pi gets stdin EOF / SIGTTIN and
# exits). A clean pi exit (rc=0) stops the loop; a crash or watchdog-kill
# (rc!=0) restarts it.
#
# NOTE: intentionally no `set -e` — pkill/kill return non-zero when there is
# nothing to signal, which is normal control flow here, not an error.
set -u

HARNESS="${HARNESS:-/home/sandbox/harness}"
BRIDGE_ENTRY="${BRIDGE_ENTRY:-$HARNESS/.pi/bridge/node_modules/pi-messenger-bridge/dist/index.js}"
LOG="${LOG:-/tmp/client-slack.log}"
LOCK="$HOME/.pi/msg-bridge.lock"

cd "$HARNESS" 2>/dev/null || true

while true; do
  rm -f "$LOCK" 2>/dev/null || true
  echo "[bridge-supervisor] launching pi bridge ($(date -u +%FT%TZ))" >>"$LOG"

  # Watchdog: tail from end-of-file (old stale-ctx lines never re-trigger) and
  # kill the bridge pi — matched by its unique --extension path — on the first
  # stale-ctx line, so the loop relaunches a fresh, non-stale process. Fully
  # redirected so it never holds the supervisor's stdout pipe open.
  ( tail -Fn0 "$LOG" 2>/dev/null | grep -m1 'ctx is stale' >/dev/null 2>&1 \
      && { echo "[bridge-supervisor] stale-ctx detected — restarting pi ($(date -u +%FT%TZ))" >>"$LOG"; \
           pkill -f 'pi-messenger-bridge/dist/index.js'; } ) >/dev/null 2>&1 &
  WD=$!

  pi --extension "$BRIDGE_ENTRY" --mode rpc --approve 2>&1 | tee -a "$LOG"
  rc=${PIPESTATUS[0]}

  kill "$WD" 2>/dev/null || true
  pkill -P "$WD" 2>/dev/null || true

  if [ "$rc" -eq 0 ]; then
    echo "[bridge-supervisor] pi exited cleanly (rc=0) — stopping ($(date -u +%FT%TZ))" >>"$LOG"
    break
  fi
  echo "[bridge-supervisor] pi exited rc=$rc — restarting in 3s ($(date -u +%FT%TZ))" >>"$LOG"
  sleep 3
done
