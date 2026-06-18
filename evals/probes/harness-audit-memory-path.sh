#!/usr/bin/env bash
# tier: A
# source: issue #183 and #432 — /harness-audit must inspect active source but read durable memory from log root
# desc: /harness-audit context snapshot must resolve AUDIT_ROOT for source and AUDIT_LOG_ROOT for memory/log context
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

if ! grep -q '\$AUDIT_LOG_ROOT/memory/MEMORY\.md' "$SKILL"; then
  echo "REGRESSION: harness-audit context snapshot does not tail durable memory/MEMORY.md via AUDIT_LOG_ROOT" >&2
  exit 1
fi

if ! grep -q 'long_term_memory: loaded' "$SKILL" || ! grep -q 'long_term_memory: missing-or-unreadable' "$SKILL"; then
  echo "REGRESSION: harness-audit does not disclose whether AUDIT_LOG_ROOT long-term memory loaded" >&2
  exit 1
fi

if ! grep -q 'Use the Context Snapshot.*AUDIT_LOG_ROOT' "$SKILL"; then
  echo "REGRESSION: harness-audit auditor prompts do not direct memory/log inspection through AUDIT_LOG_ROOT context" >&2
  exit 1
fi

if grep -q '\$AUDIT_ROOT/memory/MEMORY\.md' "$SKILL"; then
  echo "REGRESSION: harness-audit tails durable memory from AUDIT_ROOT instead of AUDIT_LOG_ROOT" >&2
  exit 1
fi

if grep -n '/home/sandbox/harness' "$SKILL" >"$TMP"; then
  echo "REGRESSION: harness-audit contains hardcoded root checkout paths:" >&2
  cat "$TMP" >&2
  exit 1
fi

echo "PASS: harness-audit resolves source inspection through AUDIT_ROOT, durable memory through AUDIT_LOG_ROOT, and discloses memory load status" >&2
exit 0
