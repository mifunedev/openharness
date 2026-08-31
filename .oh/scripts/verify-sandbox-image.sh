#!/usr/bin/env bash
# Verify a built sandbox image: base distribution, apt suites, the sandbox
# UID/GID contract, the Node/pnpm pins, and version output from every baked-in
# tool; that no harness and no kind:"default" tool is baked into it; and that
# every kind:"baked-in" tool actually is.
# Usage: verify-sandbox-image.sh <image-ref>

set -euo pipefail

EXPECTED_CODENAME=trixie
EXPECTED_DOCKER_SUITE=trixie
EXPECTED_UID=1000
EXPECTED_GID=1000
EXPECTED_NODE_MAJOR=22
EXPECTED_PNPM=10.33.0

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
  amd64|arm64) ;;
  *) echo "FAIL: unsupported image architecture: $arch" >&2; exit 1 ;;
esac

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

# Under emulation `docker run` prefixes its output with a platform-mismatch
# warning on stderr. Drop it so the reported line is the tool's own version,
# not the runner's complaint about the architecture.
first_real_line() {
  grep -vE "^WARNING: The requested image's platform" | grep -m1 -E '[^[:space:]]' || true
}

has_numeric_dotted_version() {
  grep -Eq '(^|[^[:alnum:]])v?[0-9]+([.][0-9]+)+([^[:alnum:]]|$)'
}

for tool in "gh --version" "docker --version" "docker compose version" \
            "bun --version" "uv --version"; do
  if out=$(run "$tool" 2>&1); then
    line=$(first_real_line <<<"$out")
    if has_numeric_dotted_version <<<"$line"; then
      ok "$tool -> $line"
    else
      fail "$tool exited cleanly but its version line has no numeric dotted version: $line"
    fi
  else
    fail "$tool produced no version output: $(first_real_line <<<"$out")"
  fi
done

# The image must ship NO harness at all (#904, #908) and no kind:"default" tool
# (#906). Every one of them is installed into /home/sandbox/.local at boot or on
# demand through `oh harness install` / `oh tool install`: a copy baked into a
# system path shadows the home-mount install with one no running sandbox can
# upgrade, and makes the install path dead code that never runs and never gets
# tested. The catalogs inside the image are the source of truth, so this cannot
# drift from the TypeScript. Tools that are kind:"baked-in" — the Docker CLI,
# gh — are genuinely image-level and are exempt.
check_nothing_baked() {
  local noun="$1" cmd="$2" filter="$3" json ids baked

  if ! json=$(run "cd /opt/oh-seed && OH_EXECUTION_TARGET=local oh $cmd list --json" 2>/tmp/verify-sandbox-defaults.err); then
    fail "could not read the $noun catalog from the image: $(head -3 /tmp/verify-sandbox-defaults.err 2>/dev/null)"
    return
  fi

  ids=$(jq -r "$filter | .id" <<<"$json")
  if [ -z "$ids" ]; then
    fail "the image's $noun catalog matched no entry for '$filter' — the unbaked-image check would pass vacuously"
    return
  fi

  baked=$(jq -r "$filter | select(.installed == true) | \"\(.id) (\(.binary))\"" <<<"$json")
  if [ -n "$baked" ]; then
    fail "the image ships baked ${noun}s: $(tr '\n' ' ' <<<"$baked")— these must be installed into /home/sandbox/.local by the CLI, not baked"
  else
    ok "no $noun is baked into the image ($(tr '\n' ' ' <<<"$ids"))"
  fi
}

if command -v jq >/dev/null 2>&1; then
  # Every harness, whatever its kind — none belongs in the image.
  check_nothing_baked harness harness '.[]'
  # Tools split: kind:"default" is provisioned, kind:"baked-in" is image-level.
  check_nothing_baked "default tool" tool '.[] | select(.kind == "default")'
else
  fail "jq is required to read the image's harness and tool catalogs"
fi

# The inverse for tools: a kind:"baked-in" tool must actually be present, or the
# check above is passing because the image is simply missing everything.
if command -v jq >/dev/null 2>&1; then
  if baked_json=$(run "cd /opt/oh-seed && OH_EXECUTION_TARGET=local oh tool list --json" 2>/dev/null); then
    absent=$(jq -r '.[] | select(.kind == "baked-in" and .installed != true) | .id' <<<"$baked_json")
    present=$(jq -r '.[] | select(.kind == "baked-in") | .id' <<<"$baked_json")
    if [ -z "$present" ]; then
      fail "the image's tool catalog declares no kind:\"baked-in\" tool — nothing anchors the image-level half"
    elif [ -n "$absent" ]; then
      fail "baked-in tools are missing from the image: $(tr '\n' ' ' <<<"$absent")"
    else
      ok "every baked-in tool is present ($(tr '\n' ' ' <<<"$present"))"
    fi
  fi
fi

if ((${#failures[@]})); then
  printf '\nverify-sandbox-image: %d check(s) failed\n' "${#failures[@]}" >&2
  printf '  - %s\n' "${failures[@]}" >&2
  exit 1
fi

echo "verify-sandbox-image: all checks passed for $IMAGE"
