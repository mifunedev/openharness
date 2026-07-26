#!/usr/bin/env bash
# tier: A
# source: issue #432 — /audit harness must load durable memory from shared log root in cron worktrees
# desc: /audit harness context snapshot must tail AUDIT_LOG_ROOT/.oh/memory/MEMORY.md for long-term lessons, not AUDIT_ROOT.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SKILL="$ROOT/.oh/skills/audit/references/harness.md"

if [[ ! -f "$SKILL" ]]; then
  echo "SKIPPED: audit harness reference absent: $SKILL" >&2
  exit 2
fi

if ! grep -Fq 'tail -40 "$AUDIT_LOG_ROOT/.oh/memory/MEMORY.md"' "$SKILL"; then
  echo "REGRESSION: audit harness does not tail long-term memory from AUDIT_LOG_ROOT" >&2
  exit 1
fi

if grep -Fq 'tail -40 "$AUDIT_ROOT/.oh/memory/MEMORY.md"' "$SKILL"; then
  echo "REGRESSION: audit harness still tails long-term memory from AUDIT_ROOT" >&2
  exit 1
fi

if ! grep -Fq 'ls "$AUDIT_ROOT/.claude/skills/"' "$SKILL"; then
  echo "REGRESSION: audit harness source inspection no longer uses AUDIT_ROOT" >&2
  exit 1
fi

if ! grep -Fq 'ls "$AUDIT_LOG_ROOT/.oh/memory/"' "$SKILL"; then
  echo "REGRESSION: audit harness memory log discovery no longer uses AUDIT_LOG_ROOT" >&2
  exit 1
fi

if ! grep -Fq 'long_term_memory: loaded' "$SKILL" || ! grep -Fq 'long_term_memory: missing-or-unreadable' "$SKILL"; then
  echo "REGRESSION: audit harness does not surface long-term memory load status" >&2
  exit 1
fi

if ! grep -Fq "Context Snapshot's \`AUDIT_LOG_ROOT\` .oh/memory/log context" "$SKILL"; then
  echo "REGRESSION: audit harness Explorer prompt no longer routes .oh/memory/log checks through AUDIT_LOG_ROOT" >&2
  exit 1
fi

echo "PASS: audit harness tails durable memory from AUDIT_LOG_ROOT while inspecting source via AUDIT_ROOT and surfacing load status" >&2
exit 0
