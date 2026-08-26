#!/usr/bin/env bash
# Verify a built sandbox image: base distribution, apt suites, the sandbox
# UID/GID contract, the Node/pnpm pins, the Herdr checksum, and version output
# from every required default tool. Usage: verify-sandbox-image.sh <image-ref>

set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
DOCKERFILE=${VERIFY_IMAGE_DOCKERFILE:-$REPO_ROOT/.devcontainer/Dockerfile}

EXPECTED_CODENAME=trixie
EXPECTED_DOCKER_SUITE=trixie
EXPECTED_CLOUDFLARE_SUITE=bookworm
EXPECTED_UID=1000
EXPECTED_GID=1000
EXPECTED_NODE_MAJOR=22
EXPECTED_PNPM=10.33.0
EXPECTED_HERDR=0.7.4

usage() {
  echo "usage: ${0##*/} <image-ref>" >&2
  exit 2
}

IMAGE=${1:-}
[ -n "$IMAGE" ] || usage

failures=()
fail() { failures+=("$1"); echo "FAIL: $1" >&2; }
ok() { echo "ok: $1"; }

run() {
  docker run --rm --entrypoint /bin/bash "$IMAGE" -lc "$1"
}

arch=$(docker image inspect -f '{{.Architecture}}' "$IMAGE")
echo "verifying $IMAGE (architecture: $arch)"

case "$arch" in
  amd64) herdr_arch=x86_64 ;;
  arm64) herdr_arch=aarch64 ;;
  *) echo "FAIL: unsupported image architecture: $arch" >&2; exit 1 ;;
esac

expected_sha=$(
  awk -v a="$arch" '$0 ~ a"\\)" && /herdr_sha=/ {
    for (i = 1; i <= NF; i++) if ($i ~ /^herdr_sha=/) { sub(/^herdr_sha=/, "", $i); print $i; exit }
  }' "$DOCKERFILE"
)
if [ -z "$expected_sha" ]; then
  fail "no herdr_sha pinned for $arch in ${DOCKERFILE#"$REPO_ROOT"/}"
fi

codename=$(run '. /etc/os-release && printf "%s" "${VERSION_CODENAME:-}"')
if [ "$codename" = "$EXPECTED_CODENAME" ]; then
  ok "base distribution is Debian $EXPECTED_CODENAME"
else
  fail "base distribution codename is '$codename', expected '$EXPECTED_CODENAME'"
fi

docker_suite=$(run 'cat /etc/apt/sources.list.d/docker.list')
if grep -qF "linux/debian $EXPECTED_DOCKER_SUITE stable" <<<"$docker_suite"; then
  ok "Docker apt suite is $EXPECTED_DOCKER_SUITE"
else
  fail "Docker apt suite is not $EXPECTED_DOCKER_SUITE: $docker_suite"
fi

cf_suite=$(run 'cat /etc/apt/sources.list.d/cloudflared.list')
if grep -qF "cloudflared $EXPECTED_CLOUDFLARE_SUITE main" <<<"$cf_suite"; then
  ok "Cloudflare apt suite is $EXPECTED_CLOUDFLARE_SUITE (no Trixie suite is published)"
else
  fail "Cloudflare apt suite is not $EXPECTED_CLOUDFLARE_SUITE: $cf_suite"
fi

ids=$(run 'id -u sandbox; id -g sandbox')
built_uid=$(sed -n 1p <<<"$ids")
built_gid=$(sed -n 2p <<<"$ids")
if [ "$built_uid" = "$EXPECTED_UID" ] && [ "$built_gid" = "$EXPECTED_GID" ]; then
  ok "built-in sandbox user is $EXPECTED_UID:$EXPECTED_GID"
else
  fail "built-in sandbox user is $built_uid:$built_gid, expected $EXPECTED_UID:$EXPECTED_GID"
fi

node_version=$(run 'node --version')
if [[ "$node_version" == v"$EXPECTED_NODE_MAJOR".* ]]; then
  ok "node is major $EXPECTED_NODE_MAJOR ($node_version)"
else
  fail "node major is not $EXPECTED_NODE_MAJOR: $node_version"
fi

pnpm_version=$(run 'pnpm --version')
if [ "$pnpm_version" = "$EXPECTED_PNPM" ]; then
  ok "pnpm is exactly $EXPECTED_PNPM"
else
  fail "pnpm is $pnpm_version, expected exactly $EXPECTED_PNPM"
fi

herdr_version=$(run 'herdr --version')
if [ "$herdr_version" = "herdr $EXPECTED_HERDR" ]; then
  ok "herdr is $EXPECTED_HERDR"
else
  fail "herdr is '$herdr_version', expected 'herdr $EXPECTED_HERDR'"
fi

if [ -n "$expected_sha" ]; then
  actual_sha=$(run 'sha256sum /usr/local/bin/herdr' | awk '{print $1}')
  if [ "$actual_sha" = "$expected_sha" ]; then
    ok "installed herdr matches the $arch ($herdr_arch) Dockerfile checksum pin"
  else
    fail "installed herdr checksum $actual_sha does not match the $arch pin $expected_sha"
  fi
fi

# Under emulation `docker run` prefixes its output with a platform-mismatch
# warning on stderr. Drop it so the reported line is the tool's own version,
# not the runner's complaint about the architecture.
first_real_line() {
  grep -vE "^WARNING: The requested image's platform" | grep -m1 -E '[^[:space:]]' || true
}

for tool in "gh --version" "docker --version" "docker compose version" \
            "cloudflared --version" "bun --version" "uv --version"; do
  if out=$(run "$tool" 2>&1); then
    line=$(first_real_line <<<"$out")
    if [ -n "$line" ]; then
      ok "$tool -> $line"
    else
      fail "$tool exited cleanly but printed no version line"
    fi
  else
    fail "$tool produced no version output: $(first_real_line <<<"$out")"
  fi
done

if ((${#failures[@]})); then
  printf '\nverify-sandbox-image: %d check(s) failed\n' "${#failures[@]}" >&2
  printf '  - %s\n' "${failures[@]}" >&2
  exit 1
fi

echo "verify-sandbox-image: all checks passed for $IMAGE"
