#!/usr/bin/env bash
# gateway — start / attach / stop an external-surface client session that bridges
# the in-sandbox agent into a messaging platform (Slack today).
#
# Two backends bridge Slack, each in its OWN tmux session (naming per
# docs/connecting.md: client-<platform>-<backend>) and holding its OWN Slack
# app, so the two coexist without competing for one socket:
#
#   pi      client-slack-pi      pi-messenger-bridge, loaded via `pi --extension`
#                                under the self-healing supervisor
#                                (.devcontainer/client-slack-supervise.sh).
#   hermes  client-slack-hermes  `hermes gateway run` — Hermes' native messaging
#                                gateway.
#
# This script manages only the session LIFECYCLE. CONFIGURING the messenger
# (trusted users, channels, enable/disable) is a separate concern: the in-session
# /msg-bridge command for pi, `hermes gateway setup` for hermes.
#
# Usage:
#   gateway <pi|hermes> [--attach]   start the session (idempotent); --attach after
#   gateway <pi|hermes> --restart    kill + start the session
#   gateway <pi|hermes> --stop       stop the session
#   gateway status                   show both sessions
#
# NOTE: intentionally no `set -e` — tmux/pkill/grep return non-zero as normal
# control flow here (mirrors client-slack-supervise.sh).
set -u

HARNESS="${HARNESS:-${OH_PROJECT_ROOT:-/home/sandbox/harness}}"
SLACK_ENV="$HARNESS/.devcontainer/.env"
# TEMPORARY fork pin — keep in sync with entrypoint.sh; revert once the upstream
# thread_ts PR merges and publishes (see .pi/UPSTREAM.md).
FORK_PIN="github:ryaneggz/pi-messenger-bridge#feat/slack-thread-replies"

usage() {
  echo "Usage:"
  echo "  gateway <pi|hermes> [--attach]   start the client session (--attach after)"
  echo "  gateway <pi|hermes> --restart    restart the session"
  echo "  gateway <pi|hermes> --stop       stop the session"
  echo "  gateway status                   show both sessions"
}

# Exact session-name match — `tmux has-session -t client-slack` would prefix-match
# the sibling client-slack-hermes session, so always match the full name.
session_live() { tmux ls -F '#{session_name}' 2>/dev/null | grep -Fxq "$1"; }

ANSI_STRIP="sed -u 's/\\x1b\\[[0-9;?]*[A-Za-z]//g; s/\\r//g'"

show_status() {
  local b s
  for b in pi hermes; do
    s="client-slack-$b"
    if session_live "$s"; then echo "  ✓ $s        running   (tmux attach -t $s)"
    else                       echo "  · $s        stopped   (gateway $b)"; fi
  done
}

start_pi() {
  local session="client-slack-pi" log="/tmp/client-slack-pi.log"
  local bridge_dir="$HARNESS/.pi/bridge"
  local bridge_entry="$bridge_dir/node_modules/pi-messenger-bridge/dist/index.js"
  local recovery_entry="$HARNESS/.pi/bridge-recovery/index.ts"

  command -v pi >/dev/null 2>&1 \
    || { echo "[gateway] 'pi' not found on PATH — run inside the sandbox" >&2; return 1; }

  # Tokens (optional): source from the Compose env file if not already exported.
  # Extract only the two keys as DATA (never eval the file), never echo values.
  # Without them /msg-bridge still loads; the bridge just stays disconnected.
  if [ -z "${PI_SLACK_BOT_TOKEN:-}" ] && [ -f "$SLACK_ENV" ]; then
    local a b
    a=$(grep -E '^PI_SLACK_APP_TOKEN=' "$SLACK_ENV" | tail -1 | cut -d= -f2-)
    b=$(grep -E '^PI_SLACK_BOT_TOKEN=' "$SLACK_ENV" | tail -1 | cut -d= -f2-)
    [ -n "$a" ] && export PI_SLACK_APP_TOKEN="$a"
    [ -n "$b" ] && export PI_SLACK_BOT_TOKEN="$b"
  fi
  [ -n "${PI_SLACK_BOT_TOKEN:-}" ] \
    || echo "[gateway] no PI_SLACK_* tokens — bridge loads but stays disconnected"

  # Install the bridge if missing (same fork pin the entrypoint installs).
  if [ ! -f "$bridge_entry" ]; then
    echo "[gateway] installing pi-messenger-bridge ($FORK_PIN) …"
    npm install --prefix "$bridge_dir" --no-fund --no-audit "$FORK_PIN" \
      || { echo "[gateway] npm install failed" >&2; return 1; }
  fi

  # Seed the non-secret bridge config (preserves runtime trust grants), clear lock.
  bash "$HARNESS/.devcontainer/seed-msg-bridge.sh" "$HARNESS/.pi/msg-bridge.json" || true
  rm -f "$HOME/.pi/msg-bridge.lock" 2>/dev/null || true

  # Pass config + tokens to the session via a mode-600 runtime env file the pane
  # sources and deletes before exec — keeps secrets out of argv / ps / tmux env.
  local envf; envf=$(mktemp /tmp/client-slack-pi-env.XXXXXX) || return 1
  chmod 600 "$envf"
  {
    printf 'export HARNESS=%q\n'        "$HARNESS"
    printf 'export BRIDGE_ENTRY=%q\n'   "$bridge_entry"
    printf 'export RECOVERY_ENTRY=%q\n' "$recovery_entry"
    printf 'export LOG=%q\n'            "$log"
    [ -n "${PI_SLACK_APP_TOKEN:-}" ] && printf 'export PI_SLACK_APP_TOKEN=%q\n' "$PI_SLACK_APP_TOKEN"
    [ -n "${PI_SLACK_BOT_TOKEN:-}" ] && printf 'export PI_SLACK_BOT_TOKEN=%q\n' "$PI_SLACK_BOT_TOKEN"
  } >>"$envf"

  if tmux new-session -d -s "$session" \
       "bash -c '. \"$envf\"; rm -f \"$envf\"; exec bash \"$HARNESS/.devcontainer/client-slack-supervise.sh\"'"; then
    # pi runs interactive (no `| tee`), so mirror the pane into the log,
    # ANSI-stripped, for the stale-ctx watchdog and humans.
    tmux pipe-pane -o -t "$session" "$ANSI_STRIP >> $log" 2>/dev/null || true
  else
    rm -f "$envf"
    echo "[gateway] failed to start $session" >&2
    return 1
  fi
}

start_hermes() {
  local session="client-slack-hermes" log="/tmp/client-slack-hermes.log"
  command -v hermes >/dev/null 2>&1 \
    || { echo "[gateway] 'hermes' not found on PATH" >&2; return 1; }
  # Hermes' gateway reads its own config (hermes gateway setup / hermes secrets),
  # so no PI_SLACK_* plumbing here. Run in foreground inside the session.
  if tmux new-session -d -s "$session" "exec hermes gateway run"; then
    tmux pipe-pane -o -t "$session" "$ANSI_STRIP >> $log" 2>/dev/null || true
  else
    echo "[gateway] failed to start $session" >&2
    return 1
  fi
}

# ─── Arg parsing ──────────────────────────────────────────────────────────────
cmd="${1:-}"
case "$cmd" in
  status|--status) show_status; exit 0 ;;
  -h|--help)       usage; exit 0 ;;
  pi|hermes)       ;;
  "")              usage >&2; exit 2 ;;
  *)               echo "[gateway] unknown client/command: $cmd" >&2; usage >&2; exit 2 ;;
esac
backend="$cmd"; shift

action="start"; attach=0
case "${1:-}" in
  "")        ;;
  --attach)  attach=1 ;;
  --restart) action="restart" ;;
  --stop)    action="stop" ;;
  *)         echo "[gateway] unknown option: $1" >&2; usage >&2; exit 2 ;;
esac

session="client-slack-$backend"

case "$action" in
  stop)
    if session_live "$session"; then
      tmux kill-session -t "$session" 2>/dev/null
      echo "[gateway] stopped $session"
    else
      echo "[gateway] $session not running"
    fi
    exit 0 ;;
  restart)
    if session_live "$session"; then tmux kill-session -t "$session" 2>/dev/null; echo "[gateway] killed $session"; fi ;;
esac

if session_live "$session"; then
  echo "[gateway] $session already running"
else
  echo "[gateway] starting $session …"
  case "$backend" in
    pi)     start_pi     || exit 1 ;;
    hermes) start_hermes || exit 1 ;;
  esac
  echo "[gateway] $session started"
fi

if [ "$attach" -eq 1 ]; then
  exec tmux attach -t "$session"
fi
echo "[gateway] attach with:  tmux attach -t $session"
