#!/usr/bin/env bash
# tier: A
# source: issue #531 Phase 3 (oh update — upgrade only the .oh control plane)
# desc: oh update refreshes ONLY the .oh/ control plane (path-escape-guarded) and is version-gated; project source stays untouched.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

UPDATE_TS="$ROOT/.oh/cli/src/commands/update.ts"
VENDOR_TS="$ROOT/.oh/cli/src/lib/vendor.ts"
CLI_TS="$ROOT/.oh/cli/src/cli.ts"
TEST_TS="$ROOT/.oh/cli/src/__tests__/update.test.ts"

if [ ! -f "$UPDATE_TS" ]; then
  echo "SKIPPED oh update command not present" >&2
  exit 2
fi

if ! grep -q 'export async function runUpdate' "$UPDATE_TS"; then
  echo "REGRESSION update.ts missing 'export async function runUpdate'" >&2
  exit 1
fi

if ! grep -q 'refusing to write outside target .oh' "$VENDOR_TS"; then
  echo "REGRESSION vendor.ts missing path-escape guard message" >&2
  exit 1
fi
if ! grep -q 'copyOhPayload' "$UPDATE_TS"; then
  echo "REGRESSION update.ts does not route writes through the guarded copyOhPayload" >&2
  exit 1
fi

if ! grep -q 'package.json' "$UPDATE_TS"; then
  echo "REGRESSION update.ts missing package.json version reference" >&2
  exit 1
fi
if ! grep -q 'downgrade' "$UPDATE_TS"; then
  echo "REGRESSION update.ts missing downgrade refusal" >&2
  exit 1
fi

if ! grep -q 'runUpdate' "$CLI_TS"; then
  echo "REGRESSION cli.ts does not reference runUpdate" >&2
  exit 1
fi
if ! grep -Eq 'first === "update"' "$CLI_TS"; then
  echo "REGRESSION cli.ts missing 'first === \"update\"' dispatch" >&2
  exit 1
fi

if ! grep -q 'oh update' "$CLI_TS"; then
  echo "REGRESSION cli.ts help does not advertise 'oh update'" >&2
  exit 1
fi

if [ ! -f "$TEST_TS" ]; then
  echo "REGRESSION update.test.ts missing" >&2
  exit 1
fi

for token in 'assertDestInTarget' 'targetOh'; do
  if ! grep -q "$token" "$UPDATE_TS"; then
    echo "REGRESSION update.ts missing negative-guard token: $token" >&2
    exit 1
  fi
done

echo "PASS: oh update is .oh/-scoped (assertDestInTarget guard present), version-gated, and wired into cli.ts" >&2
exit 0
