#!/usr/bin/env bash
# tier: A
# source: issue #410 — eval runner aggregate exit contract
# desc: /eval run.sh exits non-zero when regressions array is non-empty (exit-gate contract)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUN_SH="${RUN_SH:-$ROOT/.claude/skills/eval/run.sh}"

if [[ ! -f "$RUN_SH" ]]; then
  echo "SKIPPED: eval runner absent: $RUN_SH" >&2
  exit 2
fi

# Read only the file tail to assert the gate is CO-LOCATED at the exit point.
tail_content="$(tail -n 12 "$RUN_SH")"

# Require that the regressions-count check AND the exit 1 appear together in the tail.
if ! grep -qE 'regressions\[@\].*-gt 0.*exit 1' <<<"$tail_content"; then
  echo "REGRESSION: run.sh tail does not contain the co-located regressions-gated exit-1 guard (if [ \"\${#regressions[@]}\" -gt 0 ]; then exit 1; fi)" >&2
  exit 1
fi

echo "PASS: run.sh tail contains the regressions-gated non-zero exit guard co-located at the exit point" >&2
exit 0
