#!/usr/bin/env bash
# tier: A
# source: conversation 2026-06-19 (issue #257); rewritten by spec-simplification US-002
#         (issue #816) when the three-executor world collapsed to one
# desc: the advisor agent (.oh/agents/advisor.md) § Pipeline variants codifies the monitored
#       async BUILD SESSION variant against the ONE build executor, .oh/scripts/spec-build.sh —
#       the CALLER (main loop) owns the STATUS watch (a sub-agent advisor cannot stay alive to
#       finalize), the session surfaces blocks, finalize routes through the promotable gate.
#       The retired executor arm must not reappear as a variant name.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
RULE="$ROOT/.oh/agents/advisor.md"

if [[ ! -f "$RULE" ]]; then
  echo "SKIPPED: advisor agent absent: $RULE" >&2
  exit 2
fi

section=$(awk '
  tolower($0) ~ /^## pipeline variants/ {f=1; print; next}
  f && /^## / {f=0}
  f {print}
' "$RULE")

if [[ -z "$section" ]]; then
  echo "REGRESSION: could not locate the '## Pipeline variants' section in $RULE" >&2
  exit 1
fi

missing=()

grep -qiF 'Monitored async build session'          <<<"$section" || missing+=("Monitored async build session variant name")
grep -qiF 'owns the sentinel watch'                <<<"$section" || missing+=("caller-owns-the-watch rule")
grep -qiF 'surfaces blocks'                        <<<"$section" || missing+=("session-surfaces-blocks property")
grep -qiF 'finalizes through the promotable gate'  <<<"$section" || missing+=("finalize-via-promotable-gate rule")

grep -qF '.oh/scripts/spec-build.sh'                <<<"$section" || missing+=("the launch contract .oh/scripts/spec-build.sh is not named in the variant")
grep -qF 'STATUS: COMPLETE'                        <<<"$section" || missing+=("the STATUS: COMPLETE terminal interface is not named in the variant")

if grep -qF 'ralph' "$RULE"; then
  echo "REGRESSION: $RULE still names the retired 'ralph' build arm — there is one executor" >&2
  exit 1
fi

if (( ${#missing[@]} )); then
  printf 'REGRESSION: advisor agent "Monitored async build session" variant missing: %s\n' "${missing[*]}" >&2
  exit 1
fi

echo "PASS: Monitored async build session variant codified against spec-build.sh (caller-owns-watch + surfaces-blocks + promotable-gate finalize), retired arm absent"
exit 0
