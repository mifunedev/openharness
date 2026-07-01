#!/usr/bin/env bash
# tier: A
# source: #103 — eval probe suite gated in CI
# desc: string-presence (not semantic) check — the eval-probes CI job's runner invocation `bash .mifune/skills/eval/run.sh` must stay in ci-harness.yml so the regression gate can't be silently deleted
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
WORKFLOW="$ROOT/.github/workflows/ci-harness.yml"

if [[ ! -f "$WORKFLOW" ]]; then
  echo "SKIPPED: workflow file absent: $WORKFLOW" >&2
  exit 2
fi

# Unanchored match: the invocation is indented under the eval-probes job's
# `run:` step, so a `^bash` anchor would match nothing. Mirror boot-lint-glob.sh.
if grep -q 'bash .mifune/skills/eval/run.sh' "$WORKFLOW"; then
  echo "PASS: eval-probes CI gate invokes 'bash .mifune/skills/eval/run.sh' in $WORKFLOW" >&2
  exit 0
fi

echo "REGRESSION: eval-probes CI gate removed — no 'bash .mifune/skills/eval/run.sh' invocation in $WORKFLOW" >&2
exit 1
