#!/usr/bin/env bash

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

verify_bind_ownership() {
  local cid="$1"
  local project_root=${OH_PROJECT_ROOT:-/home/sandbox/harness}
  local marker=".sandbox-boot-smoke-owner-$$"
  local host_uid host_gid observed

  host_uid=$(stat -c %u "$REPO_ROOT")
  host_gid=$(stat -c %g "$REPO_ROOT")

  observed=$(docker exec -u sandbox "$cid" sh -lc \
    "id -u; id -g; stat -c %u '$project_root'; stat -c %g '$project_root'") || {
    echo "sandbox boot smoke failed: could not read sandbox and checkout ownership" >&2
    return 1
  }

  local run_uid run_gid mount_uid mount_gid
  run_uid=$(sed -n 1p <<<"$observed")
  run_gid=$(sed -n 2p <<<"$observed")
  mount_uid=$(sed -n 3p <<<"$observed")
  mount_gid=$(sed -n 4p <<<"$observed")

  if [ "$run_uid:$run_gid" != "$mount_uid:$mount_gid" ]; then
    echo "sandbox boot smoke failed: runtime sandbox user is $run_uid:$run_gid but the bind-mounted checkout is owned by $mount_uid:$mount_gid" >&2
    return 1
  fi
  if [ "$run_uid:$run_gid" != "$host_uid:$host_gid" ]; then
    echo "sandbox boot smoke failed: runtime sandbox user is $run_uid:$run_gid but the host checkout owner is $host_uid:$host_gid" >&2
    return 1
  fi

  if ! docker exec -u sandbox "$cid" sh -lc \
    "cd '$project_root' && : > '$marker' && stat -c %u:%g '$marker' && rm -f '$marker'" \
    >/tmp/sandbox-boot-smoke-owner.out 2>&1; then
    echo "sandbox boot smoke failed: the sandbox user could not write a marker into the bind-mounted checkout" >&2
    cat /tmp/sandbox-boot-smoke-owner.out >&2 || true
    return 1
  fi

  local marker_owner
  marker_owner=$(grep -Eo '^[0-9]+:[0-9]+$' /tmp/sandbox-boot-smoke-owner.out | tail -1)
  if [ "$marker_owner" != "$host_uid:$host_gid" ]; then
    echo "sandbox boot smoke failed: a sandbox-created file is owned by $marker_owner, not host-compatible $host_uid:$host_gid" >&2
    return 1
  fi

  echo "sandbox boot smoke: sandbox user, bind mount, and sandbox-created files all resolve to $host_uid:$host_gid"
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
    # shellcheck disable=SC2086 # HEALTH_CMD intentionally splits into command argv.
    if docker exec "$cid" $HEALTH_CMD >/tmp/sandbox-boot-smoke-health.out 2>/tmp/sandbox-boot-smoke-health.err; then
      if ! docker exec -u sandbox "$cid" sh -lc \
        'test "$(herdr --version)" = "herdr 0.7.4" && test -w "$HOME/.config" && test -w "$HOME/.herdr" && command -v lsof >/dev/null && lsof -v >/dev/null 2>&1 && command -v htop >/dev/null && htop --version >/dev/null && command -v telnet >/dev/null && telnet --version >/dev/null'; then
        echo "sandbox boot smoke failed: required utilities, Herdr runtime, or writable state is unavailable" >&2
        status_diagnostics "$cid"
        exit 1
      fi
      if ! verify_bind_ownership "$cid"; then
        status_diagnostics "$cid"
        exit 1
      fi
      echo "sandbox boot smoke ok: $SERVICE ($cid) passed $HEALTH_CMD, Herdr runtime, and bind-ownership checks"
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
