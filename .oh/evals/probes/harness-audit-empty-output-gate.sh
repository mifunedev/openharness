#!/usr/bin/env bash
# tier: A
# source: issue #246 — /audit harness must fail closed on empty auditor outputs
# desc: /audit harness validates non-empty auditor sentinels before synthesis
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SKILL="$ROOT/.oh/skills/audit/references/harness.md"

if [[ ! -f "$SKILL" ]]; then
  echo "SKIPPED: harness-audit skill absent: $SKILL" >&2
  exit 2
fi

missing=()
for literal in \
  '### 3.5 Validate auditor outputs (fail closed)' \
  'PM_FINDINGS' \
  'IMP_FINDINGS' \
  'CRITIC_FINDINGS' \
  'EXP_FINDINGS' \
  'FAIL-AUDITOR-OUTPUT' \
  'blank/whitespace-only' \
  'missing sentinel' \
  'missing END' \
  'stop before deduplication/tier-ranking' \
  'Do **not** synthesize findings' \
  'Exit non-zero for the skill invocation'
do
  if ! grep -Fq "$literal" "$SKILL"; then
    missing+=("$literal")
  fi
done

if (( ${#missing[@]} > 0 )); then
  echo "REGRESSION: harness-audit empty-output fail-closed contract is incomplete; missing literals:" >&2
  printf '  - %s\n' "${missing[@]}" >&2
  exit 1
fi

echo "PASS: harness-audit fails closed on empty auditor outputs before synthesis" >&2
exit 0
