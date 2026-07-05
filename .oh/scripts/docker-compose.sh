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

# Host Docker socket is opt-in (effectively host root). Apply the overlay only
# when DOCKER_SOCKET is truthy via harness.yaml `sandbox.docker_socket` or the
# .devcontainer/.env DOCKER_SOCKET key. Mirrors the hermes-dashboard toggle above.
docker_socket_value=""
if [ -f "$HARNESS_YAML" ]; then
  docker_socket_value=$(sh "$CONFIG_SCRIPT" get sandbox.docker_socket "$HARNESS_YAML")
fi
if [ -z "$docker_socket_value" ]; then
  docker_socket_value=${DOCKER_SOCKET:-$(read_env_value DOCKER_SOCKET)}
fi
if truthy "$docker_socket_value"; then
  args+=(-f "$(compose_path ".devcontainer/docker-compose.docker-sock.yml")")
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
