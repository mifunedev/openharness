#!/usr/bin/env bash
# tier: A
# source: issue #90
# desc: CI boot-lint shellcheck glob must cover all four boot-script dirs (.devcontainer/, install/, scripts/, workspace/) so the coverage gap cannot silently reopen
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORKFLOW="$ROOT/.github/workflows/ci-harness.yml"

if [[ ! -f "$WORKFLOW" ]]; then
  echo "SKIPPED: workflow file absent: $WORKFLOW" >&2
  exit 2
fi

# Unanchored match: the invocation is indented inside a `run: |` block, so a
# `^shellcheck` anchor would match nothing. Grab the first matching line.
line=$(grep 'shellcheck -S warning' "$WORKFLOW" | head -1 || true)

# No false PASS on zero-match: workflow present but the lint line is gone is a
# regression, not a pass.
if [[ -z "$line" ]]; then
  echo "REGRESSION: no 'shellcheck -S warning' invocation found in $WORKFLOW" >&2
  exit 1
fi

missing=()
for dir in .devcontainer/ install/ scripts/ workspace/; do
  case "$line" in
    *"$dir"*) ;;
    *) missing+=("$dir") ;;
  esac
done

if (( ${#missing[@]} > 0 )); then
  echo "REGRESSION: boot-lint shellcheck glob dropped boot-script dir(s): ${missing[*]}" >&2
  echo "  line: $line" >&2
  exit 1
fi

echo "PASS: boot-lint shellcheck glob covers all four boot-script dirs (.devcontainer/, install/, scripts/, workspace/)" >&2
exit 0
