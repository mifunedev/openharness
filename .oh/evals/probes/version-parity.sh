#!/usr/bin/env bash
# tier: A
# source: conversation 2026-08-29 — the oh CLI became the only lifecycle door, so its
#         npm version is the only version a user can see, and it had drifted two minors
#         behind the harness while release.yml no-opped silently on the stale tag
# desc: the root package.json version, the .oh/cli package.json version, and a dated
#       CHANGELOG heading for that version all agree, so a release publishes the CLI
#       the harness ships and reserve-github-release.mjs cannot classify the push as
#       already-released and skip the image, the npm publish, and the GitHub release.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

ROOT_PKG="package.json"
CLI_PKG=".oh/cli/package.json"
CHANGELOG="CHANGELOG.md"

for f in "$ROOT_PKG" "$CLI_PKG" "$CHANGELOG"; do
  if [[ ! -f "$f" ]]; then
    echo "SKIPPED: not a source checkout ($f missing)" >&2
    exit 2
  fi
done

read_version() {
  node -p "require('./$1').version" 2>/dev/null || true
}

root_version="$(read_version "$ROOT_PKG")"
cli_version="$(read_version "$CLI_PKG")"

if [[ -z "$root_version" || -z "$cli_version" ]]; then
  echo "SKIPPED: node unavailable or version unreadable" >&2
  exit 2
fi

if [[ "$root_version" != "$cli_version" ]]; then
  echo "REGRESSION: version drift — $ROOT_PKG is $root_version but $CLI_PKG is $cli_version" >&2
  echo "  publish-cli.yml treats an already-published CLI version as a successful no-op," >&2
  echo "  so a mismatch ships a harness whose only door is a stale npm bundle." >&2
  exit 1
fi

if ! grep -qE "^## \[${root_version//./\\.}\] - [0-9]{4}-[0-9]{2}-[0-9]{2}$" "$CHANGELOG"; then
  echo "REGRESSION: $CHANGELOG has no dated '## [$root_version] - YYYY-MM-DD' heading" >&2
  echo "  release.yml extracts release notes by that exact heading and falls back to a" >&2
  echo "  generic note without it." >&2
  exit 1
fi

echo "PASS: version $root_version is consistent across $ROOT_PKG, $CLI_PKG, and $CHANGELOG" >&2
exit 0
