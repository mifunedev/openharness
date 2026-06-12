#!/usr/bin/env bash
# tier: A
# source: issue #408 — harness-audit & skill-lint stale path references
# desc: skill instructions must not reference the retired renamed dirs docs/wiki/ or workspace/heartbeats/
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SKILLS="$ROOT/.claude/skills"

if [[ ! -d "$SKILLS" ]]; then
  echo "SKIPPED: skills dir absent: $SKILLS" >&2
  exit 2
fi

# Guard ONLY the two truly-dead renamed-directory tokens from the wiki/cron
# restructure (docs/wiki/ -> wiki/, workspace/heartbeats/ -> crons/). These have
# no legitimate use anywhere under .claude/skills/. We deliberately do NOT guard
# apps/docs/, bare MEMORY.md, or workspace/.claude/skills/ — those have legitimate
# or intentional (guarded dual-scope) uses in other skills and would false-positive.
#
# Exclusion: harness-context/SKILL.md contains the prose string "docs/wiki/changelog"
# (an enumeration of surfaces, not a path). Exclude it by FULL PATH via a piped
# `grep -v` — GNU `grep --exclude` matches basenames only and is not used here.
hits=$(grep -rnE 'docs/wiki/|workspace/heartbeats/' "$SKILLS" \
         | grep -v 'harness-context/SKILL.md' || true)

if [[ -n "$hits" ]]; then
  echo "REGRESSION: retired path token(s) reappeared in .claude/skills/ (docs/wiki/ -> wiki/, workspace/heartbeats/ -> crons/):" >&2
  echo "$hits" >&2
  exit 1
fi

echo "PASS: no retired docs/wiki/ or workspace/heartbeats/ token in .claude/skills/ (excl harness-context prose)" >&2
exit 0
