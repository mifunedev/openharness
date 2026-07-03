#!/usr/bin/env bash
# tier: A
# source: issue #90, issue #120
# desc: CI/release boot-lint shellcheck globs must cover active boot-script dirs and must not retain the removed workspace startup hook glob
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
WORKFLOWS=(
  "$ROOT/.github/workflows/ci-harness.yml"
  "$ROOT/.github/workflows/release.yml"
)

for workflow in "${WORKFLOWS[@]}"; do
  if [[ ! -f "$workflow" ]]; then
    echo "SKIPPED: workflow file absent: $workflow" >&2
    exit 2
  fi

  # Unanchored match: the invocation is indented inside a `run: |` block, so a
  # `^shellcheck` anchor would match nothing. Grab the first matching line.
  line=$(grep 'shellcheck -S warning' "$workflow" | head -1 || true)

  # No false PASS on zero-match: workflow present but the lint line is gone is a
  # regression, not a pass.
  if [[ -z "$line" ]]; then
    echo "REGRESSION: no 'shellcheck -S warning' invocation found in $workflow" >&2
    exit 1
  fi

  missing=()
  for dir in .devcontainer/ .oh/install/ .oh/scripts/; do
    case "$line" in
      *"$dir"*) ;;
      *) missing+=("$dir") ;;
    esac
  done

  if (( ${#missing[@]} > 0 )); then
    echo "REGRESSION: boot-lint shellcheck glob dropped active boot-script dir(s) in $workflow: ${missing[*]}" >&2
    echo "  line: $line" >&2
    exit 1
  fi

  if [[ "$line" == *"workspace/"* ]]; then
    echo "REGRESSION: boot-lint shellcheck glob still includes removed workspace startup hook dir in $workflow" >&2
    echo "  line: $line" >&2
    exit 1
  fi
done

echo "PASS: boot-lint shellcheck globs cover active boot-script dirs (.devcontainer/, .oh/install/, .oh/scripts/) and exclude removed workspace hook dir" >&2
exit 0
