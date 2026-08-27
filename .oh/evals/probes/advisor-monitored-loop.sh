#!/usr/bin/env bash
# tier: A
# source: conversation 2026-06-19 (single-owner implementation workflow, issue #257)
# desc: /spec execute gives one Advisor ownership of implementation and final gates; no
#       second implementation owner, nested session, or handoff may reappear
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
EXEC="$ROOT/.oh/skills/spec/references/execute.md"
PROMPT="$ROOT/.oh/skills/spec/templates/task-prompt.md"

for file in "$EXEC" "$PROMPT"; do
  if [[ ! -f "$file" ]]; then
    echo "SKIPPED: required file absent: $file" >&2
    exit 2
  fi
done

missing=()
grep -qiF 'single implementation Advisor' "$PROMPT" || missing+=("task prompt names one implementation Advisor")
grep -qiF 'Do not hand the task to a' "$PROMPT" && grep -qiF 'second implementation owner' "$PROMPT" || missing+=("task prompt forbids a second implementation owner")
grep -qiF 'Use `/delegate` only for bounded' "$PROMPT" || missing+=("task prompt limits /delegate to bounded fan-out")
grep -qiF 'write and commit `evidence.md`' "$PROMPT" || missing+=("task prompt keeps evidence ownership")
grep -qiF 'then run a fresh' "$PROMPT" && grep -qiF '/audit pr' "$PROMPT" || missing+=("task prompt keeps the final audit gate")
grep -qiF '/delegate' "$EXEC" || missing+=("execute procedure names /delegate as the implementation mechanism")
grep -qiF 'one **expert Advisor' "$EXEC" || missing+=("execute procedure names one Advisor owner")

retired_spec_build='.oh/scripts/spec-''build.sh'
retired_runner='.oh/scripts/lib/session-''runner.sh'
retired_agent='agent-''build-'
retired_timeout='BUILD_''SESSION_TIMEOUT_MS'
for retired in "$retired_spec_build" "$retired_runner" "$retired_agent" "$retired_timeout"; do
  grep -qF "$retired" "$EXEC" "$PROMPT" && missing+=("retired handoff marker remains: $retired")
done

if (( ${#missing[@]} )); then
  printf 'REGRESSION: single-owner /spec implementation contract broken:\n' >&2
  printf '  - %s\n' "${missing[@]}" >&2
  exit 1
fi

echo 'PASS: one /spec Advisor owns implementation and gates; /delegate is bounded fan-out; retired handoff is absent' >&2
