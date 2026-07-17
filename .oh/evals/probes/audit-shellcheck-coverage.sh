#!/usr/bin/env bash
# tier: A
# source: issue #645 — private audit scripts require release and CI lint coverage
# desc: both workflows explicitly shellcheck audit scripts and shared ablation owner
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
for f in .github/workflows/ci-harness.yml .github/workflows/release.yml; do
  grep -Fq '.oh/skills/audit/scripts/*.sh' "$ROOT/$f" || { echo "REGRESSION: $f omits audit scripts" >&2; exit 1; }
  grep -Fq '.oh/scripts/ablate.sh' "$ROOT/$f" || { echo "REGRESSION: $f omits ablate.sh" >&2; exit 1; }
done
echo 'PASS: shellcheck coverage' >&2
