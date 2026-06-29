#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: cloudflared skill <port> [--host 127.0.0.1] [--name <slug>] [--session <name>]

Starts a Cloudflare quick tunnel for a local sandbox app port in tmux.
USAGE
}

if [[ $# -lt 1 || "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

PORT=""
HOST="127.0.0.1"
NAME=""
SESSION=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host)
      HOST="${2:-}"
      shift 2
      ;;
    --name)
      NAME="${2:-}"
      shift 2
      ;;
    --session)
      SESSION="${2:-}"
      shift 2
      ;;
    --*)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
    *)
      if [[ -n "$PORT" ]]; then
        echo "Unexpected extra positional argument: $1" >&2
        usage >&2
        exit 2
      fi
      PORT="$1"
      shift
      ;;
  esac
done

if [[ -z "$PORT" || ! "$PORT" =~ ^[0-9]+$ ]]; then
  echo "PORT is required and must be numeric." >&2
  usage >&2
  exit 2
fi

if [[ -z "$HOST" ]]; then
  echo "--host cannot be empty." >&2
  exit 2
fi

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared is not installed or not in PATH." >&2
  exit 127
fi

if ! command -v tmux >/dev/null 2>&1; then
  echo "tmux is not installed or not in PATH." >&2
  exit 127
fi

SLUG="${NAME:-$PORT}"
SESSION="${SESSION:-cloudflared-$SLUG}"
LOG="/tmp/${SESSION}.log"
UPSTREAM="http://${HOST}:${PORT}"

if ! curl -fsS "$UPSTREAM" >/dev/null 2>&1; then
  cat >&2 <<EOF
Upstream did not respond: $UPSTREAM
Start the app first, then retry. Some dev servers must listen on 0.0.0.0 inside the container.
EOF
  exit 1
fi

tmux kill-session -t "$SESSION" 2>/dev/null || true
tmux new-session -d -s "$SESSION" \
  "cloudflared tunnel --url '$UPSTREAM' 2>&1 | tee '$LOG'"

printf 'Started %s for %s\n' "$SESSION" "$UPSTREAM"
printf 'Log: %s\n' "$LOG"
printf 'Waiting for trycloudflare URL...\n'

for _ in {1..20}; do
  URL=$(tmux capture-pane -t "$SESSION" -p 2>/dev/null | grep -Eo 'https://[-a-zA-Z0-9]+\.trycloudflare\.com' | tail -1 || true)
  if [[ -n "$URL" ]]; then
    printf 'URL: %s\n' "$URL"
    printf '\nInspect: tmux attach -t %q\n' "$SESSION"
    printf 'Logs:    tail -f %q\n' "$LOG"
    printf 'Stop:    tmux kill-session -t %q\n' "$SESSION"
    exit 0
  fi
  sleep 1
done

cat >&2 <<EOF
Tunnel started, but no trycloudflare URL appeared yet.
Inspect with: tmux attach -t '$SESSION'
Log file: $LOG
EOF
exit 1
