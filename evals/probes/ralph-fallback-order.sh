#!/usr/bin/env bash
# tier: A
# source: conversation 2026-06-12 (Ralph default fallback order)
# desc: Ralph defaults to claude->codex; explicit --harness=pi can still fall back to Codex
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RALPH="$ROOT/scripts/ralph.sh"
AUTOPILOT="$ROOT/.claude/skills/autopilot/SKILL.md"

if [[ ! -f "$RALPH" ]]; then
  echo "SKIPPED: Ralph runner absent: $RALPH" >&2
  exit 2
fi

claude_branch="$(awk '
  /case "\$harness" in/ { in_case=1 }
  in_case && /^[[:space:]]*claude\)/ { f=1; next }
  f && /^[[:space:]]*;;/ { exit }
  f { print }
' "$RALPH")"

pi_branch="$(awk '
  /case "\$harness" in/ { in_case=1 }
  in_case && /^[[:space:]]*pi\)/ { f=1; next }
  f && /^[[:space:]]*;;/ { exit }
  f { print }
' "$RALPH")"

missing=()
grep -q 'command -v codex' <<<"$claude_branch" || missing+=("claude branch checks codex")
grep -q 'printf .*codex' <<<"$claude_branch" || missing+=("claude branch returns codex")
grep -q 'command -v codex' <<<"$pi_branch" || missing+=("pi branch checks codex")
grep -q 'printf .*codex' <<<"$pi_branch" || missing+=("pi branch returns codex")
grep -q 'export RALPH_HARNESS="$harness"' "$RALPH" || missing+=("active harness exported to iterations")

if grep -q 'command -v pi\|printf .*pi' <<<"$claude_branch"; then
  echo "REGRESSION: Ralph Claude fallback branch still routes through Pi before Codex" >&2
  exit 1
fi

if (( ${#missing[@]} > 0 )); then
  echo "REGRESSION: Ralph fallback order guarantee missing: ${missing[*]}" >&2
  exit 1
fi

if [[ -f "$AUTOPILOT" ]] && grep -q 'claude→pi→codex' "$AUTOPILOT"; then
  echo "REGRESSION: autopilot still documents Ralph fallback as claude->pi->codex" >&2
  exit 1
fi

echo "PASS: Ralph default fallback is claude->codex and explicit Pi can fall back to Codex" >&2
exit 0
