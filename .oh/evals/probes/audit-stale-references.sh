#!/usr/bin/env bash
# tier: A
# source: issue #645 — clean-breaking audit migration
# desc: all tracked active surfaces, including current tasks/docs/templates/probes, reject stale public audit vocabulary
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"; cd "$ROOT"
pat='(^|[^A-Za-z0-9-])(pr-audit|harness-audit|context-audit|skill-lint|eval-lint|drift-check)([^A-Za-z0-9-]|$)|\.oh/skills/(pr-audit|harness-audit|context-audit|skill-lint|eval-lint|drift-check)(/|$)|auditor\.md'
set +e
hits=$(git grep -n -E "$pat" -- ':!CHANGELOG.md' ':!.oh/evals/RESULTS.md' ':!.oh/evals/datasets/**')
rc=$?; set -e
[[ $rc -eq 0 || $rc -eq 1 ]] || { echo 'REGRESSION: stale-reference inventory failed' >&2; exit 1; }
bad=()
while IFS= read -r hit; do
  [[ -n $hit ]] || continue
  path=${hit%%:*}; rest=${hit#*:}; line=${rest#*:}
  case "$path:$line" in
    .oh/evals/probes/audit-dispatcher-contract.sh:*|.oh/evals/probes/audit-stale-references.sh:*) continue;;
    .oh/tasks/audit-consolidation/prd.md:*|.oh/tasks/audit-consolidation/critique.md:*|.oh/tasks/audit-consolidation/prompt.md:*|.oh/tasks/audit-consolidation/reference-inventory.md:*) continue;;
    .oh/skills.lock:*Migrated*provenance*) continue;;
    .oh/scripts/link-providers.sh:*context-audit-runner.sh*|.oh/skills/audit/references/context.md:*context-audit-*|.oh/skills/audit/scripts/context-audit-runner.sh:*context-audit-*) continue;;
    .oh/skills/audit/references/pr.md:*pr-audit-proof*|.oh/skills/audit/references/prs.md:*pr-audit-proof*) continue;;
    .oh/skills/prompt-miner/scripts/mine-traces.mjs:*pr-audit*) continue;;
  esac
  bad+=("$hit")
done <<<"$hits"
if ((${#bad[@]})); then printf '%s\n' "${bad[@]}" >&2; echo 'REGRESSION: active legacy audit reference' >&2; exit 1; fi
# Assert breadth explicitly so future pathspec narrowing cannot silently drop active classes.
for path in AGENTS.md .oh/docs/README.md .oh/templates/AGENTS.md .oh/crons/heartbeat.md .github/workflows/ci-harness.yml .oh/evals/capability/tasks/CB-001-ship-harness-change.md .oh/tasks/audit-consolidation/progress.txt; do
  git ls-files --error-unmatch "$path" >/dev/null || { echo "REGRESSION: stale-reference coverage path missing: $path" >&2; exit 1; }
done
echo 'PASS: no active legacy audit references across tracked active surfaces' >&2
