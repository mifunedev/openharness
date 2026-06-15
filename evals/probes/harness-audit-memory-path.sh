#!/usr/bin/env bash
# tier: A
# source: issue #176 — /harness-audit must load long-term memory from memory/MEMORY.md
# desc: /harness-audit context snapshot must not point at nonexistent root MEMORY.md
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SKILL="$ROOT/.claude/skills/harness-audit/SKILL.md"

if [[ ! -f "$SKILL" ]]; then
  echo "SKIPPED: harness-audit skill absent: $SKILL" >&2
  exit 2
fi

if grep -nE '/home/sandbox/harness/MEMORY\.md|(^|[^[:alnum:]_./-])MEMORY\.md([^[:alnum:]_/-]|$)' "$SKILL" \
  | grep -v 'memory/MEMORY.md' \
  | grep -v 'e.g.,' >/tmp/harness-audit-memory-path-hits.$$; then
  echo "REGRESSION: harness-audit references root MEMORY.md instead of memory/MEMORY.md:" >&2
  cat /tmp/harness-audit-memory-path-hits.$$ >&2
  rm -f /tmp/harness-audit-memory-path-hits.$$
  exit 1
fi
rm -f /tmp/harness-audit-memory-path-hits.$$

if ! grep -q '/home/sandbox/harness/memory/MEMORY\.md' "$SKILL"; then
  echo "REGRESSION: harness-audit context snapshot does not tail memory/MEMORY.md" >&2
  exit 1
fi

echo "PASS: harness-audit loads long-term memory from memory/MEMORY.md" >&2
exit 0
