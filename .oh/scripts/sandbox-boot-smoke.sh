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
RELOAD_TIMEOUT=${BOOT_SMOKE_RELOAD_TIMEOUT_SECONDS:-20}
RECOVERY_TIMEOUT=${BOOT_SMOKE_RECOVERY_TIMEOUT_SECONDS:-60}

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

verify_nothing_installed() {
  local cid="$1" noun="$2" cmd="$3"
  local prefix="${NPM_USER_PREFIX:-/home/sandbox/.local}"
  local states ids binary installed out

  if ! command -v jq >/dev/null 2>&1; then
    echo "sandbox boot smoke failed: jq is required on the runner to read the $noun catalog JSON" >&2
    return 1
  fi

  if ! states=$(docker exec -u sandbox "$cid" bash -lc "oh $cmd list --json" 2>/tmp/sandbox-boot-smoke-catalog.err); then
    echo "sandbox boot smoke failed: 'oh $cmd list --json' did not run in the booted sandbox" >&2
    cat /tmp/sandbox-boot-smoke-catalog.err >&2 || true
    return 1
  fi

  ids=$(jq -r '.[] | select(.kind == "installable") | .id' <<<"$states")
  if [ -z "$ids" ]; then
    echo "sandbox boot smoke failed: the $noun catalog reported no kind:\"installable\" entries, so this check would pass vacuously" >&2
    return 1
  fi

  local failed=0
  while IFS= read -r id; do
    [ -n "$id" ] || continue
    installed=$(jq -r --arg id "$id" '.[] | select(.id == $id) | .installed' <<<"$states")
    if [ "$installed" != "false" ]; then
      echo "sandbox boot smoke failed: installable $noun '$id' reports installed=$installed on a fresh boot — nothing may install at boot" >&2
      failed=1
      continue
    fi
    binary=$(jq -r --arg id "$id" '.[] | select(.id == $id) | .binary' <<<"$states")
    if [ -z "$binary" ] || [ "$binary" = "null" ]; then
      echo "sandbox boot smoke failed: installable $noun '$id' declares no binary, so its absence cannot be checked" >&2
      failed=1
      continue
    fi
    if ! out=$(docker exec -u sandbox "$cid" bash -lc "
        if [ -e '$prefix/bin/$binary' ]; then
          echo \"$prefix/bin/$binary exists\" >&2
          exit 1
        fi
        path=\$(type -P '$binary' || true)
        case \"\$path\" in
          $prefix/*) echo \"resolves to \$path\" >&2; exit 1 ;;
        esac
      " 2>&1); then
      echo "sandbox boot smoke failed: installable $noun '$id' left a binary under $prefix on a fresh boot" >&2
      printf '  %s\n' "$out" >&2
      failed=1
      continue
    fi
    echo "sandbox boot smoke: $id not installed at boot ($binary absent from $prefix)"
  done <<<"$ids"

  [ "$failed" = "0" ]
}

verify_systemd_supervision() {
  local cid="$1"
  local project_root=${OH_PROJECT_ROOT:-/home/sandbox/harness}
  local pid_file="$project_root/crons/.pid"
  local cron_log="$project_root/crons/.cron.log"
  local pid1 main_pid locked_pid reloads_before reloads_after new_pid waited

  pid1=$(docker exec "$cid" ps -p 1 -o comm= 2>/dev/null | tr -d ' ') || pid1=""
  if [ "$pid1" != "systemd" ]; then
    echo "sandbox boot smoke failed: PID 1 is '${pid1:-<unreadable>}', not systemd" >&2
    return 1
  fi

  if ! docker exec "$cid" systemctl is-active --quiet openharness-bootstrap.service; then
    echo "sandbox boot smoke failed: openharness-bootstrap.service is not active" >&2
    docker exec "$cid" systemctl status openharness-bootstrap.service --no-pager >&2 || true
    return 1
  fi

  if ! docker exec "$cid" systemctl is-active --quiet openharness-cron.service; then
    echo "sandbox boot smoke failed: openharness-cron.service is not active" >&2
    docker exec "$cid" systemctl status openharness-cron.service --no-pager >&2 || true
    return 1
  fi

  main_pid=$(docker exec "$cid" systemctl show -p MainPID --value openharness-cron.service 2>/dev/null | tr -d ' \r')
  locked_pid=$(docker exec "$cid" cat "$pid_file" 2>/dev/null | tr -d ' \r')
  if [ -z "$main_pid" ] || [ "$main_pid" -le 1 ] 2>/dev/null; then
    echo "sandbox boot smoke failed: openharness-cron.service reports MainPID '${main_pid:-<empty>}'" >&2
    return 1
  fi
  if [ "$main_pid" != "$locked_pid" ]; then
    echo "sandbox boot smoke failed: systemd MainPID $main_pid disagrees with $pid_file (${locked_pid:-<empty>})" >&2
    return 1
  fi
  echo "sandbox boot smoke: systemd is PID 1 and supervises cron-runtime.ts at PID $main_pid (matches crons/.pid)"

  reloads_before=$(docker exec "$cid" sh -lc "awk -F'\t' '\$3 == \"RELOAD\"' '$cron_log' 2>/dev/null | wc -l" | tr -d ' \r')
  if ! docker exec "$cid" systemctl reload openharness-cron.service; then
    echo "sandbox boot smoke failed: systemctl reload openharness-cron.service returned non-zero" >&2
    return 1
  fi
  waited=0
  reloads_after="$reloads_before"
  while [ "$waited" -lt "$RELOAD_TIMEOUT" ]; do
    reloads_after=$(docker exec "$cid" sh -lc "awk -F'\t' '\$3 == \"RELOAD\"' '$cron_log' 2>/dev/null | wc -l" | tr -d ' \r')
    [ "$reloads_after" -gt "$reloads_before" ] && break
    waited=$((waited + 1))
    sleep 1
  done
  if [ "$reloads_after" -le "$reloads_before" ]; then
    echo "sandbox boot smoke failed: systemctl reload did not reach the runtime's SIGHUP path (no new RELOAD line in crons/.cron.log)" >&2
    return 1
  fi
  echo "sandbox boot smoke: systemctl reload exercised the existing SIGHUP reschedule (RELOAD logged)"

  docker exec "$cid" sh -c "kill -9 $main_pid" || true
  waited=0
  new_pid=""
  while [ "$waited" -lt "$RECOVERY_TIMEOUT" ]; do
    new_pid=$(docker exec "$cid" systemctl show -p MainPID --value openharness-cron.service 2>/dev/null | tr -d ' \r')
    if [ -n "$new_pid" ] && [ "$new_pid" != "0" ] && [ "$new_pid" != "$main_pid" ] \
      && docker exec "$cid" systemctl is-active --quiet openharness-cron.service; then
      break
    fi
    waited=$((waited + 1))
    sleep 1
  done
  if [ -z "$new_pid" ] || [ "$new_pid" = "0" ] || [ "$new_pid" = "$main_pid" ]; then
    echo "sandbox boot smoke failed: systemd did not recover the scheduler after SIGKILL (MainPID stayed '${new_pid:-<empty>}')" >&2
    docker exec "$cid" systemctl status openharness-cron.service --no-pager >&2 || true
    return 1
  fi
  locked_pid=$(docker exec "$cid" cat "$pid_file" 2>/dev/null | tr -d ' \r')
  if [ "$new_pid" != "$locked_pid" ]; then
    echo "sandbox boot smoke failed: after recovery MainPID $new_pid disagrees with $pid_file (${locked_pid:-<empty>})" >&2
    return 1
  fi
  echo "sandbox boot smoke: systemd recovered the killed scheduler at PID $new_pid (crons/.pid re-agreed)"
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
        'test -w "$HOME/.config" && test -w "$HOME/.herdr" && command -v lsof >/dev/null && lsof -v >/dev/null 2>&1 && command -v htop >/dev/null && htop --version >/dev/null && command -v telnet >/dev/null && telnet --version >/dev/null'; then
        echo "sandbox boot smoke failed: required utilities, Herdr runtime, or writable state is unavailable" >&2
        status_diagnostics "$cid"
        exit 1
      fi
      if ! verify_bind_ownership "$cid"; then
        status_diagnostics "$cid"
        exit 1
      fi
      if ! verify_nothing_installed "$cid" harness harness; then
        status_diagnostics "$cid"
        exit 1
      fi
      if ! verify_nothing_installed "$cid" tool tool; then
        status_diagnostics "$cid"
        exit 1
      fi
      if ! verify_systemd_supervision "$cid"; then
        status_diagnostics "$cid"
        exit 1
      fi
      echo "sandbox boot smoke ok: $SERVICE ($cid) passed $HEALTH_CMD, systemd PID-1 supervision (bootstrap, cron, PID agreement, reload, kill recovery), Herdr runtime, bind-ownership, and installed no harness or tool at boot"
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
