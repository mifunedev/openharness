#!/usr/bin/env bash
# tier: A
# source: conversation 2026-06-19 (single-owner implementation workflow, issue #257);
#         renamed from advisor-monitored-loop by issue #928 (retire automated /spec agent handoff)
# desc: /spec execute gives the agent that runs it sole ownership of implementation and the
#       final gates; no second implementation owner, supervisor, or handoff may reappear, and
#       ownership never depends on a separately launched process
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
grep -qiF 'single implementation owner' "$PROMPT" || missing+=("task prompt names one implementation owner")
grep -qiF 'Do not hand the task to a' "$PROMPT" && grep -qiF 'second implementation owner' "$PROMPT" || missing+=("task prompt forbids a second implementation owner")
grep -qiF 'Use `/delegate` only for bounded' "$PROMPT" || missing+=("task prompt limits /delegate to bounded fan-out")
grep -qiF 'write and commit `evidence.md`' "$PROMPT" || missing+=("task prompt keeps evidence ownership")
grep -qiF 'then run a fresh' "$PROMPT" && grep -qiF '/audit pr' "$PROMPT" || missing+=("task prompt keeps the final audit gate")
grep -qiF '/delegate' "$EXEC" || missing+=("execute procedure names /delegate as the implementation mechanism")
grep -qiF 'the agent that is running it' "$EXEC" || missing+=("execute procedure does not name the running agent as the owner")
grep -qiF 'never becomes a second supervisor' "$EXEC" || missing+=("execute procedure no longer bounds /delegate below the owner")
grep -qiF 'do not create a second implementation owner' "$EXEC" || missing+=("execute procedure no longer forbids a second implementation owner on resume")
grep -qiF 'Ownership is a **role**, not a terminal' "$EXEC" || missing+=("execute procedure no longer states ownership is a role, not a terminal topology")

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

echo 'PASS: the agent running /spec execute owns implementation and gates; /delegate is bounded fan-out; retired handoff is absent' >&2
