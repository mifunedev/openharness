#!/usr/bin/env bash
# tier: A
# source: issue #645 — immutable audit root/run/log correlation
# desc: dispatcher and composed instruments preserve roots, child log suppression, and one outer append
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"; A="$ROOT/.oh/skills/audit/SKILL.md"
fail(){ echo "REGRESSION: $*" >&2; exit 1; }
for token in AUDIT_ROOT AUDIT_LOG_ROOT AUDIT_RUN_ID 'exactly one locked append' 'Inherited IDs' 'before any reference is read'; do grep -Fq "$token" "$A" || fail "dispatcher lacks $token"; done
grep -Eq 'audit-YYYYMMDDTHHMMSSZ|audit-\[0-9\]' "$A" || fail 'run-id shape absent'
for f in .oh/skills/eval/SKILL.md .oh/skills/health-check/SKILL.md .oh/skills/wiki/references/ingest.md; do
  grep -Fq 'AUDIT_RUN_ID' "$ROOT/$f" || fail "$f lacks audit child mode"
  grep -Eqi 'suppress|skip this append' "$ROOT/$f" || fail "$f does not suppress child logging"
done
grep -Fq 'AUDIT_ROOT' "$ROOT/.oh/skills/eval/run.sh" || fail 'eval ignores audit root'
! grep -Rqs '/home/sandbox/harness' "$ROOT/.oh/skills/audit/scripts" || fail 'audit script hard-codes root'
echo 'PASS: audit root/run/log contract' >&2
