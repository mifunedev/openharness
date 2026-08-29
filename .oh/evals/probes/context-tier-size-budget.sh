#!/usr/bin/env bash
# tier: A
# source: .oh/tasks/spec-simplification/ (issue #816, US-007) — the always-on tier was 85,256 B
#         / ~21,300 tokens, and nothing stopped it growing: every session appends, no session
#         deletes. Issue #868 collapsed the tier to AGENTS.md alone.
# desc: the single always-loaded context file AGENTS.md stays inside a declared byte budget.
#       This is a RATCHET, not a measurement: AGENTS.md is read in full by every session before
#       any work begins, so growth here is a tax on every future run. The budget is deliberately
#       set just above today's size — the point is that regrowth must be a decision someone makes
#       by editing this number, not something that happens by accumulation.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

TIER_BUDGET_BYTES=9500

AGENTS="$ROOT/AGENTS.md"

if [[ ! -f "$AGENTS" ]]; then
  echo "SKIPPED: the always-on context file AGENTS.md is not present at $ROOT" >&2
  exit 2
fi

total=$(wc -c < "$AGENTS" | tr -d ' ')

if (( total > TIER_BUDGET_BYTES )); then
  printf 'REGRESSION: always-on context budget exceeded:\n' >&2
  printf '  - AGENTS.md is %d B, over the %d B budget — every session pays this before doing any work\n' \
    "$total" "$TIER_BUDGET_BYTES" >&2
  printf '  Either compress the tier, or raise the budget in this probe DELIBERATELY and say why in the CHANGELOG.\n' >&2
  exit 1
fi

printf 'PASS: AGENTS.md is %d B of %d B budget (~%d tokens)\n' \
  "$total" "$TIER_BUDGET_BYTES" "$((total / 4))" >&2
exit 0
