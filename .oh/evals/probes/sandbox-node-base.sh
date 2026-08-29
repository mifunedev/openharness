#!/usr/bin/env bash
# tier: A
# source: openharness#878 — oh as the only front door, T0 sandbox base image
# desc: the sandbox image builds on an official node trixie base (node:*-trixie*), the NodeSource vendor-script install is gone from every .devcontainer/ asset, and the sandbox user is pinned to an explicit uid 1000 so bind-mounted files keep their host ownership even though the node image already claims uid 1000.
set -euo pipefail

PROBE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$PROBE_DIR" && git rev-parse --show-toplevel 2>/dev/null)" \
  || ROOT="$(cd "$PROBE_DIR/../../.." && pwd)"

DC="$ROOT/.devcontainer"
DOCKERFILE="$DC/Dockerfile"

if [[ ! -f "$DOCKERFILE" ]]; then
  echo "SKIPPED: not a source checkout — $DOCKERFILE absent" >&2
  exit 2
fi

fail=()

from_line="$(grep -m1 -E '^[[:space:]]*FROM[[:space:]]' "$DOCKERFILE" || true)"
if [[ -z "$from_line" ]]; then
  fail+=("(a) .devcontainer/Dockerfile has no FROM instruction")
elif ! grep -Eq '^[[:space:]]*FROM[[:space:]]+node:[^[:space:]]*trixie' <<<"$from_line"; then
  fail+=("(a) base image is not an official node trixie tag: ${from_line}")
fi

nodesource_hits="$(grep -rln 'deb\.nodesource\.com' "$DC" 2>/dev/null || true)"
if [[ -n "$nodesource_hits" ]]; then
  while IFS= read -r hit; do
    fail+=("(b) NodeSource install survives in ${hit#"$ROOT"/} — node comes from the base image now")
  done <<<"$nodesource_hits"
fi

if ! grep -Eq 'useradd[^|&]*-u[[:space:]]+1000[^|&]*[[:space:]]sandbox\b' "$DOCKERFILE"; then
  fail+=("(c) the sandbox user is not created with an explicit '-u 1000'; the node image already holds uid 1000, so sandbox would silently land on 1001 and bind-mounted files would change apparent ownership on the host")
fi

if (( ${#fail[@]} )); then
  printf 'REGRESSION: sandbox node base image contract broken:\n' >&2
  printf '  - %s\n' "${fail[@]}" >&2
  exit 1
fi

echo "PASS: sandbox builds on ${from_line#FROM }, no NodeSource vendor script under .devcontainer/, sandbox user pinned to uid 1000" >&2
exit 0
