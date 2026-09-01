#!/usr/bin/env bash
# tier: A
# source: issue #926 — execute returned before the build finished while promising a ready PR;
#         reconciled with issue #928, which made RUNNING task state rather than a process
# desc: execution is modelled as PLANNED -> RUNNING -> READY | DRAFT-BLOCKED(<gate>); RUNNING
#       is a real state of the TASK, mirrored into a status file that names no session, and a
#       run that returns mid-build is never reported as a synchronous READY
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
grep -qF '/tmp/spec-<slug>.state' "$EXECUTE" \
  || failures+=("execute.md defines no status file, so RUNNING is not observable")
grep -qF '/tmp/spec-<slug>.state' "$PROMPT" \
  || failures+=("the task prompt does not tell the owner to keep the status file current")

# RUNNING is a fact about the task graph, not about a running process (issue #928).
grep -qF "jq -e 'all(.userStories[]; .passes == true)'" "$EXECUTE" \
  || failures+=("execute.md does not derive RUNNING from the task graph")
grep -qF 'never the existence of a named process, session, tab, or pane' "$EXECUTE" \
  || failures+=("execute.md no longer decouples RUNNING from a named process/session/tab/pane")

# The status file is a mirror; the task graph is the authority.
grep -qF 'the task graph wins' "$EXECUTE" \
  || failures+=("execute.md does not subordinate the status file to the task graph")
grep -qF 'RUNNING %s' "$EXECUTE" \
  || failures+=("execute.md never writes the RUNNING state")
grep -qF "printf 'READY %s" "$EXECUTE" \
  || failures+=("execute.md never writes the READY terminal state")
grep -qF "printf 'DRAFT-BLOCKED(%s) %s" "$EXECUTE" \
  || failures+=("execute.md never writes a parameterized DRAFT-BLOCKED terminal state")

# The honesty rule: launching is RUNNING, not READY.
grep -qF 'not ceremony' "$SPEC" || grep -qF 'not decoration' "$EXECUTE" \
  || failures+=("neither surface states that RUNNING is a real state rather than ceremony")
grep -qF 'reports the state it actually reached' "$EXECUTE" \
  || failures+=("execute.md does not say that it reports the state it actually reached")
grep -qF 'Promise a PR it has not seen' "$EXECUTE" \
  || failures+=("execute.md no longer forbids promising a PR the node has not seen")

# A silent stop is not a terminal state.
grep -qF 'a silent stop is not' "$EXECUTE" \
  || failures+=("execute.md no longer rejects a silent stop as a terminal state")

# The single-owner model survives the lifecycle change (issue #926's pinned comment,
# as reconciled by issue #928: ownership is a role, not a terminal topology).
grep -qF 'the agent that is running it' "$EXECUTE" \
  || failures+=("the single-owner executor model was retired")
grep -qF 'Ownership is a **role**, not a terminal' "$EXECUTE" \
  || failures+=("execute.md no longer states that ownership is a role rather than a topology")

if ((${#failures[@]})); then
  printf 'REGRESSION: %s\n' "${failures[@]}" >&2
  exit 1
fi

echo "PASS: RUNNING is task state mirrored into a session-free status file, and a run that returns mid-build never promises a synchronous READY" >&2
exit 0
