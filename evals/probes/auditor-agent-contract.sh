#!/usr/bin/env bash
# tier: A
# source: auditor agent — the primary manager/dispatcher of the audit-skill family must preserve its frozen scope-boundary contract
# desc: .mifune/agents/auditor.md registers an auditor agent that routes/composes the 7 audit skills without reimplementing them
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
AGENT="$ROOT/.mifune/agents/auditor.md"

if [[ ! -f "$AGENT" ]]; then
  echo "SKIPPED: auditor agent absent: $AGENT" >&2
  exit 2
fi

problems=()

# a. Anchor count must be exactly 1
anchor=$(grep -Fc '<!-- auditor-scope-boundary -->' "$AGENT" || true)
if [[ "$anchor" -ne 1 ]]; then
  problems+=("anchor count is $anchor (expected 1): <!-- auditor-scope-boundary -->")
fi

# b. Frontmatter name present
if ! grep -Eq '^name: auditor$' "$AGENT"; then
  problems+=("frontmatter 'name: auditor' missing")
fi

# c. tools: frontmatter line includes Skill
if ! grep -Eq '^tools:.*\bSkill\b' "$AGENT"; then
  problems+=("frontmatter 'tools:' line does not include 'Skill'")
fi

# d. All 7 skill literals present
for skill in '/harness-audit' '/pr-audit' '/audit' '/context-audit' '/skill-lint' '/drift-check' '/eval'; do
  if ! grep -Fq "$skill" "$AGENT"; then
    problems+=("skill literal missing: $skill")
  fi
done

# e. Orthogonality sentence naming the critic agent present
if ! grep -Fq 'orthogonal to the `critic` agent' "$AGENT"; then
  problems+=("scope-boundary orthogonality sentence naming 'critic' agent absent")
fi

if (( ${#problems[@]} > 0 )); then
  echo "REGRESSION: auditor agent scope-boundary contract is broken; issues:" >&2
  printf '  - %s\n' "${problems[@]}" >&2
  exit 1
fi

echo "PASS: auditor agent contract intact"
exit 0
