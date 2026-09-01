#!/usr/bin/env bash
# tier: A
# source: issue #926 — execute launched a detached Advisor while promising a ready PR
# desc: detached execution is modelled as PLANNED -> RUNNING -> READY | DRAFT-BLOCKED(<gate>),
#       RUNNING is a real observable state backed by a status file, and launching the Advisor
#       is never reported as a synchronous READY
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
EXECUTE="$ROOT/.oh/skills/spec/references/execute.md"
SPEC="$ROOT/.oh/skills/spec/SKILL.md"
PROMPT="$ROOT/.oh/skills/spec/templates/task-prompt.md"

for f in "$EXECUTE" "$SPEC" "$PROMPT"; do
  [[ -f "$f" ]] || { echo "SKIPPED: required file absent: $f" >&2; exit 2; }
done

failures=()

# The lifecycle, in both the dispatcher and the procedure.
for f in "$EXECUTE" "$SPEC"; do
  name="$(basename "$f")"
  grep -qF 'PLANNED' "$f" || failures+=("$name does not name the PLANNED state")
  grep -qF 'RUNNING' "$f" || failures+=("$name does not name the RUNNING state")
  grep -qF 'DRAFT-BLOCKED(<gate>)' "$f" \
    || failures+=("$name does not name DRAFT-BLOCKED(<gate>) with the gate parameterized")
done

# RUNNING must be observable, not narrated.
grep -qF '/tmp/agent-spec-<slug>.state' "$EXECUTE" \
  || failures+=("execute.md defines no status file, so RUNNING is not observable")
grep -qF '/tmp/agent-spec-<slug>.state' "$PROMPT" \
  || failures+=("the task prompt does not tell the Advisor to keep the status file current")
grep -qF 'RUNNING %s' "$EXECUTE" \
  || failures+=("execute.md never writes the RUNNING state")
grep -qF "printf 'READY %s" "$EXECUTE" \
  || failures+=("execute.md never writes the READY terminal state")
grep -qF "printf 'DRAFT-BLOCKED(%s) %s" "$EXECUTE" \
  || failures+=("execute.md never writes a parameterized DRAFT-BLOCKED terminal state")

# The honesty rule: launching is RUNNING, not READY.
grep -qF 'not ceremony' "$SPEC" || grep -qF 'not decoration' "$EXECUTE" \
  || failures+=("neither surface states that RUNNING is a real state rather than ceremony")
grep -qF 'the terminal report is' "$EXECUTE" \
  || failures+=("execute.md does not say what the launch step actually reports")
grep -qF 'Promise a PR it has not seen' "$EXECUTE" \
  || failures+=("execute.md no longer forbids promising a PR the node has not seen")

# A silent stop is not a terminal state.
grep -qF 'a silent stop is not' "$EXECUTE" \
  || failures+=("execute.md no longer rejects a silent stop as a terminal state")

# The single-Advisor owner survives the lifecycle change (issue #926 pinned comment).
grep -qF 'one **expert Advisor' "$EXECUTE" \
  || failures+=("the single-Advisor executor model was retired")
grep -qF 'RUNNING' "$SPEC" \
  && grep -qF 'persistent Advisor' "$SPEC" \
  || failures+=("the dispatcher no longer ties RUNNING to the persistent Advisor")

if ((${#failures[@]})); then
  printf 'REGRESSION: %s\n' "${failures[@]}" >&2
  exit 1
fi

echo "PASS: detached execution reports RUNNING against a real status file and never promises a synchronous READY" >&2
exit 0
