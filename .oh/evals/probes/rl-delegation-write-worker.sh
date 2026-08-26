#!/usr/bin/env bash
# tier: A
# source: retro lesson 2026-06-10 (rl-delegation) #57
# desc: /delegate SKILL.md must warn that the implementer/pm/critic sub-agent types are
#       read-only and recommend subagent_type general-purpose for any write/edit worker
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SKILL="$ROOT/.claude/skills/delegate/SKILL.md"

if [[ ! -f "$SKILL" ]]; then
  echo "SKIPPED: delegate skill absent: $SKILL" >&2
  exit 2
fi

worker_block="$(awk '/^Worker configuration:/{f=1} f{print} f && /^[[:space:]]*$/{exit}' "$SKILL")"
keyres_block="$(awk '/^### Key Resources/{f=1; next} f && /^(### |## )/{exit} f{print}' "$SKILL")"

region="$(printf '%s\n%s\n' "$worker_block" "$keyres_block")"

if [[ -z "${region//[[:space:]]/}" ]]; then
  echo "REGRESSION: warning region not found in $SKILL (neither the 'Worker configuration:' block nor the '### Key Resources' section could be located)" >&2
  exit 1
fi

missing=()
grep -qi 'read-only' <<<"$region"                 || missing+=("'read-only' warning")
grep -qiE 'implementer|critic|(^|[^a-z])pm([^a-z]|$)' <<<"$region" \
                                                   || missing+=("an agent name (implementer/pm/critic)")
grep -qi 'general-purpose' <<<"$region"           || missing+=("'general-purpose' recommendation")

if (( ${#missing[@]} > 0 )); then
  echo "REGRESSION: required phrase missing from the /delegate read-only warning region: ${missing[*]}" >&2
  exit 1
fi

echo "PASS: /delegate warns implementer/pm/critic are read-only and recommends general-purpose for write workers" >&2
exit 0
