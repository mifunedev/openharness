#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_DIR=$(cd "$SCRIPT_DIR/../.." && pwd)
PRINT_ARGV=0
EXTRA_ENV_FILE=""

usage() {
  cat >&2 <<'EOF'
Usage: scripts/docker-compose.sh [--repo-dir DIR] [--extra-env-file FILE]
                                 [--print-argv] <docker-compose-args...>

Builds the harness docker compose argv from the repository dotenv and the
composeOverrides[] list in oh.json, then executes `docker compose ...` with the
provided args.
--extra-env-file adds a lower-precedence --env-file ahead of the dotenv; `oh`
renders the non-secret settings of oh.json into that file.
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
    --extra-env-file)
      [ "$#" -ge 2 ] || { usage; exit 2; }
      EXTRA_ENV_FILE="$2"
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

MIGRATOR="$SCRIPT_DIR/migrate-harness-yaml.sh"
if [ -f "$REPO_DIR/harness.yaml" ] && [ -f "$MIGRATOR" ]; then
  sh "$MIGRATOR" "$REPO_DIR" >&2 || true
fi

ENV_FILE="$REPO_DIR/.env"
[ -f "$ENV_FILE" ] || ENV_FILE="$REPO_DIR/.devcontainer/.env"

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

read_env_file_value() {
  [ -f "$2" ] || return 0
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
  ' "$2"
}

read_env_value() {
  local value=""
  if [ -n "$EXTRA_ENV_FILE" ]; then
    value=$(read_env_file_value "$1" "$EXTRA_ENV_FILE")
    if [ -n "$value" ]; then
      printf '%s\n' "$value"
      return 0
    fi
  fi
  read_env_file_value "$1" "$ENV_FILE"
}

if [ -n "$EXTRA_ENV_FILE" ] && [ ! -f "$EXTRA_ENV_FILE" ]; then
  printf 'error: --extra-env-file %s does not exist\n' "$EXTRA_ENV_FILE" >&2
  exit 2
fi

if [ -z "$EXTRA_ENV_FILE" ] && [ -f "$REPO_DIR/oh.json" ]; then
  printf 'note: non-secret config comes from oh.json via `oh`; this direct run uses only %s and the compose-file defaults\n' \
    "${ENV_FILE#"$REPO_DIR"/}" >&2
fi

args=()

if [ -n "$EXTRA_ENV_FILE" ]; then
  args+=(--env-file "$EXTRA_ENV_FILE")
fi

if [ -f "$ENV_FILE" ]; then
  args+=(--env-file "$ENV_FILE")
fi

args+=(-f "$(compose_path ".devcontainer/docker-compose.yml")")

docker_socket_value=${DOCKER_SOCKET:-$(read_env_value DOCKER_SOCKET)}
if truthy "$docker_socket_value"; then
  args+=(-f "$(compose_path ".devcontainer/docker-compose.docker-sock.yml")")
fi

ssh_value=${SANDBOX_SSH:-$(read_env_value SANDBOX_SSH)}
if truthy "$ssh_value"; then
  args+=(-f "$(compose_path ".devcontainer/docker-compose.ssh.yml")")

  if [ "$PRINT_ARGV" -eq 0 ] && [ "${1:-}" = "up" ] \
     && [ "$(printf '%s' "${SANDBOX_SSH_PORT_CHECK:-on}" | tr '[:upper:]' '[:lower:]')" != "off" ]; then
    ssh_port=${SANDBOX_SSH_PORT:-$(read_env_value SANDBOX_SSH_PORT)}
    [ -n "$ssh_port" ] || ssh_port=2222
    port_check="$SCRIPT_DIR/check-host-port.sh"
    if [ -x "$port_check" ] || [ -f "$port_check" ]; then
      sandbox_name=${SANDBOX_NAME:-$(read_env_value SANDBOX_NAME)}
      [ -n "$sandbox_name" ] || sandbox_name=openharness
      own_port=0
      if command -v docker >/dev/null 2>&1; then
        docker ps --format '{{.Names}}\t{{.Ports}}' 2>/dev/null \
          | awk -F'\t' -v name="$sandbox_name" -v port="$ssh_port" '
              $1 == name && index($2, ":" port "->") { hit = 1 }
              END { exit(hit ? 0 : 1) }' && own_port=1
      fi
      if [ "$own_port" -eq 0 ]; then
        if ! result=$(bash "$port_check" "$ssh_port" 2>/dev/null); then
          printf 'error: SANDBOX_SSH_PORT=%s %s\n' "$ssh_port" "$result" >&2
          printf '       Set a free SANDBOX_SSH_PORT in .devcontainer/.env, or\n' >&2
          printf '       re-run with SANDBOX_SSH_PORT_CHECK=off to bypass this check.\n' >&2
          exit 1
        fi
      fi
    fi
  fi
fi

CONFIG_JSON="$REPO_DIR/oh.json"
[ -f "$CONFIG_JSON" ] || CONFIG_JSON="$REPO_DIR/.oh/config.json"
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

exec docker compose "${args[@]}" "$@"
