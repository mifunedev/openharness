#!/usr/bin/env bash
# tier: A
# source: wikiskill arXiv:2608.27454 — the skill proposer reads accumulated knowledge first
# desc: /builder consults wiki patterns and the skill-impact ledger before proposing, and records the proposal after landing; frontmatter and dispatch remain owned by builder-skill-consolidation.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SKILL="$ROOT/.oh/skills/builder/SKILL.md"

if [[ ! -f "$SKILL" ]]; then
  echo "SKIPPED: /builder dispatcher absent" >&2
  exit 2
fi

failures=()
need() { grep -qF -- "$1" "$SKILL" || failures+=("builder/SKILL.md missing contract text: $1"); }

need '/wiki query <artifact-name-or-subsystem> --patterns'
need '.oh/evals/decisions/skill-impact.md'
need 'Do not re-propose a change recorded there as `REJECTED`'
need 'Append a `PROPOSED` record'
need 'none (direct request)'
need 'Never edit an existing record'

# The ledger this skill is told to write must actually exist.
[[ -f "$ROOT/.oh/evals/decisions/skill-impact.md" ]] \
  || failures+=("builder cites .oh/evals/decisions/skill-impact.md but the ledger does not exist")

# The reads builder is told to perform must be within its declared tool allowlist.
grep -q '^allowed-tools: Read, Write, Edit, Glob, Grep, Bash$' "$SKILL" \
  || failures+=("builder allowed-tools changed — the wiki and ledger steps need no new tool, so a change here is a design smell")

if ((${#failures[@]})); then
  printf 'REGRESSION: %s\n' "${failures[@]}" >&2
  exit 1
fi

echo "PASS: /builder reads wiki patterns and the skill-impact ledger before proposing, within its existing tool allowlist" >&2
exit 0
