#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: t3-code.sh [start|status|url|logs|stop|attach|help] [options]

Actions:
  start    Start T3 Code in tmux, or report the existing session (default)
  status   Show session status and recent output
  url      Print the latest pairing URL found in the log/pane
  logs     Print recent log lines
  stop     Kill the tmux session
  attach   Print the tmux attach command (does not attach)
  help     Show this help

Options:
  --session <name>  tmux session name (default: agent-t3code)
  --port <port>     expected T3 Code UI port (default: 3773)
  --log <path>      log path (default: /tmp/<session>.log)
USAGE
}

ACTION="start"
SESSION="agent-t3code"
PORT="3773"
LOG=""

if [[ $# -gt 0 ]]; then
  case "$1" in
    start|status|url|logs|stop|attach|help)
      ACTION="$1"
      shift
      ;;
  esac
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --session)
      [[ $# -ge 2 ]] || { echo "ERROR: --session requires a value" >&2; exit 2; }
      SESSION="$2"
      shift 2
      ;;
    --port)
      [[ $# -ge 2 ]] || { echo "ERROR: --port requires a value" >&2; exit 2; }
      PORT="$2"
      shift 2
      ;;
    --log)
      [[ $# -ge 2 ]] || { echo "ERROR: --log requires a value" >&2; exit 2; }
      LOG="$2"
      shift 2
      ;;
    -h|--help)
      ACTION="help"
      shift
      ;;
    *)
      echo "ERROR: unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -z "$LOG" ]]; then
  LOG="/tmp/${SESSION}.log"
fi

has_session() {
  tmux has-session -t "$SESSION" 2>/dev/null
}

recent_output() {
  if has_session; then
    tmux capture-pane -t "$SESSION" -p -S -160 2>/dev/null || true
  fi
  if [[ -f "$LOG" ]]; then
    tail -n 160 "$LOG" 2>/dev/null || true
  fi
}

pairing_url() {
  recent_output \
    | grep -Eoi 'https?://[^[:space:]]*(pairingUrl|pair|token)[^[:space:]]*|pairingUrl[^[:space:]]*[[:space:]]*[:=][[:space:]]*https?://[^[:space:]]+' \
    | sed 's/^[Pp]airing[Uu]rl[^:=]*[:=][[:space:]]*//' \
    | tail -n 1
}

print_summary() {
  local url
  url="$(pairing_url || true)"
  echo "T3 Code session: $SESSION"
  echo "Log: $LOG"
  echo "UI: http://localhost:${PORT}"
  if [[ -n "$url" ]]; then
    echo "Pairing URL: $url"
  else
    echo "Pairing URL: not found yet"
    echo "Inspect: tmux capture-pane -t ${SESSION} -p | grep -iE 'pair|token|url'"
  fi
  echo "Attach: tmux attach -t ${SESSION}"
  echo "Stop: tmux kill-session -t ${SESSION}"
}

case "$ACTION" in
  help)
    usage
    exit 0
    ;;
  attach)
    if has_session; then
      echo "Attach from an interactive terminal with: tmux attach -t ${SESSION}"
    else
      echo "T3 Code session '${SESSION}' is not running. Start it with: /t3 start"
      exit 1
    fi
    exit 0
    ;;
  stop)
    command -v tmux >/dev/null 2>&1 || { echo "ERROR: tmux not found in PATH" >&2; exit 1; }
    if has_session; then
      tmux kill-session -t "$SESSION"
      echo "Stopped T3 Code session: $SESSION"
    else
      echo "T3 Code session '${SESSION}' is not running."
    fi
    exit 0
    ;;
  logs)
    if [[ -f "$LOG" ]]; then
      tail -n 120 "$LOG"
    elif has_session; then
      tmux capture-pane -t "$SESSION" -p -S -120
    else
      echo "No log found at $LOG and session '${SESSION}' is not running."
      exit 1
    fi
    exit 0
    ;;
  url)
    if url="$(pairing_url || true)" && [[ -n "$url" ]]; then
      echo "$url"
    else
      echo "No pairing URL found yet for session '${SESSION}'."
      echo "Try: /t3 logs --session ${SESSION}"
      exit 1
    fi
    exit 0
    ;;
  status)
    command -v tmux >/dev/null 2>&1 || { echo "ERROR: tmux not found in PATH" >&2; exit 1; }
    if has_session; then
      echo "T3 Code is running in tmux session: $SESSION"
      print_summary
      echo
      echo "Recent output:"
      recent_output | tail -n 30
    else
      echo "T3 Code is not running in tmux session: $SESSION"
      [[ -f "$LOG" ]] && { echo "Last log path: $LOG"; tail -n 30 "$LOG"; }
      exit 1
    fi
    exit 0
    ;;
  start)
    command -v tmux >/dev/null 2>&1 || { echo "ERROR: tmux not found in PATH" >&2; exit 1; }
    command -v npx >/dev/null 2>&1 || { echo "ERROR: npx not found in PATH" >&2; exit 1; }

    echo "T3 Code requires at least one authenticated backend: Claude Code, Codex, or OpenCode."
    echo "If none is authenticated yet, run one of: claude | codex login | opencode auth login"
    echo

    if has_session; then
      echo "T3 Code session already running: $SESSION"
      print_summary
      exit 0
    fi

    mkdir -p "$(dirname "$LOG")"
    : > "$LOG"
    tmux new-session -d -s "$SESSION" "npx --yes t3 2>&1 | tee $(printf '%q' "$LOG")"
    echo "Started T3 Code in tmux session: $SESSION"

    for _ in $(seq 1 40); do
      if ! has_session; then
        echo "ERROR: T3 Code session exited during startup." >&2
        [[ -f "$LOG" ]] && tail -n 80 "$LOG" >&2
        exit 1
      fi
      if [[ -n "$(pairing_url || true)" ]]; then
        break
      fi
      sleep 0.5
    done

    print_summary
    ;;
  *)
    echo "ERROR: unknown action: $ACTION" >&2
    usage >&2
    exit 2
    ;;
esac
