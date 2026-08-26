#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DOCKERFILE="${REPO_ROOT}/.devcontainer/Dockerfile"
PKG_JSON="${REPO_ROOT}/package.json"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dockerfile)
      DOCKERFILE="$2"
      shift 2
      ;;
    --package-json)
      PKG_JSON="$2"
      shift 2
      ;;
    *)
      echo "Unknown flag: $1" >&2
      exit 1
      ;;
  esac
done

if [[ ! -r "$DOCKERFILE" ]]; then
  echo "error: cannot read Dockerfile: $DOCKERFILE" >&2
  exit 1
fi
if [[ ! -r "$PKG_JSON" ]]; then
  echo "error: cannot read package.json: $PKG_JSON" >&2
  exit 1
fi

pkg_raw=$(grep '"packageManager"' "$PKG_JSON" \
  | sed 's/.*"packageManager"[[:space:]]*:[[:space:]]*"pnpm@//' \
  | sed 's/".*//')

pkg_ver=$(echo "$pkg_raw" | sed 's/+.*//')

if [[ -z "$pkg_ver" ]]; then
  echo "error: could not find packageManager field in $PKG_JSON" >&2
  exit 1
fi


corepack_line=$(grep 'corepack prepare pnpm@' "$DOCKERFILE" || true)

if [[ -z "$corepack_line" ]]; then
  echo "error: no 'corepack prepare pnpm@<version>' line found in $DOCKERFILE" >&2
  exit 1
fi

df_raw=$(echo "$corepack_line" \
  | sed 's/.*corepack prepare pnpm@//' \
  | awk '{print $1}')

if ! echo "$df_raw" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "error: Dockerfile pins 'pnpm@${df_raw}' which is not a valid semver (expected N.N.N) in $DOCKERFILE" >&2
  exit 1
fi

df_ver="$df_raw"

if [[ "$df_ver" == "$pkg_ver" ]]; then
  echo "OK: Dockerfile and package.json both pin pnpm@${df_ver}"
  exit 0
else
  echo "pnpm pin drift: Dockerfile pins pnpm@${df_ver}, package.json declares pnpm@${pkg_ver} — update .devcontainer/Dockerfile to match" >&2
  exit 1
fi
