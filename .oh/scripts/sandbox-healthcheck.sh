#!/usr/bin/env bash

set -u

HARNESS="${HARNESS:-${OH_PROJECT_ROOT:-/home/sandbox/harness}}"
TMUX_BIN="${TMUX_BIN:-tmux}"
SYSTEMCTL_BIN="${SYSTEMCTL_BIN:-systemctl}"
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

require_unit() {
  local unit="$1"
  if ! "$SYSTEMCTL_BIN" is-active --quiet "$unit"; then
    record_failure "systemd unit not active: $unit"
  fi
}

oh_config_truthy() {
  local filter="$1" config="$HARNESS/oh.json"
  [ -f "$config" ] || return 1
  command_exists jq || return 1
  case "$(jq -r "$filter // false" "$config" 2>/dev/null | tr '[:upper:]' '[:lower:]')" in
    1|true|yes|on) return 0 ;;
    *) return 1 ;;
  esac
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

if ! command_exists "$SYSTEMCTL_BIN"; then
  record_failure "systemctl binary not found: $SYSTEMCTL_BIN"
else
  require_unit openharness-bootstrap.service

  if [ -f "$HARNESS/.oh/scripts/cron-runtime.ts" ]; then
    require_unit openharness-cron.service
  fi
fi

if ! command_exists "$TMUX_BIN"; then
  record_failure "tmux binary not found: $TMUX_BIN"
else
  if oh_config_truthy '.hermesDashboard.enabled' && command_exists "$HERMES_BIN"; then
    require_session app-hermes-dashboard
  fi

  slack_app_token="${PI_SLACK_APP_TOKEN:-$(compose_env_value PI_SLACK_APP_TOKEN)}"
  slack_bot_token="${PI_SLACK_BOT_TOKEN:-$(compose_env_value PI_SLACK_BOT_TOKEN)}"
  if has_value "$slack_app_token" && has_value "$slack_bot_token"; then
    if command_exists "$PI_BIN"; then
      require_session client-slack-pi
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
