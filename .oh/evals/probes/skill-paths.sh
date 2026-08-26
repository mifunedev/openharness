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

hits=$(grep -rnE 'docs/wiki/|workspace/heartbeats/' "$SKILLS" \
         | grep -v 'harness-context/SKILL.md' || true)

if [[ -n "$hits" ]]; then
  echo "REGRESSION: retired path token(s) reappeared in .claude/skills/ (docs/wiki/ -> wiki/, workspace/heartbeats/ -> .oh/crons/):" >&2
  echo "$hits" >&2
  exit 1
fi

rename_hits=$(grep -rnE 'apps/docs|apps/README|apps/\*|src/data/roadmap' "$SKILLS" || true)

if [[ -n "$rename_hits" ]]; then
  echo "REGRESSION: stale apps/->packages/ rename token(s) reappeared in .claude/skills/ (apps/docs -> packages/docs, apps/README -> packages/README, apps/* -> packages/*, src/data/roadmap.ts -> docs/roadmap.md):" >&2
  echo "$rename_hits" >&2
  exit 1
fi

echo "PASS: no retired docs/wiki/, workspace/heartbeats/, or apps/->packages/ rename token in .claude/skills/ (excl harness-context prose)" >&2
exit 0
