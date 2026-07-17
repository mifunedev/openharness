#!/usr/bin/env bash
# tier: A
# source: issue #645 — clean-breaking audit migration
# desc: active tracked sources do not advertise or invoke removed audit entry points
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"; cd "$ROOT"
pat='/(pr-audit|harness-audit|context-audit|skill-lint|eval-lint|drift-check)([^-A-Za-z0-9]|$)|\.oh/skills/(pr-audit|harness-audit|context-audit|skill-lint|eval-lint|drift-check)(/|$)|auditor\.md'
set +e
hits=$(git grep -n -E "$pat" -- ':!CHANGELOG.md' ':!.oh/evals/RESULTS.md' ':!.oh/evals/datasets/**' ':!.oh/tasks/**' ':!.oh/evals/probes/audit-stale-references.sh' ':!.oh/evals/probes/audit-dispatcher-contract.sh' ':!.oh/scripts/link-providers.sh')
rc=$?; set -e
[[ $rc -eq 1 ]] || { [[ $rc -eq 0 ]] && printf '%s\n' "$hits" >&2; echo 'REGRESSION: active legacy audit reference' >&2; exit 1; }
echo 'PASS: no active legacy audit references' >&2
