#!/usr/bin/env bash
# check-pnpm-pin.sh — detect pnpm-version drift between .oh/devcontainer/Dockerfile
# and package.json.
#
# Usage:
#   scripts/check-pnpm-pin.sh [--dockerfile <path>] [--package-json <path>]
#
# Exits 0 when both files pin the same pnpm version; exits 1 otherwise.

set -euo pipefail

# ---------------------------------------------------------------------------
# Defaults — resolved relative to this script's own location so the script
# is CWD-independent.
# ---------------------------------------------------------------------------
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DOCKERFILE="${REPO_ROOT}/.oh/devcontainer/Dockerfile"
PKG_JSON="${REPO_ROOT}/package.json"

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------
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

# ---------------------------------------------------------------------------
# Guard: files must be readable
# ---------------------------------------------------------------------------
if [[ ! -r "$DOCKERFILE" ]]; then
  echo "error: cannot read Dockerfile: $DOCKERFILE" >&2
  exit 1
fi
if [[ ! -r "$PKG_JSON" ]]; then
  echo "error: cannot read package.json: $PKG_JSON" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Extract version from package.json
# "packageManager": "pnpm@10.33.0"
# OR with Corepack integrity suffix: "pnpm@10.33.0+sha512.abc..."
# Strip the "+..." suffix so we always get bare semver.
# ---------------------------------------------------------------------------
pkg_raw=$(grep '"packageManager"' "$PKG_JSON" \
  | sed 's/.*"packageManager"[[:space:]]*:[[:space:]]*"pnpm@//' \
  | sed 's/".*//')

# Strip optional +<hash> integrity suffix
pkg_ver=$(echo "$pkg_raw" | sed 's/+.*//')

if [[ -z "$pkg_ver" ]]; then
  echo "error: could not find packageManager field in $PKG_JSON" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Extract version from Dockerfile
# Expected line form: corepack enable && corepack prepare pnpm@<ver> --activate
# ---------------------------------------------------------------------------

# Check whether a corepack prepare pnpm@ line exists at all
corepack_line=$(grep 'corepack prepare pnpm@' "$DOCKERFILE" || true)

if [[ -z "$corepack_line" ]]; then
  echo "error: no 'corepack prepare pnpm@<version>' line found in $DOCKERFILE" >&2
  exit 1
fi

# Extract the token after "pnpm@", stopping at the first whitespace
df_raw=$(echo "$corepack_line" \
  | sed 's/.*corepack prepare pnpm@//' \
  | awk '{print $1}')

# Validate: must be digits.digits.digits (semver), NOT e.g. "latest"
if ! echo "$df_raw" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "error: Dockerfile pins 'pnpm@${df_raw}' which is not a valid semver (expected N.N.N) in $DOCKERFILE" >&2
  exit 1
fi

df_ver="$df_raw"

# ---------------------------------------------------------------------------
# Compare
# ---------------------------------------------------------------------------
if [[ "$df_ver" == "$pkg_ver" ]]; then
  echo "OK: Dockerfile and package.json both pin pnpm@${df_ver}"
  exit 0
else
  echo "pnpm pin drift: Dockerfile pins pnpm@${df_ver}, package.json declares pnpm@${pkg_ver} — update .oh/devcontainer/Dockerfile to match" >&2
  exit 1
fi
