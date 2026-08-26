#!/usr/bin/env bash
# tier: A
# source: .oh/tasks/spec-simplification/ (issue #816, US-007) — the always-on tier was 85,256 B
#         / ~21,300 tokens, of which one file was 47,948 B (56%), and nothing stopped it
#         growing: every session appends, no session deletes.
# desc: the always-loaded context tier stays inside a declared budget, and no single file
#       dominates it. This is a RATCHET, not a measurement: the tier is read in full by every
#       session before any work begins, so growth here is a tax on every future run. The
#       budget is deliberately set just above today's size — the point is that regrowth must
#       be a decision someone makes by editing this number, not something that happens by
#       accumulation.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

TIER_BUDGET_BYTES=96000
SINGLE_FILE_SHARE_MAX=60


FILES=(
  "$ROOT/AGENTS.md"
  "$ROOT/.oh/context/SOUL.md"
  "$ROOT/.oh/context/IDENTITY.md"
  "$ROOT/.oh/context/TOOLS.md"
  "$ROOT/.oh/context/REPO_MAP.md"
  "$ROOT/.oh/context/USER.md"
)

total=0
largest=0
largest_name=""
report=()
for f in "${FILES[@]}"; do
  [[ -f "$f" ]] || continue
  b=$(wc -c < "$f" | tr -d ' ')
  total=$((total + b))
  report+=("$(printf '%8d B  %s' "$b" "${f#"$ROOT"/}")")
  if (( b > largest )); then largest=$b; largest_name="${f#"$ROOT"/}"; fi
done

if (( total == 0 )); then
  echo "SKIPPED: none of the always-on tier files are present at $ROOT" >&2
  exit 2
fi

share=$(( largest * 100 / total ))
problems=()
(( total <= TIER_BUDGET_BYTES )) \
  || problems+=("the always-on tier is $total B, over the $TIER_BUDGET_BYTES B budget — every session pays this before doing any work")
(( share <= SINGLE_FILE_SHARE_MAX )) \
  || problems+=("$largest_name is $share% of the tier (max $SINGLE_FILE_SHARE_MAX%) — one file dominating the always-on context is a compression target, not a feature")

if (( ${#problems[@]} > 0 )); then
  printf 'REGRESSION: always-on context tier budget exceeded:\n' >&2
  printf '  - %s\n' "${problems[@]}" >&2
  printf '  tier breakdown:\n' >&2
  printf '    %s\n' "${report[@]}" >&2
  printf '  Either compress the tier, or raise the budget in this probe DELIBERATELY and say why in the CHANGELOG.\n' >&2
  exit 1
fi

printf 'PASS: always-on tier is %d B of %d B budget (~%d tokens); largest file %s at %d%% of %d%% max\n' \
  "$total" "$TIER_BUDGET_BYTES" "$((total / 4))" "$largest_name" "$share" "$SINGLE_FILE_SHARE_MAX" >&2
exit 0
