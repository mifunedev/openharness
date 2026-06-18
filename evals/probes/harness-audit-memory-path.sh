#!/usr/bin/env bash
# tier: A
# source: issue #183 — /harness-audit must inspect the active worktree, not a hardcoded root
# desc: /harness-audit context snapshot must resolve AUDIT_ROOT for source inspection and avoid hardcoded source paths
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

if ! grep -q 'ls "\$AUDIT_ROOT/\.claude/skills/"' "$SKILL" || ! grep -q 'git -C "\$AUDIT_ROOT" worktree list' "$SKILL"; then
  echo "REGRESSION: harness-audit context snapshot does not inspect source via AUDIT_ROOT" >&2
  exit 1
fi

if grep -n '/home/sandbox/harness' "$SKILL" >"$TMP"; then
  echo "REGRESSION: harness-audit contains hardcoded root checkout paths:" >&2
  cat "$TMP" >&2
  exit 1
fi

echo "PASS: harness-audit resolves source inspection through AUDIT_ROOT" >&2
exit 0
