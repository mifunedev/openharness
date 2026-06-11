#!/usr/bin/env bash
# tier: A
# source: memory/MEMORY.md 2026-06-11 (branch-restore-guard) #45
# desc: autopilot branch-restore uses a forced clean restore (git checkout -f development +
#       post-restore assertion) at every restore site — no bare `git checkout development`
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SKILL="$ROOT/.claude/skills/autopilot/SKILL.md"

if [[ ! -f "$SKILL" ]]; then
  echo "SKIPPED: autopilot skill absent: $SKILL" >&2
  exit 2
fi

# --- negative assertion: no bare `git checkout development` (without -f) may remain ---
# Any line that references checking out development MUST use the forced form. Find lines
# containing both `git checkout` and `development`, drop the forced form, and require none left.
bare="$(grep -n 'git checkout' "$SKILL" | grep 'development' | grep -v 'git checkout -f development' || true)"
if [[ -n "$bare" ]]; then
  echo "REGRESSION: bare 'git checkout development' (missing -f) found in autopilot SKILL.md:" >&2
  echo "$bare" >&2
  exit 1
fi

# --- positive assertion: the forced restore appears at every restore site (>= 3) ---
forced_count="$(grep -c 'git checkout -f development' "$SKILL" || true)"
if (( forced_count < 3 )); then
  echo "REGRESSION: expected >= 3 'git checkout -f development' restore sites, found $forced_count" >&2
  exit 1
fi

# --- positive assertion: the post-restore assertion message is present ---
if ! grep -q 'restore left a dirty tree' "$SKILL"; then
  echo "REGRESSION: post-restore assertion ('restore left a dirty tree') missing from autopilot SKILL.md" >&2
  exit 1
fi

echo "PASS: autopilot restore is forced + asserted at $forced_count sites; no bare checkout remains" >&2
exit 0
