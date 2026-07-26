#!/usr/bin/env bash
# tier: A
# source: issue #645 — audit consolidation public taxonomy
# desc: /audit exposes exactly nine explicit targets with canonical usage and private helpers
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
S="$ROOT/.oh/skills/audit/SKILL.md"
fail(){ echo "REGRESSION: $*" >&2; exit 1; }
[[ -f $S ]] || fail 'audit dispatcher missing'
usage='usage: /audit <implementation|pr|prs|harness|context|skills|eval-quality|drift|full> [target options]'
grep -Fq "$usage" "$S" || fail 'canonical usage missing'
for t in implementation pr prs harness context skills eval-quality drift full; do
  grep -Eq "^\| $t \|.*references/$t\.md" "$S" || fail "route missing: $t"
  [[ -f "$ROOT/.oh/skills/audit/references/$t.md" ]] || fail "reference missing: $t"
done
for trigger in 'audit this task' 'audit PR N' 'triage the PR queue' 'audit the harness' 'audit context budget' 'audit skills' 'lint evals' 'check framework drift' 'full audit campaign'; do
  grep -Fqi "$trigger" "$S" || fail "trigger missing: $trigger"
done
for helper in pr-classification external-proposal-audit; do
  ! grep -Eq "^\| $helper \|" "$S" || fail "private helper publicly routed: $helper"
done
for old in pr-audit harness-audit context-audit skill-lint eval-lint drift-check; do
  [[ ! -d "$ROOT/.oh/skills/$old" ]] || fail "legacy skill remains: $old"
done
[[ ! -e "$ROOT/.oh/agents/auditor.md" ]] || fail 'legacy auditor remains'
for kept in eval benchmark ci-status health-check critique approve watchdog wiki; do
  [[ -f "$ROOT/.oh/skills/$kept/SKILL.md" ]] || fail "retained instrument missing: $kept"
done
echo 'PASS: nine-target dispatcher contract' >&2
