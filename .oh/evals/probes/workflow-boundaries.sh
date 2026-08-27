#!/usr/bin/env bash
# tier: A
# source: conversation 2026-06-19 (workflow consolidation, issue #259); authority moved to /spec in issue #854
# desc: /spec owns the canonical operative path and root AGENTS.md does not duplicate workflow or skill procedures.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SPEC="$ROOT/.oh/skills/spec/SKILL.md"
AGENTS="$ROOT/AGENTS.md"
TEMPLATE="$ROOT/.oh/templates/AGENTS.md"

missing=()
[[ -f "$SPEC" ]] || missing+=(".oh/skills/spec/SKILL.md exists")
[[ -f "$AGENTS" ]] || missing+=("AGENTS.md exists")

if [[ -f "$SPEC" ]]; then
  grep -qF '## Workflow contract' "$SPEC" || missing+=("/spec workflow-contract section")
  grep -qF 'spec-plan → spec-execute → merge → reset|clean' "$SPEC" || missing+=("the in-order operative-path string")
  grep -qF 'There is no automated selection node' "$SPEC" || missing+=("the no-automated-selection statement")
  grep -qF 'This is the **only** spec pipeline' "$SPEC" || missing+=("the only-pipeline statement")
  grep -qF 'there is no all-in-one composer beside it' "$SPEC" || missing+=("the no-all-in-one-composer statement")
  grep -qF 'spec-critique' "$SPEC" && missing+=("no revived spec-critique node")
  grep -qF '/ship-spec' "$SPEC" && missing+=("no revived /ship-spec composer")
fi

if [[ -f "$AGENTS" ]]; then
  grep -qE '^## The Workflow$' "$AGENTS" && missing+=("AGENTS.md must not duplicate the workflow")
  grep -qE '^## Skills($| )' "$AGENTS" && missing+=("AGENTS.md must not duplicate the skill catalog")
  grep -qE '`/[a-z][a-z0-9-]*' "$AGENTS" && missing+=("AGENTS.md must not name slash skills directly")
fi
if [[ -f "$TEMPLATE" ]]; then
  grep -qE '^## (How work flows|Skills)$' "$TEMPLATE" && missing+=("the initialized-project AGENTS template must not duplicate workflows or skills")
  grep -qE '`/[a-z][a-z0-9-]*' "$TEMPLATE" && missing+=("the initialized-project AGENTS template must not name slash skills directly")
fi
[[ -e "$ROOT/.pi/prompts/execute.md" ]] && missing+=("the provider-specific execute prompt must stay removed")
[[ -e "$ROOT/.oh/templates/full/.pi/prompts/execute.md" ]] && missing+=("the scaffolded provider-specific execute prompt must stay removed")

if (( ${#missing[@]} )); then
  printf 'REGRESSION: workflow ownership broken: %s\n' "${missing[*]}" >&2
  exit 1
fi

echo "PASS: /spec owns the canonical workflow and AGENTS.md carries neither workflow nor skill sections"
