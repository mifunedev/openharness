#!/usr/bin/env bash
# Build and execute the Open Harness docker compose command with argv-safe
# handling for harness.yaml/config.json compose override paths.

set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_DIR=$(cd "$SCRIPT_DIR/../.." && pwd)
PRINT_ARGV=0

usage() {
  cat >&2 <<'EOF'
Usage: scripts/docker-compose.sh [--repo-dir DIR] [--print-argv] <docker-compose-args...>

Builds the harness docker compose argv from .devcontainer/.env, harness.yaml,
and config.json, then executes `docker compose ...` with the provided args.
--print-argv prints one argv entry per line instead of executing; useful for
safe diagnostics and tests.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --repo-dir)
      [ "$#" -ge 2 ] || { usage; exit 2; }
      REPO_DIR=$(cd "$2" && pwd)
      shift 2
      ;;
    --print-argv)
      PRINT_ARGV=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    --)
      shift
      break
      ;;
    *)
      break
      ;;
  esac
done

[ "$#" -gt 0 ] || { usage; exit 2; }

CONFIG_SCRIPT=${HARNESS_CONFIG_SCRIPT:-$SCRIPT_DIR/harness-config.sh}
HARNESS_YAML="$REPO_DIR/harness.yaml"
PERSISTENT_HARNESS_ENV_FILE="$REPO_DIR/.devcontainer/.harness.yaml.env"
HARNESS_ENV_FILE="$PERSISTENT_HARNESS_ENV_FILE"
HARNESS_ENV_TEMP=0
ENV_FILE="$REPO_DIR/.devcontainer/.env"

compose_path() {
  case "$1" in
    /*) printf '%s\n' "$1" ;;
    *) printf '%s\n' "$REPO_DIR/$1" ;;
  esac
}

truthy() {
  case "$(printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]')" in
    1|true|yes|on) return 0 ;;
    *) return 1 ;;
  esac
}

read_env_value() {
  [ -f "$ENV_FILE" ] || return 0
  awk -F= -v key="$1" '
    $0 ~ "^[[:space:]]*#" { next }
    $1 == key {
      val = substr($0, index($0, "=") + 1)
      sub(/[[:space:]]#.*$/, "", val)
      sub(/^[[:space:]]+/, "", val)
      sub(/[[:space:]]+$/, "", val)
      gsub(/^"|"$/, "", val)
      gsub(/^'"'"'|'"'"'$/, "", val)
      print val
      exit
    }
  ' "$ENV_FILE"
}

args=()

read_like_compose_invocation() {
  [ "$PRINT_ARGV" -eq 1 ] && return 0
  [ "${1:-}" = "config" ] && return 0
  return 1
}

if [ -f "$ENV_FILE" ]; then
  args+=(--env-file "$ENV_FILE")
fi

if [ -f "$HARNESS_YAML" ]; then
  if read_like_compose_invocation "$@"; then
    HARNESS_ENV_FILE=$(mktemp "${TMPDIR:-/tmp}/openharness-harness-yaml-env.XXXXXX")
    HARNESS_ENV_TEMP=1
    trap 'rm -f "$HARNESS_ENV_FILE"' EXIT
  else
    HARNESS_ENV_FILE="$PERSISTENT_HARNESS_ENV_FILE"
    mkdir -p "$(dirname "$HARNESS_ENV_FILE")"
  fi
  sh "$CONFIG_SCRIPT" env "$HARNESS_YAML" > "$HARNESS_ENV_FILE"
  args+=(--env-file "$HARNESS_ENV_FILE")
fi

args+=(-f "$(compose_path ".devcontainer/docker-compose.yml")")

hermes_value=""
if [ -f "$HARNESS_YAML" ]; then
  hermes_value=$(sh "$CONFIG_SCRIPT" get hermes.dashboard "$HARNESS_YAML")
fi
if [ -z "$hermes_value" ]; then
  hermes_value=${HERMES_DASHBOARD:-$(read_env_value HERMES_DASHBOARD)}
fi
if truthy "$hermes_value"; then
  args+=(-f "$(compose_path ".devcontainer/docker-compose.hermes-dashboard.yml")")
fi

ssh_value=""
if [ -f "$HARNESS_YAML" ]; then
  ssh_value=$(sh "$CONFIG_SCRIPT" get ssh.enabled "$HARNESS_YAML")
fi
if [ -z "$ssh_value" ]; then
  ssh_value=${SANDBOX_SSH:-$(read_env_value SANDBOX_SSH)}
fi
if truthy "$ssh_value"; then
  args+=(-f "$(compose_path ".devcontainer/docker-compose.ssh.yml")")

  # Port-collision preflight — only for a real `up` (skip config/ps/down and
  # --print-argv diagnostics). Turn Docker's opaque late "bind: address already
  # in use" into a fail-fast at creation time so enabling SSH (or spinning up
  # another tenant) can't silently collide with a port already in use. Opt out
  # with SANDBOX_SSH_PORT_CHECK=off.
  if [ "$PRINT_ARGV" -eq 0 ] && [ "${1:-}" = "up" ] \
     && [ "$(printf '%s' "${SANDBOX_SSH_PORT_CHECK:-on}" | tr '[:upper:]' '[:lower:]')" != "off" ]; then
    ssh_port=""
    if [ -f "$HARNESS_YAML" ]; then
      ssh_port=$(sh "$CONFIG_SCRIPT" get ssh.port "$HARNESS_YAML")
    fi
    [ -n "$ssh_port" ] || ssh_port=${SANDBOX_SSH_PORT:-$(read_env_value SANDBOX_SSH_PORT)}
    [ -n "$ssh_port" ] || ssh_port=2222
    port_check="$SCRIPT_DIR/check-host-port.sh"
    if [ -x "$port_check" ] || [ -f "$port_check" ]; then
      # Resolve our own container name the same way the compose file does
      # (container_name: ${SANDBOX_NAME}): harness.yaml wins, then env/.env,
      # then the compose default. Needed so the own-port skip below matches a
      # custom-named sandbox, not just "openharness".
      sandbox_name=""
      if [ -f "$HARNESS_YAML" ]; then
        sandbox_name=$(sh "$CONFIG_SCRIPT" get sandbox.name "$HARNESS_YAML")
      fi
      [ -n "$sandbox_name" ] || sandbox_name=${SANDBOX_NAME:-$(read_env_value SANDBOX_NAME)}
      [ -n "$sandbox_name" ] || sandbox_name=openharness
      # Skip the check when the port is already OUR sandbox's published port
      # (an idempotent re-`up` of a running sandbox is fine, not a collision).
      own_port=0
      if command -v docker >/dev/null 2>&1; then
        docker ps --format '{{.Names}}\t{{.Ports}}' 2>/dev/null \
          | awk -F'\t' -v name="$sandbox_name" -v port="$ssh_port" '
              $1 == name && index($2, ":" port "->") { hit = 1 }
              END { exit(hit ? 0 : 1) }' && own_port=1
      fi
      if [ "$own_port" -eq 0 ]; then
        if ! result=$(sh "$port_check" "$ssh_port" 2>/dev/null); then
          printf 'error: SANDBOX_SSH_PORT=%s %s\n' "$ssh_port" "$result" >&2
          printf '       Pick a free ssh.port in harness.yaml (or set SANDBOX_SSH_PORT), or\n' >&2
          printf '       re-run with SANDBOX_SSH_PORT_CHECK=off to bypass this check.\n' >&2
          exit 1
        fi
      fi
    fi
  fi
fi

if [ -f "$HARNESS_YAML" ]; then
  while IFS= read -r override; do
    [ -n "$override" ] && args+=(-f "$(compose_path "$override")")
  done < <(sh "$CONFIG_SCRIPT" compose-overrides "$HARNESS_YAML")
fi

# User-local compose overrides. Canonical location is .oh/config.json (the
# OpenHarness machinery namespace); the legacy repo-root config.json is still
# honored as a fallback for installs that predate the .oh/ relocation.
CONFIG_JSON="$REPO_DIR/.oh/config.json"
[ -f "$CONFIG_JSON" ] || CONFIG_JSON="$REPO_DIR/config.json"
if command -v jq >/dev/null 2>&1 && [ -f "$CONFIG_JSON" ]; then
  while IFS= read -r override; do
    [ -n "$override" ] && args+=(-f "$(compose_path "$override")")
  done < <(jq -r '.composeOverrides[]?' "$CONFIG_JSON")
fi

if [ "$PRINT_ARGV" -eq 1 ]; then
  printf '%s\n' docker compose "${args[@]}" "$@"
  exit 0
fi

if [ "$HARNESS_ENV_TEMP" -eq 1 ]; then
  docker compose "${args[@]}" "$@"
  exit $?
fi

exec docker compose "${args[@]}" "$@"
