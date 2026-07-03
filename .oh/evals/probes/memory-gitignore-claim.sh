#!/usr/bin/env bash
# tier: A
# source: issue #101
# desc: the Memory Improvement Protocol (.oh/skills/retro/references/memory-protocol.md) must not claim daily logs are git-tracked, and .gitignore must keep ignoring .oh/memory/[0-9]*/ so the false "tracked inside" persistence claim cannot return
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
GITIGNORE="$ROOT/.gitignore"
RULE="$ROOT/.oh/skills/retro/references/memory-protocol.md"

# SKIPPED guard: a grep against a missing file would silently false-PASS
# Assertion B (grep -q on absent file exits non-zero → "not present"), so
# bail out as SKIPPED if EITHER input file is absent.
if [[ ! -f "$GITIGNORE" ]]; then
  echo "SKIPPED: gitignore file absent: $GITIGNORE" >&2
  exit 2
fi
if [[ ! -f "$RULE" ]]; then
  echo "SKIPPED: rule file absent: $RULE" >&2
  exit 2
fi

# Assertion A: an UNCOMMENTED `.oh/memory/[0-9]*/` line must exist in .gitignore.
# Strip comment lines first so a commented-out `# .oh/memory/[0-9]*/` cannot
# false-PASS. The pattern is a literal string in the ignore file, so match
# fixed (-F), not as a regex.
if ! grep -v '^[[:space:]]*#' "$GITIGNORE" | grep -qF '.oh/memory/[0-9]*/'; then
  echo "REGRESSION: uncommented '.oh/memory/[0-9]*/' ignore rule missing from $GITIGNORE" >&2
  exit 1
fi

# Assertion B: the corrected rule must NOT reassert the false claim. The
# literal 'tracked inside' string was the false daily-log persistence claim.
if grep -qF 'tracked inside' "$RULE"; then
  echo "REGRESSION: false 'tracked inside' daily-log claim returned to $RULE" >&2
  exit 1
fi

echo "PASS: .gitignore keeps ignoring .oh/memory/[0-9]*/ and the Memory Improvement Protocol drops the false 'tracked inside' claim" >&2
exit 0
