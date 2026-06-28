#!/usr/bin/env bash
# tier: A
# source: conversation 2026-06-15 — rules are not always supported; git workflow must be the /git skill
# desc: .oh/context/rules/git.md is only a pointer and the executable git conventions live in /git.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SKILL="$ROOT/.claude/skills/git/SKILL.md"
RULE="$ROOT/.oh/context/rules/git.md"
AGENTS="$ROOT/AGENTS.md"
WORKTREES="$ROOT/.claude/skills/worktrees/SKILL.md"
CLEANUP="$ROOT/crons/cleanup-tasks.md"
CHANGELOG="$ROOT/CHANGELOG.md"

missing=()

[[ -f "$SKILL" ]] || missing+=("/git skill exists")
[[ -f "$RULE" ]] || missing+=(".oh/context/rules/git.md pointer exists")

if [[ -f "$SKILL" ]]; then
  grep -Fq 'name: git' "$SKILL" || missing+=("skill frontmatter name")
  grep -Fq 'Provider Portability' "$SKILL" || missing+=("skill explains provider portability")
  grep -Fq 'Issue Titles' "$SKILL" || missing+=("issue title convention moved to skill")
  grep -Fq 'Branch Names' "$SKILL" || missing+=("branch convention moved to skill")
  grep -Fq 'Default Target Branch' "$SKILL" || missing+=("base detection moved to skill")
  grep -Fq 'PR Titles' "$SKILL" || missing+=("PR title convention moved to skill")
  grep -Fq 'Changelog' "$SKILL" || missing+=("changelog policy moved to skill")
  grep -Fq 'Worktrees' "$SKILL" || missing+=("worktree policy moved to skill")
  grep -Fq 'Stacked PRs' "$SKILL" || missing+=("stacked PR policy moved to skill")
  grep -Fq 'Releases' "$SKILL" || missing+=("release policy moved to skill")
  grep -Fq 'After Push' "$SKILL" || missing+=("after-push CI policy moved to skill")
fi

if [[ -f "$RULE" ]]; then
  grep -Fq 'Provider-portable source of truth: `/git`' "$RULE" || missing+=("rules file points to /git")
  grep -Fq 'This file intentionally stays as a short compatibility pointer' "$RULE" || missing+=("rules file declares pointer-only role")
  if grep -Fq '## Branch Names' "$RULE" || grep -Fq '## Releases' "$RULE" || grep -Fq '## Worktrees' "$RULE"; then
    missing+=("rules file still contains active git workflow sections")
  fi
fi

grep -Fq '| `/git` | Provider-portable source of truth' "$AGENTS" || missing+=("AGENTS lists /git")
grep -Fq 'Full provider-portable policy lives in `/git`' "$AGENTS" || missing+=("AGENTS git section points to /git")
grep -Fq 'Full policy: `/git` § Worktrees' "$WORKTREES" || missing+=("/worktrees points to /git")
grep -Fq 'per `/git`' "$CLEANUP" || missing+=("cleanup cron points to /git")
grep -Fq '.claude/skills/git/SKILL.md' "$CHANGELOG" || missing+=("CHANGELOG top pointer references skill")

if (( ${#missing[@]} )); then
  printf 'REGRESSION: git workflow skill migration incomplete: %s\n' "${missing[*]}" >&2
  exit 1
fi

echo "PASS: git workflow lives in /git and .oh/context/rules/git.md is a provider-compat pointer" >&2
exit 0
