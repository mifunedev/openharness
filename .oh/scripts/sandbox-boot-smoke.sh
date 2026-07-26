#!/usr/bin/env bash
# sandbox-boot-smoke.sh — bounded CI smoke test for devcontainer boot health.

set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
COMPOSE=${BOOT_SMOKE_COMPOSE:-$REPO_ROOT/.oh/scripts/docker-compose.sh}
SERVICE=${BOOT_SMOKE_SERVICE:-sandbox}
TIMEOUT=${BOOT_SMOKE_TIMEOUT_SECONDS:-600}
INTERVAL=${BOOT_SMOKE_INTERVAL_SECONDS:-10}
UP_ARGS=${BOOT_SMOKE_UP_ARGS:-up -d --no-build}
DOWN_ARGS=${BOOT_SMOKE_DOWN_ARGS:-down -v --remove-orphans}
HEALTH_CMD=${BOOT_SMOKE_HEALTH_CMD:-bash ${OH_PROJECT_ROOT:-/home/sandbox/harness}/.oh/scripts/sandbox-healthcheck.sh}

compose() {
  bash "$COMPOSE" "$@"
}

teardown() {
  compose $DOWN_ARGS >/dev/null 2>&1 || true
}

status_diagnostics() {
  local cid="${1:-}"
  echo "sandbox boot smoke diagnostics:" >&2
  echo "--- docker compose ps" >&2
  compose ps >&2 || true
  if [ -n "$cid" ]; then
    echo "--- container health inspect ($cid)" >&2
    docker inspect -f '{{json .State.Health}}' "$cid" >&2 || true
    echo "--- container logs tail ($cid)" >&2
    docker logs --tail 200 "$cid" >&2 || true
  fi
}

trap teardown EXIT

# shellcheck disable=SC2086 # BOOT_SMOKE_UP_ARGS is an intentional argv fragment for CI tuning.
compose $UP_ARGS "$SERVICE"

end=$(( $(date +%s) + TIMEOUT ))
last_status="starting"
cid=""
while [ "$(date +%s)" -le "$end" ]; do
  cid=$(compose ps -q "$SERVICE" 2>/dev/null || true)
  if [ -z "$cid" ]; then
    last_status="missing-container"
  else
    # Prefer the exact healthcheck command wired into compose. Calling it via exec
    # avoids waiting for Docker's start_period while still exercising the same check.
    # shellcheck disable=SC2086 # HEALTH_CMD intentionally splits into command argv.
    if docker exec "$cid" $HEALTH_CMD >/tmp/sandbox-boot-smoke-health.out 2>/tmp/sandbox-boot-smoke-health.err; then
      if ! docker exec -u sandbox "$cid" sh -lc \
        'test "$(herdr --version)" = "herdr 0.7.4" && test -w "$HOME/.config" && test -w "$HOME/.herdr"'; then
        echo "sandbox boot smoke failed: Herdr runtime or writable state is unavailable" >&2
        status_diagnostics "$cid"
        exit 1
      fi
      echo "sandbox boot smoke ok: $SERVICE ($cid) passed $HEALTH_CMD and Herdr runtime checks"
      exit 0
    fi
    last_status=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}' "$cid" 2>/dev/null || echo "inspect-failed")
    if [ "$last_status" = "unhealthy" ]; then
      echo "sandbox boot smoke failed: container became unhealthy" >&2
      cat /tmp/sandbox-boot-smoke-health.err >&2 2>/dev/null || true
      status_diagnostics "$cid"
      exit 1
    fi
  fi
  sleep "$INTERVAL"
done

echo "sandbox boot smoke timed out after ${TIMEOUT}s waiting for $SERVICE health (last=$last_status)" >&2
cat /tmp/sandbox-boot-smoke-health.err >&2 2>/dev/null || true
status_diagnostics "$cid"
exit 1
