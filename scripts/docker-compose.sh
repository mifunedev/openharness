#!/usr/bin/env bash
# Build and execute the Open Harness docker compose command with argv-safe
# handling for harness.yaml/config.json compose override paths.

set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_DIR=$(cd "$SCRIPT_DIR/.." && pwd)
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
HARNESS_ENV_FILE="$REPO_DIR/.devcontainer/.harness.yaml.env"
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

if [ -f "$ENV_FILE" ]; then
  args+=(--env-file "$ENV_FILE")
fi

if [ -f "$HARNESS_YAML" ]; then
  mkdir -p "$(dirname "$HARNESS_ENV_FILE")"
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

if [ -f "$HARNESS_YAML" ]; then
  while IFS= read -r override; do
    [ -n "$override" ] && args+=(-f "$(compose_path "$override")")
  done < <(sh "$CONFIG_SCRIPT" compose-overrides "$HARNESS_YAML")
fi

if command -v jq >/dev/null 2>&1 && [ -f "$REPO_DIR/config.json" ]; then
  while IFS= read -r override; do
    [ -n "$override" ] && args+=(-f "$(compose_path "$override")")
  done < <(jq -r '.composeOverrides[]?' "$REPO_DIR/config.json")
fi

if [ "$PRINT_ARGV" -eq 1 ]; then
  printf '%s\n' docker compose "${args[@]}" "$@"
  exit 0
fi

exec docker compose "${args[@]}" "$@"
