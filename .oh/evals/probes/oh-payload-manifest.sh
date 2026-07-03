#!/usr/bin/env bash
# tier: A
# source: issue #531 follow-on (.oh payload manifest — oh update ships a declared allowlist)
# desc: oh update overlays only manifest-declared .oh payload (docs/patches excluded); static guard that the manifest + matcher + integration are wired.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

MANIFEST="$ROOT/.oh/manifest.json"
LIB_TS="$ROOT/.oh/cli/src/lib/manifest.ts"
UPDATE_TS="$ROOT/.oh/cli/src/commands/update.ts"

# SKIPPED: manifest not present on this base (lets the probe land green pre-slice).
if [ ! -f "$MANIFEST" ]; then
  echo 'SKIPPED .oh payload manifest not present' >&2
  exit 2
fi

# manifest.json must parse as JSON with a non-empty include array.
if ! jq -e 'has("include") and (.include|type=="array") and (.include|length>0)' "$MANIFEST" >/dev/null; then
  echo "REGRESSION .oh/manifest.json missing a non-empty include array" >&2
  exit 1
fi

# The include allowlist must NOT ship docs/** nor patches/**.
if ! jq -e '.include | index("docs/**") | not' "$MANIFEST" >/dev/null; then
  echo "REGRESSION .oh/manifest.json include must not contain docs/**" >&2
  exit 1
fi
if ! jq -e '.include | index("patches/**") | not' "$MANIFEST" >/dev/null; then
  echo "REGRESSION .oh/manifest.json include must not contain patches/**" >&2
  exit 1
fi

# The pure matcher/loader module must exist and export shouldShip + loadManifest.
if [ ! -f "$LIB_TS" ]; then
  echo "REGRESSION .oh/cli/src/lib/manifest.ts missing" >&2
  exit 1
fi
if ! grep -q 'export function shouldShip' "$LIB_TS"; then
  echo "REGRESSION lib/manifest.ts missing 'export function shouldShip'" >&2
  exit 1
fi
if ! grep -q 'export function loadManifest' "$LIB_TS"; then
  echo "REGRESSION lib/manifest.ts missing 'export function loadManifest'" >&2
  exit 1
fi

# update.ts must import the matcher and emit the skip marker for non-payload paths.
if ! grep -q "from '../lib/manifest.js'" "$UPDATE_TS"; then
  echo "REGRESSION update.ts does not import from '../lib/manifest.js'" >&2
  exit 1
fi
if ! grep -q '(not in payload)' "$UPDATE_TS"; then
  echo "REGRESSION update.ts missing '(not in payload)' skip marker" >&2
  exit 1
fi

echo "PASS: .oh payload manifest declares an allowlist (docs/patches excluded), matcher + integration wired" >&2
exit 0
