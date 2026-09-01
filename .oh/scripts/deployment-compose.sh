#!/usr/bin/env bash
# Compose driver for the image-only sandbox flavor: forwards its arguments to
# `docker compose` against .devcontainer/docker-compose.image-only.yml.
#
# This is the counterpart to docker-compose.sh, not a replacement for it.
# docker-compose.sh is the lifecycle door for the flavor `oh` manages: it pins
# .devcontainer/docker-compose.yml, layers the oh.json overrides, and passes
# --env-file for the repository dotenv. That dotenv carries the rendered
# OH_SANDBOX_IMAGE, OH_PULL_POLICY and SANDBOX_NAME of the operator's own
# sandbox, so reusing it here would boot the local image under the operator's
# own project name. This driver therefore reads no dotenv at all and takes its
# entire configuration from the environment its caller exports.
#
# Usage: deployment-compose.sh <docker-compose-args...>
# Env:   SANDBOX_NAME (compose project name), OH_SANDBOX_IMAGE, OH_PULL_POLICY,
#        OH_DEPLOY_DOCKER_CONFIG (an existing docker config dir to reuse)

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

# An ambient ~/.docker/config.json can name a credsStore this environment cannot
# execute, and Docker consults it even for an anonymous pull of a public image —
# which then fails with `error getting credentials - err: exit status 255`. Point
# DOCKER_CONFIG at an empty directory so the pull stays anonymous. A caller that
# needs a registry login exports OH_DEPLOY_DOCKER_CONFIG at a prepared directory;
# exporting it also keeps repeated invocations from each minting a new temp dir.
if [ -z "${OH_DEPLOY_DOCKER_CONFIG:-}" ]; then
  OH_DEPLOY_DOCKER_CONFIG=$(mktemp -d)
  printf '{}\n' >"$OH_DEPLOY_DOCKER_CONFIG/config.json"
fi
export DOCKER_CONFIG="$OH_DEPLOY_DOCKER_CONFIG"

exec docker compose -f "$COMPOSE_FILE" "$@"
