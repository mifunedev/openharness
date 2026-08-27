#!/usr/bin/env bash
# Base-parity check: install Node and pnpm in two Debian bases using the exact
# commands the sandbox Dockerfile uses, and require identical reported versions.
# Usage: node-pnpm-parity.sh [base-a] [base-b]

set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
DOCKERFILE=${PARITY_DOCKERFILE:-$REPO_ROOT/.devcontainer/Dockerfile}

BASE_A=${1:-debian:bookworm-slim}
BASE_B=${2:-debian:trixie-slim}

nodesource_url=$(grep -oE 'https://deb\.nodesource\.com/setup_[0-9]+\.x' "$DOCKERFILE" | head -1 || true)
pnpm_pin=$(grep -oE 'corepack prepare pnpm@[0-9]+\.[0-9]+\.[0-9]+' "$DOCKERFILE" | head -1 | cut -d@ -f2 || true)

if [ -z "$nodesource_url" ] || [ -z "$pnpm_pin" ]; then
  echo "FAIL: could not read the NodeSource URL or the pnpm pin from ${DOCKERFILE#"$REPO_ROOT"/}" >&2
  exit 1
fi

echo "NodeSource: $nodesource_url"
echo "pnpm pin:   $pnpm_pin"

install_snippet=$(cat <<EOF
set -e
apt-get update >/dev/null
apt-get install -y --no-install-recommends ca-certificates curl gnupg >/dev/null
curl -fsSL $nodesource_url | bash - >/dev/null 2>&1
apt-get install -y --no-install-recommends nodejs >/dev/null
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
corepack enable >/dev/null
corepack prepare pnpm@$pnpm_pin --activate >/dev/null 2>&1
printf '%s %s\n' "\$(node --version)" "\$(pnpm --version)"
EOF
)

measure() {
  local base="$1"
  docker run --rm --entrypoint /bin/bash "$base" -lc "$install_snippet" | tail -1
}

a=$(measure "$BASE_A")
b=$(measure "$BASE_B")

printf '\n%-24s node %s  pnpm %s\n' "$BASE_A" "${a%% *}" "${a##* }"
printf '%-24s node %s  pnpm %s\n' "$BASE_B" "${b%% *}" "${b##* }"

if [ "$a" = "$b" ]; then
  echo "PARITY: $BASE_A and $BASE_B report identical node and pnpm versions"
  exit 0
fi

echo "DIVERGENCE: $BASE_A reports '$a' but $BASE_B reports '$b'" >&2
exit 1
