#!/usr/bin/env bash
# Usage: deployment-compose.sh <docker-compose-args...>
# Env:   SANDBOX_NAME, OH_SANDBOX_IMAGE, OH_PULL_POLICY, OH_DEPLOY_DOCKER_CONFIG

set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_DIR=$(cd "$SCRIPT_DIR/../.." && pwd)
COMPOSE_FILE="$REPO_DIR/.devcontainer/docker-compose.image-only.yml"

if [ "$#" -eq 0 ]; then
  echo "usage: ${0##*/} <docker-compose-args...>" >&2
  exit 2
fi

[ -f "$COMPOSE_FILE" ] || {
  echo "error: ${COMPOSE_FILE#"$REPO_DIR"/} does not exist" >&2
  exit 2
}

if [ -z "${OH_DEPLOY_DOCKER_CONFIG:-}" ]; then
  OH_DEPLOY_DOCKER_CONFIG=$(mktemp -d)
  printf '{}\n' >"$OH_DEPLOY_DOCKER_CONFIG/config.json"
fi
export DOCKER_CONFIG="$OH_DEPLOY_DOCKER_CONFIG"

exec docker compose -f "$COMPOSE_FILE" "$@"
