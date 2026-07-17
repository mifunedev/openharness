#!/usr/bin/env bash
# tier: A
# source: issue #476 and #645 — memory appends are locked and audit has one log owner
# desc: audit targets suppress child logs while direct health-check retains locked append
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
A="$ROOT/.oh/skills/audit/SKILL.md"
grep -Fq 'exactly one locked append' "$A" || { echo 'REGRESSION: audit dispatcher lacks one-log ownership' >&2; exit 1; }
for f in "$ROOT/.oh/skills/audit/references/"{implementation,harness,context,skills,eval-quality,drift,pr,prs,full}.md; do
  [[ -f $f ]] || { echo "REGRESSION: route missing: $f" >&2; exit 1; }
  if grep -Eq 'locked-append\.sh|Append to `\.oh/memory|append to `\.oh/memory' "$f"; then
    echo "REGRESSION: child route owns memory append: $f" >&2; exit 1
  fi
done
for rel in .oh/skills/eval/SKILL.md .oh/skills/health-check/SKILL.md .oh/skills/wiki/references/ingest.md; do
  grep -Fq AUDIT_RUN_ID "$ROOT/$rel" || { echo "REGRESSION: $rel lacks child suppression" >&2; exit 1; }
done
grep -qF '.oh/scripts/locked-append.sh "$MEM/$TODAY/log.md" <<EOF' "$ROOT/.oh/skills/health-check/SKILL.md" || { echo 'REGRESSION: direct health-check lacks locked append' >&2; exit 1; }
echo 'PASS: one audit log owner; composed child logs suppressed; direct append locked' >&2
