#!/usr/bin/env bash
set -euo pipefail

HARNESS="${OH_PROJECT_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)}"
SLACK_ENV="$HARNESS/.devcontainer/.env"
BRIDGE_CONFIG="${ESCALATE_BRIDGE_CONFIG:-$HOME/.pi/msg-bridge.json}"
STATE_DIR="${ESCALATE_STATE_DIR:-$HOME/.oh/escalate}"
LOG_FILE="${ESCALATE_LOG:-$HARNESS/.oh/logs/escalations.jsonl}"
QUIET_HOURS="${ESCALATE_QUIET_HOURS:-12}"

summary='' needs='' tried='' link='' key='' channel='' dry_run=0 force=0
while [ $# -gt 0 ]; do
  case $1 in
    --summary) summary=${2:-}; shift 2 ;;
    --needs)   needs=${2:-};   shift 2 ;;
    --tried)   tried=${2:-};   shift 2 ;;
    --link)    link=${2:-};    shift 2 ;;
    --key)     key=${2:-};     shift 2 ;;
    --channel) channel=${2:-}; shift 2 ;;
    --dry-run) dry_run=1; shift ;;
    --force)   force=1;   shift ;;
    *) echo "escalate: unknown argument: $1" >&2; exit 64 ;;
  esac
done

[ -n "$summary" ] || { echo 'escalate: --summary is required' >&2; exit 64; }
[ -n "$needs" ]   || { echo 'escalate: --needs is required — an escalation names the decision only a human can make' >&2; exit 64; }

record() {
  mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null || return 0
  printf '%s\n' "$1" >>"$LOG_FILE" 2>/dev/null || true
}

noop() {
  printf 'escalate: no-op — %s; the operator was NOT reached\n' "$1" >&2
  entry=$(jq -c -n --arg at "$(date -u +%FT%TZ)" --arg reason "$1" --arg channel "${channel:-}" \
    --arg summary "$summary" --arg needs "$needs" --arg tried "$tried" --arg link "$link" --arg key "$key" \
    '{at:$at,ok:false,skipped:true,reason:$reason,channel:$channel,summary:$summary,needs:$needs,tried:$tried,link:$link,key:$key}')
  record "$entry"
  jq -n --arg reason "$1" --arg channel "${channel:-}" '{ok:false,skipped:true,reason:$reason,channel:$channel}'
  exit 0
}

if [ -z "${PI_SLACK_BOT_TOKEN:-}" ] && [ -f "$SLACK_ENV" ]; then
  t=$(grep -E '^PI_SLACK_BOT_TOKEN=' "$SLACK_ENV" | tail -1 | cut -d= -f2-)
  [ -n "$t" ] && export PI_SLACK_BOT_TOKEN="$t"
  unset t
fi
[ -n "${PI_SLACK_BOT_TOKEN:-}" ] || noop 'no PI_SLACK_BOT_TOKEN in the environment or .devcontainer/.env'

if [ -z "$channel" ]; then
  [ -f "$BRIDGE_CONFIG" ] || noop "no --channel and no bridge config at $BRIDGE_CONFIG"
  channel=$(jq -r 'first((.auth.channels // {}) | to_entries[] | select(.value.enabled == true) | .key) // empty' "$BRIDGE_CONFIG")
  [ -n "$channel" ] || noop "no enabled channel in $BRIDGE_CONFIG"
fi

host=$(hostname 2>/dev/null || echo unknown)
branch=$(git -C "$HARNESS" rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)
text=$(printf '*Escalation from an unattended session*\n\n%s\n\n*Needs a human to:* %s' "$summary" "$needs")
[ -n "$tried" ] && text=$(printf '%s\n\n*Already tried:* %s' "$text" "$tried")
[ -n "$link" ]  && text=$(printf '%s\n\n%s' "$text" "$link")
text=$(printf '%s\n\n_%s · %s · %s_' "$text" "$host" "$branch" "$(date -u +%FT%TZ)")

if [ "$dry_run" -eq 1 ]; then
  jq -n --arg channel "$channel" --arg text "$text" '{dryRun:true,channel:$channel,text:$text}'
  exit 0
fi

slack_api() {
  curl -sS --max-time "${ESCALATE_TIMEOUT:-10}" "https://slack.com/api/$1" \
    -H @<(printf 'Authorization: Bearer %s\n' "$PI_SLACK_BOT_TOKEN") "${@:2}"
}

health=$(slack_api conversations.info -G --data-urlencode "channel=$channel") \
  || noop "Slack unreachable while checking channel $channel"
if [ "$(jq -r '.ok' <<<"$health")" != true ]; then
  noop "channel $channel unavailable: $(jq -r '.error // "unknown"' <<<"$health")"
fi
if [ "$(jq -r '.channel.is_archived // false' <<<"$health")" = true ]; then
  noop "channel $channel is archived"
fi

if [ -n "$key" ] && [ "$force" -eq 0 ]; then
  mkdir -p "$STATE_DIR"
  marker="$STATE_DIR/$(printf '%s' "$key" | tr -c 'A-Za-z0-9._-' '_')"
  if [ -f "$marker" ]; then
    last=$(cat "$marker" 2>/dev/null || echo 0)
    age=$(( $(date -u +%s) - last ))
    if [ "$age" -lt $(( QUIET_HOURS * 3600 )) ]; then
      printf 'escalate: suppressed — key %s already escalated %sh ago (quiet window %sh); use --force to override\n' \
        "$key" "$(( age / 3600 ))" "$QUIET_HOURS" >&2
      exit 75
    fi
  fi
fi

payload=$(jq -n --arg channel "$channel" --arg text "$text" '{channel:$channel,text:$text}')
response=$(printf '%s' "$payload" | curl -sS -X POST https://slack.com/api/chat.postMessage \
  -H 'Content-Type: application/json; charset=utf-8' \
  -H @<(printf 'Authorization: Bearer %s\n' "$PI_SLACK_BOT_TOKEN") \
  --data @- ) || noop 'transport failure calling chat.postMessage'

if [ "$(jq -r '.ok' <<<"$response")" != true ]; then
  noop "Slack rejected the message: $(jq -r '.error // "unknown"' <<<"$response")"
fi

[ -n "$key" ] && { mkdir -p "$STATE_DIR"; date -u +%s >"$STATE_DIR/$(printf '%s' "$key" | tr -c 'A-Za-z0-9._-' '_')"; }
record "$(jq -c -n --arg at "$(date -u +%FT%TZ)" --arg channel "$channel" --arg ts "$(jq -r .ts <<<"$response")" \
  --arg summary "$summary" --arg needs "$needs" --arg tried "$tried" --arg link "$link" --arg key "$key" \
  '{at:$at,ok:true,channel:$channel,ts:$ts,summary:$summary,needs:$needs,tried:$tried,link:$link,key:$key}')"
jq -c '{ok,channel,ts}' <<<"$response"
