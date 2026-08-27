#!/usr/bin/env bash
# tier: A
# source: issue #531 follow-on (.oh payload manifest — oh update ships a declared allowlist)
# desc: oh update overlays only manifest-declared .oh payload (root docs and patches excluded); static guard that the manifest + matcher + integration are wired.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

MANIFEST="$ROOT/.oh/manifest.json"
LIB_TS="$ROOT/.oh/cli/src/lib/manifest.ts"
UPDATE_TS="$ROOT/.oh/cli/src/commands/update.ts"

if [ ! -f "$MANIFEST" ]; then
  echo 'SKIPPED .oh payload manifest not present' >&2
  exit 2
fi

if ! jq -e 'has("include") and (.include|type=="array") and (.include|length>0)' "$MANIFEST" >/dev/null; then
  echo "REGRESSION .oh/manifest.json missing a non-empty include array" >&2
  exit 1
fi

if ! jq -e '.include | index("docs/**") | not' "$MANIFEST" >/dev/null; then
  echo "REGRESSION .oh/manifest.json must not include root docs/**" >&2
  exit 1
fi
if ! jq -e '.include | index("patches/**") | not' "$MANIFEST" >/dev/null; then
  echo "REGRESSION .oh/manifest.json include must not contain patches/**" >&2
  exit 1
fi

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

if ! grep -q "from '../lib/manifest.js'" "$UPDATE_TS"; then
  echo "REGRESSION update.ts does not import from '../lib/manifest.js'" >&2
  exit 1
fi
if ! grep -q '(not in payload)' "$UPDATE_TS"; then
  echo "REGRESSION update.ts missing '(not in payload)' skip marker" >&2
  exit 1
fi

echo "PASS: .oh payload manifest excludes root docs and patches; matcher + integration wired" >&2
exit 0
