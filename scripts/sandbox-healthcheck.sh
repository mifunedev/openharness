#!/usr/bin/env bash
# Healthcheck for the Open Harness sandbox container.
#
# Docker can keep the container process alive (`sleep infinity`) even when the
# tmux-managed runtime services that make the sandbox useful have died. This
# script reports those runtime failures through Docker/Compose health status.

set -u

HARNESS="${HARNESS:-/home/sandbox/harness}"
TMUX_BIN="${TMUX_BIN:-tmux}"
HERMES_BIN="${HERMES_BIN:-hermes}"
PI_BIN="${PI_BIN:-pi}"

failures=()

record_failure() {
  failures+=("$1")
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

run_tmux() {
  if [ "$(id -u)" = "0" ] && command_exists gosu && id sandbox >/dev/null 2>&1; then
    gosu sandbox "$TMUX_BIN" "$@"
  else
    "$TMUX_BIN" "$@"
  fi
}

has_session() {
  run_tmux has-session -t "$1" >/dev/null 2>&1
}

require_session() {
  local session="$1"
  if ! has_session "$session"; then
    record_failure "missing required tmux session: $session"
  fi
}

compose_env_value() {
  local key="$1"
  local env_file="$HARNESS/.devcontainer/.env"
  [ -f "$env_file" ] || return 0
  grep -E "^${key}=" "$env_file" 2>/dev/null | tail -1 | cut -d= -f2-
}

has_value() {
  local value="${1:-}"
  [ -n "$value" ] && [ "$value" != "''" ] && [ "$value" != '""' ]
}

require_file() {
  local label="$1"
  local file="$2"
  if [ ! -f "$file" ]; then
    record_failure "missing $label: $file"
  fi
}

check_slack_bridge_log() {
  local log_file="${SLACK_BRIDGE_LOG:-/tmp/client-slack.log}"
  if [ ! -f "$log_file" ]; then
    record_failure "Slack tokens configured but bridge log not found: $log_file"
    return
  fi

  if grep -Eiq 'Cannot find module|ERR_MODULE_NOT_FOUND|invalid_auth|not_authed|account_inactive|Socket Mode.*(error|failed)|pi exited rc=|restarting in 3s' "$log_file"; then
    record_failure "Slack bridge log contains startup/auth/runtime failure signal: $log_file"
  fi

  if ! grep -Fq '[Slack] Bot user ID:' "$log_file"; then
    record_failure "Slack tokens configured but bridge has not reported Socket Mode readiness: $log_file"
  fi
}

if ! command_exists "$TMUX_BIN"; then
  record_failure "tmux binary not found: $TMUX_BIN"
else
  if has_session system-cron; then
    record_failure "legacy tmux session present: system-cron blocks cron-system startup"
  fi

  if [ -f "$HARNESS/scripts/cron-runtime.ts" ]; then
    require_session cron-watchdog
    require_session cron-system
  fi

  if [ "${HERMES_DASHBOARD:-false}" = "true" ] && command_exists "$HERMES_BIN"; then
    require_session app-hermes-dashboard
  fi

  slack_app_token="${PI_SLACK_APP_TOKEN:-$(compose_env_value PI_SLACK_APP_TOKEN)}"
  slack_bot_token="${PI_SLACK_BOT_TOKEN:-$(compose_env_value PI_SLACK_BOT_TOKEN)}"
  if has_value "$slack_app_token" || has_value "$slack_bot_token"; then
    if ! has_value "$slack_app_token" || ! has_value "$slack_bot_token"; then
      record_failure "Slack bridge partially configured: both PI_SLACK_APP_TOKEN and PI_SLACK_BOT_TOKEN are required"
    elif command_exists "$PI_BIN"; then
      require_session client-slack
      require_file "Slack bridge entrypoint" "${SLACK_BRIDGE_ENTRY:-$HARNESS/.pi/bridge/node_modules/pi-messenger-bridge/dist/index.js}"
      require_file "Slack bridge config" "${SLACK_BRIDGE_CONFIG:-/home/sandbox/.pi/msg-bridge.json}"
      check_slack_bridge_log
    else
      record_failure "Slack tokens configured but Pi binary not found: $PI_BIN"
    fi
  fi
fi

if [ "${#failures[@]}" -gt 0 ]; then
  printf 'sandbox healthcheck failed:\n' >&2
  printf -- '- %s\n' "${failures[@]}" >&2
  exit 1
fi

printf 'sandbox healthcheck ok\n'
