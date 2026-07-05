#!/usr/bin/env bash
# tier: A
# source: get-oh.sh bootstrap — the only host-side path to the standalone `oh` CLI (unpublished npm pkg)
# desc: STATIC guard — `.oh/scripts/get-oh.sh` exists, is executable, uses the overridable repo form,
#       builds the CLI, symlinks `oh` onto PATH, and is documented in the README with a review-first pair.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SCRIPT="$ROOT/.oh/scripts/get-oh.sh"

# SKIPPED: bootstrap not present on this base (lets the probe land green pre-slice).
if [ ! -f "$SCRIPT" ]; then
  echo 'SKIPPED .oh/scripts/get-oh.sh not present' >&2
  exit 2
fi

[ -x "$SCRIPT" ] || { echo 'REGRESSION .oh/scripts/get-oh.sh is not executable' >&2; exit 1; }

# Overridable upstream-repo form (mirrors install.sh; keeps forks working).
# shellcheck disable=SC2016  # the ${...:-} literal is grepped, not expanded
grep -q '${OH_GITHUB_REPO:-' "$SCRIPT" || { echo 'REGRESSION get-oh.sh lost the OH_GITHUB_REPO override' >&2; exit 1; }

# Core contract: build the CLI, then symlink `oh` onto PATH (offline-payload design
# depends on the symlink pointing at the kept clone's dist/oh.js).
grep -q 'npm run build' "$SCRIPT" || { echo 'REGRESSION get-oh.sh no longer builds the CLI (npm run build)' >&2; exit 1; }
grep -Eq 'ln -sf .*/oh"' "$SCRIPT" || { echo 'REGRESSION get-oh.sh no longer symlinks oh onto PATH' >&2; exit 1; }
grep -q 'dist/oh.js' "$SCRIPT" || { echo 'REGRESSION get-oh.sh no longer targets the built dist/oh.js' >&2; exit 1; }

# Documented in the README (discoverability — this is the missing-bootstrap fix).
grep -q 'get-oh.sh' "$ROOT/README.md" || { echo 'REGRESSION README no longer documents get-oh.sh' >&2; exit 1; }

echo 'PASS get-oh.sh bootstrap intact (executable, overridable, builds+symlinks, documented)'
exit 0
