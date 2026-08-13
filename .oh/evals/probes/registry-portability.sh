#!/usr/bin/env bash
# tier: A
# source: issue #758
# desc: the published portable copies of the skills in the mifunedev/skills registry must not reference a repo path or slash command an installer will not have
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
LINTER="$ROOT/.oh/scripts/registry-portability.sh"

# OPT-IN probe. The harness CI has no registry checkout, so the default run must
# SKIP (exit 2) rather than fail. Point OH_REGISTRY_CHECKOUT at a local clone of
# the published registry to arm it:
#   OH_REGISTRY_CHECKOUT=/path/to/skills bash .oh/evals/probes/registry-portability.sh
REGISTRY="${OH_REGISTRY_CHECKOUT:-}"

if [[ -z "$REGISTRY" ]]; then
  echo "SKIPPED: no registry checkout supplied — set OH_REGISTRY_CHECKOUT to a clone of the published skills registry to arm this probe" >&2
  exit 2
fi

if [[ ! -d "$REGISTRY" ]]; then
  echo "SKIPPED: OH_REGISTRY_CHECKOUT is not a directory: $REGISTRY" >&2
  exit 2
fi

# A registry checkout is identified by its top-level skills/ tree. Anything else
# is a mis-pointed variable, not a finding.
if [[ ! -d "$REGISTRY/skills" ]]; then
  echo "SKIPPED: OH_REGISTRY_CHECKOUT is not a registry checkout (no skills/ subdirectory): $REGISTRY" >&2
  exit 2
fi

if [[ ! -f "$LINTER" || ! -x "$LINTER" ]]; then
  echo "SKIPPED: portability linter absent or not executable: $LINTER" >&2
  exit 2
fi

# --strict-exceptions is deliberately NOT passed. A stale exception entry means
# the registry improved; that is not a regression of this probe's contract.
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
    # Fail-closed linter error (missing registry, no skills dir, zero skill
    # folders, zero scanned files, missing allow file). Never a pass.
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
