#!/usr/bin/env bash
# gateway — start / attach / stop an external-surface client session that bridges
# the in-sandbox agent into a messaging platform (Slack today).
#
# Two backends bridge Slack, each in its OWN tmux session (naming per
# .oh/docs/connecting.md: client-<platform>-<backend>) and holding its OWN Slack
# app, so the two coexist without competing for one socket:
#
#   pi      client-slack-pi      pi-messenger-bridge, loaded via `pi --extension`
#                                under the self-healing supervisor
#                                (.devcontainer/client-slack-supervise.sh).
#   hermes  client-slack-hermes  `hermes gateway run` — Hermes' native messaging
#                                gateway.
#
# This script manages the session LIFECYCLE plus one convenience entrypoint for
# Pi bridge configuration: `gateway msg-bridge` starts the Pi client session,
# sends the bridge's in-session /msg-bridge command, then attaches when run from
# an interactive terminal. Hermes platform setup remains `hermes gateway setup`,
# but the launcher pins Hermes runtime/cwd to this harness checkout so gateway
# chats route tools into ~/harness instead of the shell's home directory.
#
# Usage:
#   gateway <pi|hermes> [--attach]      start the session (idempotent); --attach after
#   gateway <pi|hermes> --restart       kill + start the session
#   gateway <pi|hermes> --stop          stop the session
#   gateway msg-bridge [--no-attach]    open the Pi /msg-bridge config UI
#   gateway status                      show both sessions
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
  echo "  gateway <pi|hermes> [--attach]      start the client session (--attach after)"
  echo "  gateway <pi|hermes> --restart       restart the session"
  echo "  gateway <pi|hermes> --stop          stop the session"
  echo "  gateway msg-bridge [--no-attach]    open the Pi /msg-bridge config UI"
  echo "  gateway status                      show both sessions"
}

msg_bridge_usage() {
  echo "Usage:"
  echo "  gateway msg-bridge [--attach|--no-attach]"
  echo
  echo "Starts client-slack-pi if needed, sends /msg-bridge to the Pi TUI,"
  echo "then attaches automatically when stdin/stdout are interactive."
}

# Exact session-name match — `tmux has-session -t client-slack` would prefix-match
# the sibling client-slack-hermes session, so always match the full name.
session_live() { tmux ls -F '#{session_name}' 2>/dev/null | grep -Fxq "$1"; }

ANSI_STRIP="sed -u 's/\\x1b\\[[0-9;?]*[A-Za-z]//g; s/\\r//g'"

# Non-secret runtime state the supervisor writes (see client-slack-supervise.sh):
# $STATE_DIR/<backend>.{state,heartbeat,stale}. Used to report health, not just
# session existence, in `gateway status`.
STATE_DIR="${GATEWAY_STATE_DIR:-$HOME/.pi/gateway}"
STALE_AFTER="${GATEWAY_STALE_AFTER:-60}"   # seconds without a heartbeat => not healthy

# Parse a key from a state file as DATA (grep/cut, never source/eval).
_state_kv() {
  [ -f "$1" ] || return 1
  local line; line=$(grep -E "^$2=" "$1" 2>/dev/null | tail -1) || return 1
  [ -n "$line" ] || return 1
  printf '%s' "${line#*=}"
}

# Seconds since the epoch timestamp in $1, or non-zero if unreadable/non-numeric.
_state_age() {
  [ -f "$1" ] || return 1
  local t; t=$(cat "$1" 2>/dev/null) || return 1
  case "$t" in ''|*[!0-9]*) return 1 ;; esac
  printf '%s' "$(( $(date -u +%s) - t ))"
}

# Human health phrase for a LIVE backend session, from its state files.
backend_health() {
  local b="$1"
  local state="$STATE_DIR/$b.state" hb="$STATE_DIR/$b.heartbeat" stale="$STATE_DIR/$b.stale"
  local token launches hbage staleage extra=""
  launches=$(_state_kv "$state" launches) || launches=""
  if [ -n "$launches" ] && [ "$launches" -gt 1 ] 2>/dev/null; then extra=" · $((launches - 1)) restart(s)"; fi
  if staleage=$(_state_age "$stale"); then extra="$extra · recovered ${staleage}s ago"; fi
  token=$(_state_kv "$state" bridge_token) || token=""
  if [ "$token" = absent ]; then printf 'running · disconnected (no PI_SLACK token)%s' "$extra"; return 0; fi
  if hbage=$(_state_age "$hb") && [ "$hbage" -le "$STALE_AFTER" ] 2>/dev/null; then
    printf 'healthy%s' "$extra"
  else
    printf 'recovering%s' "$extra"
  fi
}

show_status() {
  local b s health
  for b in pi hermes; do
    s="client-slack-$b"
    if session_live "$s"; then
      if [ -f "$STATE_DIR/$b.state" ]; then
        health=$(backend_health "$b")
        case "$health" in
          healthy*)     echo "  ✓ $s  $health   (tmux attach -t $s)" ;;
          *disconnect*) echo "  ⚠ $s  $health   (tmux attach -t $s)" ;;
          *)            echo "  ⟳ $s  $health   (tmux attach -t $s)" ;;
        esac
      else
        echo "  ✓ $s  running   (tmux attach -t $s)"
      fi
    else
      echo "  · $s  stopped   (gateway $b)"
    fi
  done
}

open_msg_bridge() {
  local session="client-slack-pi" attach="auto"
  case "${1:-}" in
    "") ;;
    --attach) attach="yes" ;;
    --no-attach) attach="no" ;;
    -h|--help|help) msg_bridge_usage; return 0 ;;
    *) echo "[gateway] unknown msg-bridge option: $1" >&2; msg_bridge_usage >&2; return 2 ;;
  esac
  if [ -n "${2:-}" ]; then
    echo "[gateway] unexpected msg-bridge argument: $2" >&2
    msg_bridge_usage >&2
    return 2
  fi

  if session_live "$session"; then
    echo "[gateway] $session already running"
  else
    echo "[gateway] starting $session …"
    start_pi || return 1
    echo "[gateway] $session started"
  fi

  if tmux send-keys -t "$session" "/msg-bridge" C-m 2>/dev/null; then
    echo "[gateway] sent /msg-bridge to $session"
  else
    echo "[gateway] failed to send /msg-bridge to $session" >&2
    echo "[gateway] attach manually: tmux attach -t $session" >&2
    return 1
  fi

  if [ "$attach" = "yes" ] || { [ "$attach" = "auto" ] && [ -t 0 ] && [ -t 1 ]; }; then
    exec tmux attach -t "$session"
  fi
  echo "[gateway] attach with:  tmux attach -t $session"
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

hermes_teams_configured() {
  local hermes_home="$1"
  local env_file="$hermes_home/.env"
  if [ -n "${TEAMS_CLIENT_ID:-}" ] || [ -n "${CLIENT_ID:-}" ]; then
    return 0
  fi
  [ -f "$env_file" ] && grep -Eq '^[[:space:]]*(export[[:space:]]+)?(TEAMS_CLIENT_ID|CLIENT_ID)=' "$env_file"
}

sync_hermes_teams_env_aliases() {
  local hermes_home="$1"
  local env_file="$hermes_home/.env"
  [ -f "$env_file" ] || return 0
  command -v python3 >/dev/null 2>&1 || return 0
  python3 - "$env_file" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
try:
    lines = path.read_text(encoding="utf-8").splitlines()
except FileNotFoundError:
    raise SystemExit(0)

values = {}
for line in lines:
    stripped = line.strip()
    if not stripped or stripped.startswith("#") or "=" not in stripped:
        continue
    if stripped.startswith("export "):
        stripped = stripped[len("export "):].lstrip()
    key, raw_value = stripped.split("=", 1)
    key = key.strip()
    if key:
        values.setdefault(key, raw_value)

aliases = {
    "TEAMS_CLIENT_ID": "CLIENT_ID",
    "TEAMS_CLIENT_SECRET": "CLIENT_SECRET",
    "TEAMS_TENANT_ID": "TENANT_ID",
}
additions = [f"{dest}={values[src]}" for dest, src in aliases.items() if dest not in values and values.get(src)]
if not additions:
    raise SystemExit(0)
if lines and lines[-1].strip():
    lines.append("")
lines.append("# Microsoft Teams Bot Framework credentials (Hermes expects TEAMS_* names).")
lines.extend(additions)
path.write_text("\n".join(lines) + "\n", encoding="utf-8")
PY
}

ensure_hermes_teams_deps() {
  local hermes_home="$1" py="/usr/local/lib/hermes-agent/venv/bin/python"
  hermes_teams_configured "$hermes_home" || return 0
  [ -x "$py" ] || return 0

  if "$py" - <<'PY' >/dev/null 2>&1
import importlib.util
raise SystemExit(0 if importlib.util.find_spec("aiohttp") and importlib.util.find_spec("microsoft_teams") else 1)
PY
  then
    return 0
  fi

  if ! command -v uv >/dev/null 2>&1; then
    echo "[gateway] Teams is configured but Hermes Teams deps are missing and uv is unavailable" >&2
    echo "[gateway] install manually: uv pip install --python $py 'microsoft-teams-apps==2.0.13.4' 'aiohttp==3.14.1'" >&2
    return 1
  fi

  local venv_root; venv_root=$(dirname "$(dirname "$py")")
  echo "[gateway] installing Hermes Teams gateway dependencies into $venv_root"
  VIRTUAL_ENV="$venv_root" uv pip install --python "$py" \
    'microsoft-teams-apps==2.0.13.4' \
    'aiohttp==3.14.1' || return 1
}

ensure_hermes_gateway_cwd() {
  local hermes_home="$1" gateway_cwd="$2"
  local config_file="$hermes_home/config.yaml"
  mkdir -p "$hermes_home"
  # Hermes gateway defaults terminal.cwd to $HOME when config.yaml omits it.
  # Persist the harness cwd so relative tool/file operations route into the
  # checkout no matter where `gateway hermes` was invoked from. Patch the YAML
  # directly instead of `hermes config set` so user comments survive.
  command -v python3 >/dev/null 2>&1 || { echo "[gateway] warning: python3 unavailable; cannot persist terminal.cwd" >&2; return 0; }
  python3 - "$config_file" "$gateway_cwd" <<'PY'
from pathlib import Path
import json
import re
import sys

path = Path(sys.argv[1])
cwd = sys.argv[2]
quoted = json.dumps(cwd)
lines = path.read_text(encoding="utf-8").splitlines() if path.exists() else []

def is_top_level_key(line: str) -> bool:
    return bool(line and not line.startswith((" ", "\t")) and not line.lstrip().startswith("#") and re.match(r"^[A-Za-z0-9_][A-Za-z0-9_-]*\s*:", line))

start = next((i for i, line in enumerate(lines) if re.match(r"^terminal\s*:\s*(?:#.*)?$", line)), None)
changed = False
if start is None:
    if lines and lines[-1].strip():
        lines.append("")
    lines.extend(["terminal:", f"  cwd: {quoted}"])
    changed = True
else:
    end = len(lines)
    for i in range(start + 1, len(lines)):
        if is_top_level_key(lines[i]):
            end = i
            break
    cwd_idx = next((i for i in range(start + 1, end) if re.match(r"^\s+cwd\s*:", lines[i])), None)
    desired = f"  cwd: {quoted}"
    if cwd_idx is None:
        lines.insert(start + 1, desired)
        changed = True
    elif lines[cwd_idx] != desired:
        lines[cwd_idx] = desired
        changed = True

if changed:
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
PY
}

start_hermes() {
  local session="client-slack-hermes" log="/tmp/client-slack-hermes.log"
  local hermes_home="${HERMES_GATEWAY_HOME:-$HARNESS/.hermes}"
  local gateway_cwd="${HERMES_GATEWAY_CWD:-$HARNESS}"
  local hermes_bin="/usr/local/bin/hermes"
  if [ ! -x "$hermes_bin" ]; then
    hermes_bin=$(command -v hermes 2>/dev/null) \
      || { echo "[gateway] 'hermes' not found on PATH" >&2; return 1; }
  fi
  mkdir -p "$hermes_home"
  sync_hermes_teams_env_aliases "$hermes_home" || return 1
  ensure_hermes_teams_deps "$hermes_home" || return 1
  ensure_hermes_gateway_cwd "$hermes_home" "$gateway_cwd"

  # Hermes' gateway reads its own config (hermes gateway setup / hermes secrets),
  # so no PI_SLACK_* plumbing here. Run under the shared supervisor's GENERIC
  # crash-restart mode (no pi-specific stale-ctx/lock/recovery) so a hermes crash
  # self-heals with backoff, matching the pi backend's resilience floor.
  local run_cmd
  printf -v run_cmd 'cd %q && export HERMES_HOME=%q HERMES_GATEWAY_CWD=%q && exec %q gateway run' \
    "$gateway_cwd" "$hermes_home" "$gateway_cwd" "$hermes_bin"

  # No secrets in the hermes launch command, but use the same mode-600
  # source-then-delete env-file pattern as pi for uniformity.
  local envf; envf=$(mktemp /tmp/client-slack-hermes-env.XXXXXX) || return 1
  chmod 600 "$envf"
  {
    printf 'export HARNESS=%q\n'         "$HARNESS"
    printf 'export LOG=%q\n'             "$log"
    printf 'export GATEWAY_BACKEND=%q\n' "hermes"
    printf 'export SUPERVISE_CMD=%q\n'   "$run_cmd"
  } >>"$envf"

  if tmux new-session -d -s "$session" \
       "bash -c '. \"$envf\"; rm -f \"$envf\"; exec bash \"$HARNESS/.devcontainer/client-slack-supervise.sh\"'"; then
    tmux pipe-pane -o -t "$session" "$ANSI_STRIP >> $log" 2>/dev/null || true
  else
    rm -f "$envf"
    echo "[gateway] failed to start $session" >&2
    return 1
  fi
}

# ─── Arg parsing ──────────────────────────────────────────────────────────────
cmd="${1:-}"
case "$cmd" in
  status|--status) show_status; exit 0 ;;
  msg-bridge|msgbridge) shift; open_msg_bridge "$@"; exit $? ;;
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
