#!/usr/bin/env bash
# tier: A
# source: issue #183 — /audit harness must inspect the active worktree, not a hardcoded root
# desc: /audit harness context snapshot must resolve AUDIT_ROOT for source inspection and avoid hardcoded source paths
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SKILL="$ROOT/.oh/skills/audit/references/harness.md"
TMP="/tmp/audit harness-memory-path-hits.$$"
trap 'rm -f "$TMP"' EXIT

if [[ ! -f "$SKILL" ]]; then
  echo "SKIPPED: audit harness reference absent: $SKILL" >&2
  exit 2
fi

if ! grep -Fq ': "${AUDIT_ROOT:?outer audit dispatcher did not export AUDIT_ROOT}"' "$SKILL"; then
  echo "REGRESSION: audit harness does not require immutable dispatcher AUDIT_ROOT" >&2
  exit 1
fi

if ! grep -q 'ls "\$AUDIT_ROOT/\.claude/skills/"' "$SKILL" || ! grep -q 'git -C "\$AUDIT_ROOT" worktree list' "$SKILL"; then
  echo "REGRESSION: audit harness context snapshot does not inspect source via AUDIT_ROOT" >&2
  exit 1
fi

if grep -n '/home/sandbox/harness' "$SKILL" >"$TMP"; then
  echo "REGRESSION: audit harness contains hardcoded root checkout paths:" >&2
  cat "$TMP" >&2
  exit 1
fi

echo "PASS: audit harness consumes immutable source inspection root" >&2
exit 0
