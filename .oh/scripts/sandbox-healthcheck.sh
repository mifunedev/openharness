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
  run_tmux has-session -t "=$1" >/dev/null 2>&1
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

if ! command_exists "$TMUX_BIN"; then
  record_failure "tmux binary not found: $TMUX_BIN"
else
  if has_session system-cron; then
    record_failure "legacy tmux session present: system-cron blocks cron-system startup"
  fi

  if [ -f "$HARNESS/.oh/scripts/cron-runtime.ts" ]; then
    require_session cron-watchdog
    require_session cron-system
  fi

  if [ "${HERMES_DASHBOARD:-false}" = "true" ] && command_exists "$HERMES_BIN"; then
    require_session app-hermes-dashboard
  fi

  slack_app_token="${PI_SLACK_APP_TOKEN:-$(compose_env_value PI_SLACK_APP_TOKEN)}"
  slack_bot_token="${PI_SLACK_BOT_TOKEN:-$(compose_env_value PI_SLACK_BOT_TOKEN)}"
  if has_value "$slack_app_token" && has_value "$slack_bot_token"; then
    if command_exists "$PI_BIN"; then
      require_session client-slack
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
