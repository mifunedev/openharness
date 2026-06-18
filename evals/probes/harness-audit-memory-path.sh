#!/usr/bin/env bash
# tier: A
# source: issue #183 and #432 — /harness-audit must inspect active worktree source but load shared durable memory
# desc: /harness-audit context snapshot must resolve AUDIT_ROOT for source and AUDIT_LOG_ROOT for long-term memory
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SKILL="$ROOT/.claude/skills/harness-audit/SKILL.md"
TMP="/tmp/harness-audit-memory-path-hits.$$"
trap 'rm -f "$TMP"' EXIT

if [[ ! -f "$SKILL" ]]; then
  echo "SKIPPED: harness-audit skill absent: $SKILL" >&2
  exit 2
fi

if ! grep -q 'AUDIT_ROOT' "$SKILL" || ! grep -q 'CRON_WORKTREE' "$SKILL"; then
  echo "REGRESSION: harness-audit does not resolve AUDIT_ROOT from CRON_WORKTREE/current checkout" >&2
  exit 1
fi

if ! grep -q 'AUDIT_LOG_ROOT="${AUTOPILOT_LOG_ROOT:-\$AUDIT_ROOT}"' "$SKILL"; then
  echo "REGRESSION: harness-audit does not derive AUDIT_LOG_ROOT from AUTOPILOT_LOG_ROOT with AUDIT_ROOT fallback" >&2
  exit 1
fi

if ! grep -Eq 'tail -40 "\$AUDIT_LOG_ROOT/memory/MEMORY\.md"' "$SKILL"; then
  echo "REGRESSION: harness-audit context snapshot does not tail durable memory/MEMORY.md via AUDIT_LOG_ROOT" >&2
  exit 1
fi

if grep -Eq '^tail -40 "\$AUDIT_ROOT/memory/MEMORY\.md"' "$SKILL"; then
  echo "REGRESSION: harness-audit executable context snapshot tails long-term memory via AUDIT_ROOT" >&2
  exit 1
fi

if grep -n '/home/sandbox/harness' "$SKILL" >"$TMP"; then
  echo "REGRESSION: harness-audit contains hardcoded root checkout paths:" >&2
  cat "$TMP" >&2
  exit 1
fi

echo "PASS: harness-audit resolves source through AUDIT_ROOT and durable memory through AUDIT_LOG_ROOT" >&2
exit 0
