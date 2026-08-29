#!/usr/bin/env bash
# tier: A
# source: conversation 2026-06-15 — rules are not always supported; git workflow must be the /git skill
# desc: the executable git conventions live in /git.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SKILL="$ROOT/.claude/skills/git/SKILL.md"
WORKTREES="$ROOT/.claude/skills/worktrees/SKILL.md"
CLEANUP="$ROOT/crons/cleanup-tasks.md"
CHANGELOG="$ROOT/CHANGELOG.md"

missing=()

[[ -f "$SKILL" ]] || missing+=("/git skill exists")

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

grep -Fq 'Full policy: `/git` § Worktrees' "$WORKTREES" || missing+=("/worktrees points to /git")
grep -Fq 'per `/git`' "$CLEANUP" || missing+=("cleanup cron points to /git")
grep -Fq '.claude/skills/git/SKILL.md' "$CHANGELOG" || missing+=("CHANGELOG top pointer references skill")

if (( ${#missing[@]} )); then
  printf 'REGRESSION: git workflow skill migration incomplete: %s\n' "${missing[*]}" >&2
  exit 1
fi

echo "PASS: git workflow lives in /git" >&2
exit 0
