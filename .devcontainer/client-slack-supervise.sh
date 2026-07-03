#!/usr/bin/env bash
# Self-healing supervisor for the dedicated Slack bridge (client-slack-pi tmux session).
#
# Launched by .devcontainer/entrypoint.sh with the PI_SLACK_* tokens already in
# the environment and HARNESS / BRIDGE_ENTRY / RECOVERY_ENTRY / LOG exported.
#
# Why this exists: pi-messenger-bridge binds its long-lived Slack socket to a
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
# A clean pi exit (rc=0) stops the loop; a crash or watchdog-kill (rc!=0)
# restarts it.
#
# NOTE: intentionally no `set -e` — pkill/kill return non-zero when there is
# nothing to signal, which is normal control flow here, not an error.
set -u

HARNESS="${HARNESS:-${OH_PROJECT_ROOT:-/home/sandbox/harness}}"
BRIDGE_ENTRY="${BRIDGE_ENTRY:-$HARNESS/.pi/bridge/node_modules/pi-messenger-bridge/dist/index.js}"
RECOVERY_ENTRY="${RECOVERY_ENTRY:-$HARNESS/.pi/bridge-recovery/index.ts}"
LOG="${LOG:-/tmp/client-slack-pi.log}"
LOCK="$HOME/.pi/msg-bridge.lock"

cd "$HARNESS" 2>/dev/null || true

while true; do
  rm -f "$LOCK" 2>/dev/null || true
  echo "[bridge-supervisor] launching pi bridge ($(date -u +%FT%TZ))" >>"$LOG"

  # Watchdog: tail $LOG from end-of-file (old stale-ctx lines never re-trigger),
  # strip ANSI/CR so a TUI-rendered error is still greppable, and kill the bridge
  # pi — matched by its unique --extension path — on the first stale-ctx line so
  # the loop relaunches a fresh, non-stale process. Fully redirected (incl. stdin
  # from /dev/null) so it never reads the pane pty or holds a stdout pipe open.
  ( tail -Fn0 "$LOG" 2>/dev/null \
      | sed -u 's/\x1b\[[0-9;?]*[A-Za-z]//g; s/\r//g' \
      | grep -m1 'ctx is stale' >/dev/null 2>&1 \
      && { echo "[bridge-supervisor] stale-ctx detected — restarting pi ($(date -u +%FT%TZ))" >>"$LOG"; \
           pkill -f 'pi-messenger-bridge/dist/index.js'; } ) </dev/null >/dev/null 2>&1 &
  WD=$!

  # Interactive TTY launch: stdin+stdout = pane pty (-> interactive mode, no JSON
  # flood, stays alive at idle), stderr -> $LOG. No pipe, no --mode rpc.
  pi --extension "$BRIDGE_ENTRY" --extension "$RECOVERY_ENTRY" --approve 2>>"$LOG"
  rc=$?

  kill "$WD" 2>/dev/null || true
  pkill -P "$WD" 2>/dev/null || true

  if [ "$rc" -eq 0 ]; then
    echo "[bridge-supervisor] pi exited cleanly (rc=0) — stopping ($(date -u +%FT%TZ))" >>"$LOG"
    break
  fi
  echo "[bridge-supervisor] pi exited rc=$rc — restarting in 3s ($(date -u +%FT%TZ))" >>"$LOG"
  sleep 3
done
