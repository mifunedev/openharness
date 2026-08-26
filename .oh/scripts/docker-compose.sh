#!/usr/bin/env bash
# Build and execute the Open Harness docker compose command with argv-safe
# handling for .oh/config.json compose override paths.
#
# Configuration reaches compose through exactly TWO surfaces: the shell
# environment and .devcontainer/.env. harness.yaml was removed in 0.4.0 -- it
# only ever translated section.key into an env var compose already interpolated,
# and it was invisible on the VS Code "Reopen in Container" path, which names
# .devcontainer/docker-compose.yml directly. .oh/scripts/migrate-harness-yaml.sh
# runs first here so a checkout that still has one is carried over exactly once.

set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_DIR=$(cd "$SCRIPT_DIR/../.." && pwd)
PRINT_ARGV=0

usage() {
  cat >&2 <<'EOF'
Usage: scripts/docker-compose.sh [--repo-dir DIR] [--print-argv] <docker-compose-args...>

Builds the harness docker compose argv from .devcontainer/.env and
.oh/config.json, then executes `docker compose ...` with the provided args.
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

ENV_FILE="$REPO_DIR/.devcontainer/.env"

# One-shot harness.yaml -> .devcontainer/.env migration. Exits 0 immediately
# when there is no harness.yaml, which is the steady state; the script is
# self-contained so deleting it in a later release removes the whole
# compatibility story. Output goes to stderr so `--print-argv` stays parseable.
MIGRATOR="$SCRIPT_DIR/migrate-harness-yaml.sh"
if [ -f "$REPO_DIR/harness.yaml" ] && [ -f "$MIGRATOR" ]; then
  sh "$MIGRATOR" "$REPO_DIR" >&2 || true
fi

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

if [ -f "$ENV_FILE" ]; then
  args+=(--env-file "$ENV_FILE")
fi

args+=(-f "$(compose_path ".devcontainer/docker-compose.yml")")

# Each toggle below reads the shell environment first, then .devcontainer/.env.
# That is the same precedence docker compose itself applies to interpolation, so
# the overlays this wrapper selects and the values compose resolves cannot
# disagree.
hermes_value=${HERMES_DASHBOARD:-$(read_env_value HERMES_DASHBOARD)}
if truthy "$hermes_value"; then
  args+=(-f "$(compose_path ".devcontainer/docker-compose.hermes-dashboard.yml")")
fi

# Host Docker socket is opt-in (effectively host root). Apply the overlay only
# when the DOCKER_SOCKET key is truthy. Mirrors the hermes-dashboard toggle above.
docker_socket_value=${DOCKER_SOCKET:-$(read_env_value DOCKER_SOCKET)}
if truthy "$docker_socket_value"; then
  args+=(-f "$(compose_path ".devcontainer/docker-compose.docker-sock.yml")")
fi

ssh_value=${SANDBOX_SSH:-$(read_env_value SANDBOX_SSH)}
if truthy "$ssh_value"; then
  args+=(-f "$(compose_path ".devcontainer/docker-compose.ssh.yml")")

  # Port-collision preflight — only for a real `up` (skip config/ps/down and
  # --print-argv diagnostics). Turn Docker's opaque late "bind: address already
  # in use" into a fail-fast at creation time so enabling SSH (or spinning up
  # another tenant) can't silently collide with a port already in use. Opt out
  # with SANDBOX_SSH_PORT_CHECK=off.
  if [ "$PRINT_ARGV" -eq 0 ] && [ "${1:-}" = "up" ] \
     && [ "$(printf '%s' "${SANDBOX_SSH_PORT_CHECK:-on}" | tr '[:upper:]' '[:lower:]')" != "off" ]; then
    ssh_port=${SANDBOX_SSH_PORT:-$(read_env_value SANDBOX_SSH_PORT)}
    [ -n "$ssh_port" ] || ssh_port=2222
    port_check="$SCRIPT_DIR/check-host-port.sh"
    if [ -x "$port_check" ] || [ -f "$port_check" ]; then
      # Resolve our own container name the same way the compose file does
      # (container_name: ${SANDBOX_NAME}): shell env, then .env, then the
      # compose default. Needed so the own-port skip below matches a
      # custom-named sandbox, not just "openharness".
      sandbox_name=${SANDBOX_NAME:-$(read_env_value SANDBOX_NAME)}
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

exec docker compose "${args[@]}" "$@"
