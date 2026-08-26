#!/usr/bin/env bash
# tier: A
# source: npm publish path for the standalone `oh` CLI (@mifune/openharness) — alternative to get-oh.sh
# desc: STATIC guard — `.oh/cli/package.json` is publishable to npm: NOT private, publishConfig.access
#       "public", ships only the built `dist/` bundle, bin `oh` -> ./dist/oh.js, name @mifune/openharness,
#       engines.node declared, a README + LICENSE ship for the npm page, and publish-cli.yml carries the
#       publish-npm job (npm publish, run from .oh/cli). Complements get-oh-bootstrap.sh.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PKG="$ROOT/.oh/cli/package.json"

if [ ! -f "$PKG" ]; then
  echo 'SKIPPED .oh/cli/package.json not present' >&2
  exit 2
fi

if ! jq -e . "$PKG" >/dev/null 2>&1; then
  echo 'REGRESSION .oh/cli/package.json is not valid JSON' >&2
  exit 1
fi

if jq -e '.private == true' "$PKG" >/dev/null; then
  echo 'REGRESSION .oh/cli/package.json is marked private — npm publish would refuse it' >&2
  exit 1
fi

if ! jq -e '.name == "@mifune/openharness"' "$PKG" >/dev/null; then
  echo 'REGRESSION .oh/cli/package.json name is not @mifune/openharness' >&2
  exit 1
fi

if ! jq -e '.publishConfig.access == "public"' "$PKG" >/dev/null; then
  echo 'REGRESSION .oh/cli/package.json lost publishConfig.access="public"' >&2
  exit 1
fi

if ! jq -e '.files | index("dist")' "$PKG" >/dev/null; then
  echo 'REGRESSION .oh/cli/package.json files[] no longer ships "dist"' >&2
  exit 1
fi

if ! jq -e '.bin.oh == "./dist/oh.js"' "$PKG" >/dev/null; then
  echo 'REGRESSION .oh/cli/package.json bin.oh is not ./dist/oh.js' >&2
  exit 1
fi

if ! jq -e 'has("engines") and (.engines.node != null)' "$PKG" >/dev/null; then
  echo 'REGRESSION .oh/cli/package.json lost engines.node' >&2
  exit 1
fi

for f in README.md LICENSE; do
  if [ ! -f "$ROOT/.oh/cli/$f" ]; then
    echo "REGRESSION .oh/cli/$f is missing — npm package would ship without it" >&2
    exit 1
  fi
done

PUB="$ROOT/.github/workflows/publish-cli.yml"
REL="$ROOT/.github/workflows/release.yml"
WF=""
if [ -f "$PUB" ] && grep -q 'publish-npm' "$PUB"; then
  WF="$PUB"
elif [ -f "$REL" ] && grep -q 'publish-npm' "$REL"; then
  WF="$REL"
fi
if [ -z "$WF" ]; then
  echo 'REGRESSION no publish-npm job found in publish-cli.yml or release.yml' >&2
  exit 1
fi
grep -q 'npm .*publish' "$WF" \
  || { echo "REGRESSION $(basename "$WF") publish-npm job no longer runs npm publish" >&2; exit 1; }

echo 'PASS @mifune/openharness is npm-publishable (public, dist-only, bin oh, README+LICENSE) + publish-npm wired'
exit 0
