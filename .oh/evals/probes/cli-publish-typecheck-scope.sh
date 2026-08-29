#!/usr/bin/env bash
# tier: A
# source: release run 33271077312 — v0.5.0 pushed its GHCR image, then failed to publish
#         the CLI to npm: prepublishOnly runs typecheck:build, which pulled in
#         src/lib/__tests__/*.test.ts because tsconfig.build.json excluded only
#         src/__tests__/**, and vitest is a workspace-root dependency that the publish
#         environment does not install
# desc: every CLI test file lives under a __tests__/ directory, and
#       .oh/cli/tsconfig.build.json excludes all of them. Running the typecheck cannot
#       catch this: at the workspace root vitest resolves and it passes, so the failure
#       appears only when npm installs .oh/cli alone. The scope is asserted statically.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

CFG=".oh/cli/tsconfig.build.json"
SRC=".oh/cli/src"

if [[ ! -f "$CFG" || ! -d "$SRC" ]]; then
  echo "SKIPPED: not a source checkout ($CFG or $SRC missing)" >&2
  exit 2
fi

stray="$(find "$SRC" -name "*.test.ts" -not -path "*/__tests__/*" | sort)"
if [[ -n "$stray" ]]; then
  echo "REGRESSION: test files outside a __tests__/ directory are invisible to the exclude:" >&2
  printf '%s\n' "$stray" | sed 's|^|  |' >&2
  exit 1
fi

if ! grep -q '"src/\*\*/__tests__/\*\*"' "$CFG"; then
  echo "REGRESSION: $CFG does not exclude src/**/__tests__/**" >&2
  echo "  Current exclude: $(grep '"exclude"' "$CFG" || echo '(none)')" >&2
  echo "  prepublishOnly typechecks this config. A test file left in scope imports" >&2
  echo "  vitest, which npm does not install for .oh/cli alone, so the npm publish" >&2
  echo "  fails after the GHCR image has already been pushed." >&2
  exit 1
fi

count="$(find "$SRC" -name "*.test.ts" | wc -l | tr -d ' ')"
echo "PASS: $count test files, all under __tests__/ and excluded from the publish typecheck" >&2
exit 0
