#!/usr/bin/env bash
# tier: A
# source: issue #459 — sandbox tree CLI + concise descriptive /repo-layout agent premap skill
# desc: sandbox Dockerfile installs tree and /repo-layout skill stays wired to a concise descriptive premap wrapper
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

fail() { echo "REGRESSION: $*" >&2; exit 1; }
pass() { echo "PASS: $*" >&2; exit 0; }

[[ -f .devcontainer/Dockerfile ]] || fail ".devcontainer/Dockerfile missing"
grep -Eq '(^|[[:space:]])tree([[:space:]\\]|$)' .devcontainer/Dockerfile \
  || fail "Dockerfile system package list does not include tree"

[[ -f .claude/skills/repo-layout/SKILL.md ]] || fail "/repo-layout skill missing"
[[ -x .claude/skills/repo-layout/scripts/run.sh ]] || fail "/repo-layout wrapper missing or not executable"
[[ -L .pi/skills ]] || fail ".pi/skills must remain the symlinked Pi skill surface"
[[ -f .pi/skills/repo-layout/SKILL.md ]] || fail "/repo-layout not visible through .pi/skills symlink"

grep -q '^name: repo-layout$' .claude/skills/repo-layout/SKILL.md \
  || fail "/repo-layout skill frontmatter name drifted"
grep -q 'argument-hint: "\[path\] \[--depth N|--raw tree-options\]"' .claude/skills/repo-layout/SKILL.md \
  || fail "/repo-layout argument-hint drifted"
grep -Fq "\$ARGUMENTS" .claude/skills/repo-layout/SKILL.md \
  || fail "/repo-layout skill no longer wires arguments"
grep -q 'concise, descriptive' .claude/skills/repo-layout/SKILL.md \
  || fail "/repo-layout skill no longer promises concise descriptive premap behavior"
grep -q 'CLAUDE_SKILL_DIR.*/scripts/run.sh' .claude/skills/repo-layout/SKILL.md \
  || fail "/repo-layout skill no longer invokes its bundled wrapper"

grep -q 'command -v tree' .claude/skills/repo-layout/scripts/run.sh \
  || fail "/repo-layout wrapper no longer checks for tree binary"
grep -q "IGNORE_PATTERN=.*node_modules" .claude/skills/repo-layout/scripts/run.sh \
  || fail "/repo-layout wrapper no longer filters noisy directories"
grep -q '^DEPTH=1$' .claude/skills/repo-layout/scripts/run.sh \
  || fail "/repo-layout wrapper default depth is no longer concise"
grep -q '^FILE_LIMIT=40$' .claude/skills/repo-layout/scripts/run.sh \
  || fail "/repo-layout wrapper no longer caps large directories"
grep -q 'Agent premap' .claude/skills/repo-layout/scripts/run.sh \
  || fail "/repo-layout wrapper no longer emits agent premap output"
grep -q 'Key areas' .claude/skills/repo-layout/scripts/run.sh \
  || fail "/repo-layout wrapper no longer emits descriptive key areas"
grep -q 'Good next reads' .claude/skills/repo-layout/scripts/run.sh \
  || fail "/repo-layout wrapper no longer suggests concise next reads"
raw_exec="exec tree \"\${RAW_ARGS[@]}\""
grep -Fq "$raw_exec" .claude/skills/repo-layout/scripts/run.sh \
  || fail "/repo-layout wrapper raw mode no longer passes native tree args"

pass "repo-layout skill and sandbox tree package contract intact"
