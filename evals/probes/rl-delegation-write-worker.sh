#!/usr/bin/env bash
# tier: A
# source: .oh/memory/MEMORY.md 2026-06-10 (rl-delegation) #57
# desc: /delegate SKILL.md must warn that the implementer/pm/critic sub-agent types are
#       read-only and recommend subagent_type general-purpose for any write/edit worker
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SKILL="$ROOT/.claude/skills/delegate/SKILL.md"

if [[ ! -f "$SKILL" ]]; then
  echo "SKIPPED: delegate skill absent: $SKILL" >&2
  exit 2
fi

# --- Scope the check to the warning region, NOT the whole file --------------
# The read-only warning lives in two places (US-001 / US-002); the AC allows
# either ("and/or"). Extract both candidate regions and check the union so an
# unrelated `read-only`/`general-purpose` occurrence elsewhere in the file
# cannot cause a false PASS.
#
#   Region 1 — the "Worker configuration:" bullet block under §5 Execute waves:
#              from the 'Worker configuration:' line to the trailing blank line.
#   Region 2 — the §Reference "Key Resources" block: from the '### Key Resources'
#              heading to the next '### '/'## ' heading (or EOF).
worker_block="$(awk '/^Worker configuration:/{f=1} f{print} f && /^[[:space:]]*$/{exit}' "$SKILL")"
keyres_block="$(awk '/^### Key Resources/{f=1; next} f && /^(### |## )/{exit} f{print}' "$SKILL")"

region="$(printf '%s\n%s\n' "$worker_block" "$keyres_block")"

# --- Distinguish "region not found" from "phrase missing" -------------------
if [[ -z "${region//[[:space:]]/}" ]]; then
  echo "REGRESSION: warning region not found in $SKILL (neither the 'Worker configuration:' block nor the '### Key Resources' section could be located)" >&2
  exit 1
fi

missing=()
# (a) a read-only warning that explicitly names at least one of implementer/pm/critic
grep -qi 'read-only' <<<"$region"                 || missing+=("'read-only' warning")
grep -qiE 'implementer|critic|(^|[^a-z])pm([^a-z]|$)' <<<"$region" \
                                                   || missing+=("an agent name (implementer/pm/critic)")
# (b) a general-purpose recommendation for write/edit workers
grep -qi 'general-purpose' <<<"$region"           || missing+=("'general-purpose' recommendation")

if (( ${#missing[@]} > 0 )); then
  echo "REGRESSION: required phrase missing from the /delegate read-only warning region: ${missing[*]}" >&2
  exit 1
fi

echo "PASS: /delegate warns implementer/pm/critic are read-only and recommends general-purpose for write workers" >&2
exit 0
