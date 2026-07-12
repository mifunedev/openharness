#!/usr/bin/env bash
# Build-only Compose smoke for bounded local CodeLayer support. No secrets or operator resources.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUN_KEY="${CODELAYER_SMOKE_ID:-${GITHUB_RUN_ID:-local}-$$}"
RUN_KEY="${RUN_KEY//[^a-zA-Z0-9_.-]/-}"
ENABLED_NAME="oh-codelayer-enabled-${RUN_KEY}"
DISABLED_NAME="oh-codelayer-default-${RUN_KEY}"
ENABLED_PROJECT="oh-codelayer-enabled-project-${RUN_KEY}"
DISABLED_PROJECT="oh-codelayer-default-project-${RUN_KEY}"
NETWORK="oh-codelayer-no-egress-${RUN_KEY}"
ENABLED_IMAGE="sandbox-${ENABLED_NAME}"
DISABLED_IMAGE="sandbox-${DISABLED_NAME}"
HELP_CONTAINER="oh-codelayer-help-${RUN_KEY}"
PARSE_CONTAINER="oh-codelayer-parse-${RUN_KEY}"
ABSENT_CONTAINER="oh-codelayer-absent-${RUN_KEY}"
# Avoid host credential-helper state; the smoke pulls only public build inputs.
# DOCKER_HOST (including the CI dind endpoint) remains unchanged.
SMOKE_DOCKER_CONFIG="$(mktemp -d -t oh-codelayer-docker-config.XXXXXX)"
printf '{}\n' >"$SMOKE_DOCKER_CONFIG/config.json"
export DOCKER_CONFIG="$SMOKE_DOCKER_CONFIG"

cleanup() {
  docker rm -f "$HELP_CONTAINER" "$PARSE_CONTAINER" "$ABSENT_CONTAINER" >/dev/null 2>&1 || true
  docker image rm -f "$ENABLED_IMAGE" "$DISABLED_IMAGE" >/dev/null 2>&1 || true
  docker network rm "$NETWORK" >/dev/null 2>&1 || true
  rm -rf "$SMOKE_DOCKER_CONFIG"
}
trap cleanup EXIT INT TERM

printf 'CodeLayer smoke identifiers:\n enabled_project=%s\n disabled_project=%s\n enabled_image=%s\n disabled_image=%s\n no_egress_network=%s\n' \
  "$ENABLED_PROJECT" "$DISABLED_PROJECT" "$ENABLED_IMAGE" "$DISABLED_IMAGE" "$NETWORK"
docker network create --internal "$NETWORK" >/dev/null

cd "$ROOT"
SANDBOX_NAME="$ENABLED_NAME" INSTALL_CODELAYER=true \
  docker compose --project-name "$ENABLED_PROJECT" --file .devcontainer/docker-compose.yml build sandbox
SANDBOX_NAME="$DISABLED_NAME" INSTALL_CODELAYER=false \
  docker compose --project-name "$DISABLED_PROJECT" --file .devcontainer/docker-compose.yml build sandbox

# The internal network has no external route. Each uniquely named container is --rm.
docker run --rm --name "$HELP_CONTAINER" --network "$NETWORK" --entrypoint /bin/bash "$ENABLED_IMAGE" -ceu '
  test -x /usr/local/bin/bun
  test -f /usr/local/bin/codelayer
  test ! -L /usr/local/bin/codelayer
  test -x /usr/local/bin/codelayer
  test "$(stat -c "%U:%G %a" /usr/local/bin/codelayer)" = "root:root 755"
  test -f /usr/local/lib/node_modules/@humanlayer/codelayer/src/cli.ts
  test "$(find /opt /home /usr/local -type f -path "*/codelayer/src/cli.ts" 2>/dev/null | sort)" = "/usr/local/lib/node_modules/@humanlayer/codelayer/src/cli.ts"
  expected=$(printf "#!/bin/sh\nexec /usr/local/bin/bun /usr/local/lib/node_modules/@humanlayer/codelayer/src/cli.ts \"\$@\"\n")
  test "$(cat /usr/local/bin/codelayer)" = "$expected"
  help=$(codelayer --help)
  printf "%s\n" "$help"
  grep -F "Multi-provider coding agent" <<<"$help"
'

# Pinned source (src/command.ts + src/providers.ts) parses this exact Ralph shape,
# then openai fails before any network request when OPENAI_API_KEY is absent.
set +e
PARSE_OUTPUT="$(docker run --rm --name "$PARSE_CONTAINER" --network "$NETWORK" --entrypoint /usr/bin/env "$ENABLED_IMAGE" \
  -i HOME=/tmp/codelayer-smoke PATH=/usr/local/bin:/usr/bin:/bin \
  codelayer --model gpt-4.1 --verbose --provider openai --prompt 'openharness credential-boundary smoke' 2>&1)"
PARSE_STATUS=$?
set -e
printf 'adapter-shaped exit=%s output=%s\n' "$PARSE_STATUS" "$PARSE_OUTPUT"
[ "$PARSE_STATUS" -ne 0 ]
grep -F 'Missing OPENAI_API_KEY. Set it in your environment before running codelayer.' <<<"$PARSE_OUTPUT"

# Default/disabled image must contain no command, package, wrapper, or published source.
docker run --rm --name "$ABSENT_CONTAINER" --network "$NETWORK" --entrypoint /bin/bash "$DISABLED_IMAGE" -ceu '
  ! command -v codelayer
  test ! -e /usr/local/bin/codelayer
  test ! -e /usr/local/lib/node_modules/@humanlayer/codelayer
  test ! -e /usr/local/lib/node_modules/@humanlayer/codelayer/src/cli.ts
'
printf 'PASS: local executable/adapter compatibility proven; authentication and remote E2E were not tested.\n'
