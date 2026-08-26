#!/usr/bin/env bash
# tier: A
# source: issue #758
# desc: the published portable copies of the skills in the mifunedev/skills registry must not reference a repo path or slash command an installer will not have
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
LINTER="$ROOT/.oh/scripts/registry-portability.sh"

REGISTRY="${OH_REGISTRY_CHECKOUT:-}"

if [[ -z "$REGISTRY" ]]; then
  echo "SKIPPED: no registry checkout supplied — set OH_REGISTRY_CHECKOUT to a clone of the published skills registry to arm this probe" >&2
  exit 2
fi

if [[ ! -d "$REGISTRY" ]]; then
  echo "SKIPPED: OH_REGISTRY_CHECKOUT is not a directory: $REGISTRY" >&2
  exit 2
fi

if [[ ! -d "$REGISTRY/skills" ]]; then
  echo "SKIPPED: OH_REGISTRY_CHECKOUT is not a registry checkout (no skills/ subdirectory): $REGISTRY" >&2
  exit 2
fi

if [[ ! -f "$LINTER" || ! -x "$LINTER" ]]; then
  echo "SKIPPED: portability linter absent or not executable: $LINTER" >&2
  exit 2
fi

set +e
out="$(bash "$LINTER" --registry "$REGISTRY" 2>&1)"
rc=$?
set -e

case "$rc" in
  0)
    echo "PASS: no unportable reference survives in the registry checkout at $REGISTRY" >&2
    exit 0
    ;;
  1)
    echo "REGRESSION: the portability linter reports a surviving finding in $REGISTRY" >&2
    printf '%s\n' "$out" >&2
    exit 1
    ;;
  2)
    echo "SKIPPED: the portability linter could not run (exit 2) against $REGISTRY" >&2
    printf '%s\n' "$out" >&2
    exit 2
    ;;
  *)
    echo "SKIPPED: the portability linter exited with an unexpected code $rc against $REGISTRY" >&2
    printf '%s\n' "$out" >&2
    exit 2
    ;;
esac
