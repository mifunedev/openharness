#!/usr/bin/env bash
# Usage: deployment-guard.sh [--keep] [--run <token>] [<image-ref>]
# Env:   OH_SANDBOX_IMAGE, OH_DEFAULT_SANDBOX_IMAGE, OH_DEPLOY_RUN, OH_DEPLOY_KEEP,
#        OH_DEPLOY_TIMEOUT_SECONDS, OH_DEPLOY_DOCKER_CONFIG

set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_DIR=$(cd "$SCRIPT_DIR/../.." && pwd)
COMPOSE_DRIVER="$SCRIPT_DIR/deployment-compose.sh"
IMAGE_VERIFIER="$SCRIPT_DIR/verify-sandbox-image.sh"
BOOT_SMOKE="$SCRIPT_DIR/sandbox-boot-smoke.sh"
COMPOSE_FILE="$REPO_DIR/.devcontainer/docker-compose.image-only.yml"

DEFAULT_IMAGE=${OH_DEFAULT_SANDBOX_IMAGE:-ghcr.io/mifunedev/openharness:latest}
PROJECT_ROOT=/home/sandbox/harness
SEED_MARKER="$PROJECT_ROOT/.oh/.image-seeded"

GUARD_GIT_NAME="openharness deployment guard"
GUARD_GIT_EMAIL="deployment-guard@openharness.invalid"

KEEP=${OH_DEPLOY_KEEP:-0}
IMAGE=""

usage() {
  echo "usage: ${0##*/} [--keep] [--run <token>] [<image-ref>]" >&2
  exit 2
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --keep) KEEP=1; shift ;;
    --run) [ "$#" -ge 2 ] || usage; OH_DEPLOY_RUN="$2"; shift 2 ;;
    --help|-h) usage ;;
    -*) echo "error: unknown option $1" >&2; usage ;;
    *) [ -z "$IMAGE" ] || usage; IMAGE="$1"; shift ;;
  esac
done

[ -n "$IMAGE" ] || IMAGE=${OH_SANDBOX_IMAGE:-$DEFAULT_IMAGE}
RUN=${OH_DEPLOY_RUN:-oh-depguard-$(date +%s)-$$}

RUN_CONTAINER="$RUN"
RUN_VOLUME="${RUN}_workspace"
RUN_NETWORK="${RUN}_default"
SCOPES=("container:$RUN_CONTAINER" "volume:$RUN_VOLUME" "network:$RUN_NETWORK")

failures=()
fail() { failures+=("$1"); echo "FAIL: $1" >&2; }
ok() { echo "ok: $1"; }

docker_names() {
  case "$1" in
    container) docker ps -a --format '{{.Names}}' 2>/dev/null || true ;;
    volume) docker volume ls --format '{{.Name}}' 2>/dev/null || true ;;
    network) docker network ls --format '{{.Name}}' 2>/dev/null || true ;;
  esac
}

names_matching_run() {
  local scope name
  for scope in "${SCOPES[@]}"; do
    name=${scope#*:}
    if grep -qxF "$name" <<<"$(docker_names "${scope%%:*}")"; then
      printf '%s %s\n' "${scope%%:*}" "$name"
    fi
  done
}

compose() { bash "$COMPOSE_DRIVER" "$@"; }

TORN_DOWN=0
TEARDOWN_FAILED=0

teardown() {
  local rc=$?
  [ "$TORN_DOWN" = "0" ] || return 0
  TORN_DOWN=1

  if [ "$KEEP" = "1" ]; then
    echo
    echo "--keep: leaving $RUN running. Clean it up with:"
    echo "  SANDBOX_NAME=$RUN OH_SANDBOX_IMAGE=$IMAGE bash $COMPOSE_DRIVER down -v --remove-orphans"
    return 0
  fi

  compose down -v --remove-orphans --timeout 10 >/dev/null 2>&1 || true
  docker rm -f "$RUN_CONTAINER" >/dev/null 2>&1 || true
  docker volume rm "$RUN_VOLUME" >/dev/null 2>&1 || true
  docker network rm "$RUN_NETWORK" >/dev/null 2>&1 || true

  local leaked
  leaked=$(names_matching_run)
  if [ -n "$leaked" ]; then
    TEARDOWN_FAILED=1
    printf 'FAIL: teardown left resources behind: %s\n' "$(tr '\n' ';' <<<"$leaked")" >&2
  else
    ok "teardown removed every resource named for $RUN"
  fi

  if [ -n "${DOCKER_CONFIG_DIR:-}" ]; then rm -rf "$DOCKER_CONFIG_DIR"; fi

  if [ "$TEARDOWN_FAILED" = "1" ] && [ "$rc" = "0" ]; then
    exit 1
  fi
}
trap teardown EXIT INT TERM

for tool in docker jq; do
  command -v "$tool" >/dev/null 2>&1 || {
    echo "error: $tool is required on this host" >&2
    exit 1
  }
done
for f in "$COMPOSE_DRIVER" "$IMAGE_VERIFIER" "$BOOT_SMOKE" "$COMPOSE_FILE"; do
  [ -f "$f" ] || { echo "error: missing ${f#"$REPO_DIR"/}" >&2; exit 1; }
done

collision=$(names_matching_run)
if [ -n "$collision" ]; then
  TORN_DOWN=1
  printf 'error: run token %s already names existing resources: %s\n' "$RUN" "$(tr '\n' ';' <<<"$collision")" >&2
  echo "       choose another --run token; this guard never removes a resource it did not create" >&2
  exit 1
fi

declare -A BEFORE=()
for scope in container volume network; do
  BEFORE[$scope]=$(docker_names "$scope" | sort)
done

DOCKER_CONFIG_DIR=$(mktemp -d)
printf '{}\n' >"$DOCKER_CONFIG_DIR/config.json"
export SANDBOX_NAME="$RUN" OH_SANDBOX_IMAGE="$IMAGE" OH_PULL_POLICY=never \
       OH_DEPLOY_DOCKER_CONFIG="$DOCKER_CONFIG_DIR"

hc=$(awk '/^ *healthcheck:/ {inb=1} inb && /^ *(interval|retries|start_period):/ {print} inb && /^ *restart:/ {inb=0}' "$COMPOSE_FILE")
hc_interval=$(grep -Eo 'interval: *[0-9]+' <<<"$hc" | grep -Eo '[0-9]+' | head -1)
hc_retries=$(grep -Eo 'retries: *[0-9]+' <<<"$hc" | grep -Eo '[0-9]+' | head -1)
hc_start=$(grep -Eo 'start_period: *[0-9]+' <<<"$hc" | grep -Eo '[0-9]+' | head -1)
if [ -z "$hc_interval" ] || [ -z "$hc_retries" ] || [ -z "$hc_start" ]; then
  TORN_DOWN=1
  echo "error: could not read the healthcheck window out of ${COMPOSE_FILE#"$REPO_DIR"/}" >&2
  exit 1
fi
HC_DEADLINE=$((hc_start + hc_interval * hc_retries))
TIMEOUT=${OH_DEPLOY_TIMEOUT_SECONDS:-$((HC_DEADLINE + 300))}
if [ "$TIMEOUT" -le "$HC_DEADLINE" ]; then
  TORN_DOWN=1
  echo "error: OH_DEPLOY_TIMEOUT_SECONDS=$TIMEOUT does not clear the ${HC_DEADLINE}s healthcheck deadline" >&2
  exit 1
fi

echo "deployment guard: image=$IMAGE run=$RUN timeout=${TIMEOUT}s (healthcheck deadline ${HC_DEADLINE}s)"

if DOCKER_CONFIG="$DOCKER_CONFIG_DIR" docker pull "$IMAGE" >/dev/null; then
  ok "pulled $IMAGE"
else
  fail "could not pull $IMAGE"
  printf '\ndeployment guard: %d check(s) failed for %s\n' "${#failures[@]}" "$IMAGE" >&2
  exit 1
fi

if DOCKER_CONFIG="$DOCKER_CONFIG_DIR" bash "$IMAGE_VERIFIER" "$IMAGE"; then
  ok "image contract verified (nothing baked that must be installed at boot)"
else
  fail "verify-sandbox-image.sh rejected $IMAGE"
fi

if GIT_USER_NAME="$GUARD_GIT_NAME" \
   GIT_USER_EMAIL="$GUARD_GIT_EMAIL" \
   BOOT_SMOKE_FLAVOR=image-only \
   BOOT_SMOKE_COMPOSE="$COMPOSE_DRIVER" \
   BOOT_SMOKE_TIMEOUT_SECONDS="$TIMEOUT" \
   BOOT_SMOKE_DOWN_ARGS="ps -q" \
   bash "$BOOT_SMOKE"; then
  ok "image-only boot smoke passed (health, Herdr runtime, boot-provisioned harnesses and tools)"
else
  fail "image-only boot smoke failed — see its diagnostics above"
fi

CID=$(compose ps -q sandbox 2>/dev/null || true)
if [ -z "$CID" ]; then
  fail "no container for project $RUN after boot; cannot run the post-boot assertions"
  printf '\ndeployment guard: %d check(s) failed for %s\n' "${#failures[@]}" "$IMAGE" >&2
  exit 1
fi

logs=$(docker logs "$CID" 2>&1 || true)
if grep -qF 'no checkout bind at' <<<"$logs"; then
  ok "entrypoint took the no-bind seed branch"
else
  fail "entrypoint did not log 'no checkout bind at' — this boot did not take the seed branch"
fi
if grep -qF 'checkout bind detected at' <<<"$logs"; then
  fail "entrypoint logged 'checkout bind detected at' — a host checkout reached an image-only boot"
else
  ok "no checkout bind was detected, as the image-only flavor requires"
fi

if docker exec "$CID" test -f "$SEED_MARKER" 2>/dev/null; then
  ok "seed marker ${SEED_MARKER#"$PROJECT_ROOT"/} exists in the home mount"
else
  fail "seed marker $SEED_MARKER is missing — the control plane was not seeded from /opt/oh-seed"
fi

gitconfig=$(docker exec -u sandbox "$CID" bash -lc 'git config --global user.name; git config --global user.email' 2>/dev/null || true)
observed_name=$(sed -n 1p <<<"$gitconfig")
observed_email=$(sed -n 2p <<<"$gitconfig")
if [ "$observed_name" = "$GUARD_GIT_NAME" ] && [ "$observed_email" = "$GUARD_GIT_EMAIL" ]; then
  ok "GIT_USER_NAME and GIT_USER_EMAIL reached the sandbox gitconfig"
else
  fail "the sandbox gitconfig carries '$observed_name' <$observed_email>, not the identity the guard passed in"
fi

mount_count=$(docker inspect -f '{{len .Mounts}}' "$CID")
mount_shape=$(docker inspect -f '{{range .Mounts}}{{.Type}}:{{.Destination}} {{end}}' "$CID")
mount_shape=${mount_shape% }
if [ "$mount_count" = "1" ] && [ "$mount_shape" = "volume:/home/sandbox" ]; then
  ok "exactly one mount, the home volume at /home/sandbox"
else
  fail "expected exactly one volume mount at /home/sandbox, found $mount_count: ${mount_shape:-none}"
fi

published=$(docker inspect -f '{{range $p, $conf := .NetworkSettings.Ports}}{{if $conf}}{{$p}} {{end}}{{end}}' "$CID")
if [ -z "${published// /}" ]; then
  ok "no host port is published"
else
  fail "the container publishes host ports: $published"
fi

binds=$(docker inspect -f '{{range .HostConfig.Binds}}{{.}} {{end}}' "$CID")
if grep -qF '/var/run/docker.sock' <<<"$binds"; then
  fail "the container mounts the host Docker socket: $binds"
else
  ok "the host Docker socket is not mounted"
fi

privileged=$(docker inspect -f '{{.HostConfig.Privileged}}' "$CID")
if [ "$privileged" = "false" ]; then
  ok "the container is not privileged"
else
  fail "the container is privileged"
fi

catalog=$(docker exec -u sandbox "$CID" bash -lc 'oh harness list --json' 2>/dev/null || true)
candidate=$(jq -r 'first(.[] | select(.kind == "optional" and .installed != true and .enabled != true) | .id) // empty' <<<"$catalog" 2>/dev/null || true)
if [ -z "$candidate" ]; then
  fail "no kind:\"optional\" harness is both un-enabled and uninstalled, so the persist-and-install check would pass vacuously"
else
  binary=$(jq -r --arg id "$candidate" 'first(.[] | select(.id == $id) | .binary)' <<<"$catalog")
  if ! docker exec -u sandbox "$CID" bash -lc "oh harness install '$candidate'" >/tmp/deployment-guard-install.out 2>&1; then
    fail "'oh harness install $candidate' failed"
    tail -20 /tmp/deployment-guard-install.out >&2 || true
  else
    after=$(docker exec -u sandbox "$CID" bash -lc 'oh harness list --json' 2>/dev/null || true)
    enabled=$(jq -r --arg id "$candidate" 'first(.[] | select(.id == $id) | .enabled)' <<<"$after")
    installed=$(jq -r --arg id "$candidate" 'first(.[] | select(.id == $id) | .installed)' <<<"$after")
    if [ "$enabled" = "true" ]; then
      ok "install of '$candidate' persisted to oh.json"
    else
      fail "install of '$candidate' did not persist to oh.json (enabled=$enabled)"
    fi
    if [ "$installed" = "true" ]; then
      ok "install of '$candidate' landed in the running container"
    else
      fail "install of '$candidate' did not install into the running container (installed=$installed)"
    fi
    prefix=${NPM_USER_PREFIX:-/home/sandbox/.local}
    if resolved=$(docker exec -u sandbox "$CID" bash -lc "type -P '$binary'" 2>/dev/null) \
       && [ -n "$resolved" ] && [ "${resolved#"$prefix"/}" != "$resolved" ]; then
      ok "'$binary' resolves under $prefix ($resolved)"
    else
      fail "'$binary' does not resolve under $prefix after install (type -P gave: '${resolved:-}')"
    fi
  fi
fi

teardown
trap - EXIT INT TERM

if [ "$KEEP" != "1" ]; then
  for scope in container volume network; do
    if [ "${BEFORE[$scope]}" = "$(docker_names "$scope" | sort)" ]; then
      ok "$scope inventory is unchanged by this run"
    else
      fail "$scope inventory changed across this run"
    fi
  done
fi

if ((${#failures[@]})) || [ "$TEARDOWN_FAILED" = "1" ]; then
  printf '\ndeployment guard: %d check(s) failed for %s\n' "${#failures[@]}" "$IMAGE" >&2
  if ((${#failures[@]})); then printf '  - %s\n' "${failures[@]}" >&2; fi
  exit 1
fi

echo
echo "deployment guard: all checks passed for $IMAGE"
