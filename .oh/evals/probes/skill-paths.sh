#!/usr/bin/env bash
# tier: A
# source: issue #43 — stale path references; extended by issue #69 — apps/->packages/ rename guard
# desc: skill instructions must not reference retired renamed paths — docs/wiki/, workspace/heartbeats/, or the apps/->packages/ monorepo-rename tokens (apps/docs, apps/README, apps/*, src/data/roadmap)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SKILLS="$ROOT/.claude/skills"

if [[ ! -d "$SKILLS" ]]; then
  echo "SKIPPED: skills dir absent: $SKILLS" >&2
  exit 2
fi

# Guard 1 — the two dead renamed-directory tokens from the wiki/cron restructure
# (docs/wiki/ -> wiki/, workspace/heartbeats/ -> .oh/crons/). No legitimate use anywhere
# under .claude/skills/.
#
# Exclusion: harness-context/SKILL.md contains the prose string "docs/wiki/changelog"
# (an enumeration of surfaces, not a path). Exclude it by FULL PATH via a piped
# `grep -v` — GNU `grep --exclude` matches basenames only and is not used here.
hits=$(grep -rnE 'docs/wiki/|workspace/heartbeats/' "$SKILLS" \
         | grep -v 'harness-context/SKILL.md' || true)

if [[ -n "$hits" ]]; then
  echo "REGRESSION: retired path token(s) reappeared in .claude/skills/ (docs/wiki/ -> wiki/, workspace/heartbeats/ -> .oh/crons/):" >&2
  echo "$hits" >&2
  exit 1
fi

# Guard 2 — the apps/->packages/ monorepo rename (issue #69). The `apps/` tree no
# longer exists; the canonical paths are `packages/docs/`, `packages/README.md`, and
# `docs/roadmap.md` (the strategic-proposal §9 write target). These tokens have NO
# legitimate use under .claude/skills/, so any reappearance is the exact drift PR #44
# left behind — it corrected some apps/ refs but silently missed apps/docs. No
# exclusion is needed: zero skills legitimately mention these tokens.
rename_hits=$(grep -rnE 'apps/docs|apps/README|apps/\*|src/data/roadmap' "$SKILLS" || true)

if [[ -n "$rename_hits" ]]; then
  echo "REGRESSION: stale apps/->packages/ rename token(s) reappeared in .claude/skills/ (apps/docs -> packages/docs, apps/README -> packages/README, apps/* -> packages/*, src/data/roadmap.ts -> docs/roadmap.md):" >&2
  echo "$rename_hits" >&2
  exit 1
fi

echo "PASS: no retired docs/wiki/, workspace/heartbeats/, or apps/->packages/ rename token in .claude/skills/ (excl harness-context prose)" >&2
exit 0
