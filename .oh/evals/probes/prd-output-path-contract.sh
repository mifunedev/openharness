#!/usr/bin/env bash
# tier: A
# source: .oh/memory/MEMORY.md 2026-06-19
# desc: /prd skill uses canonical .oh/tasks/<feature-name>/prd.md output path
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

skill_files=("$ROOT/.claude/skills/prd/SKILL.md")
if [ -f "$ROOT/.pi/skills/prd/SKILL.md" ]; then
  skill_files+=("$ROOT/.pi/skills/prd/SKILL.md")
fi

missing=()
for file in "${skill_files[@]}"; do
  [ -f "$file" ] || { missing+=("$file"); continue; }
  if grep -q '\.oh/tasks/prd-\[feature-name\]\.md' "$file"; then
    echo "REGRESSION: stale flat PRD path remains in ${file#$ROOT/}" >&2
    exit 1
  fi
  if ! grep -q '\.oh/tasks/<feature-name>/prd\.md' "$file"; then
    echo "REGRESSION: canonical PRD path missing from ${file#$ROOT/}" >&2
    exit 1
  fi
done

if [ "${#missing[@]}" -gt 0 ]; then
  printf 'REGRESSION: missing PRD skill file(s): %s\n' "${missing[*]}" >&2
  exit 1
fi

echo "PASS: /prd output path contract is canonical" >&2
