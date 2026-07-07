#!/usr/bin/env bash
# tier: A
# source: issue #152 (persist autopilot worktree logs) 2026-06-15
# desc: worktree-mode autopilot runs must keep source/branch work inside $CRON_WORKTREE
#       while routing runtime observability appends (.oh/crons/.cron.log and
#       .oh/memory/<today>/log.md) to the shared root checkout via $AUTOPILOT_LOG_ROOT,
#       so heartbeat and humans can inspect liveness after the ephemeral worktree is
#       reaped.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SKILL="$ROOT/.claude/skills/autopilot/SKILL.md"
README="$ROOT/.oh/crons/README.md"

missing=()
[[ -f "$SKILL" ]] || { echo "SKIPPED: missing $SKILL" >&2; exit 2; }
[[ -f "$README" ]] || { echo "SKIPPED: missing $README" >&2; exit 2; }

# Regression guard: the old relative writes disappear inside .oh/worktrees/cron/<session>
# when the heartbeat later reaps that worktree.
grep -Fq '>> .oh/crons/.cron.log' "$SKILL" && missing+=("no bare relative liveness append to .oh/crons/.cron.log")
grep -Fq 'cat >> ".oh/memory/$TODAY/log.md"' "$SKILL" && missing+=("no bare relative memory append to .oh/memory/$TODAY/log.md")

# Positive contract: worktree mode resolves the shared root and all runtime log writes
# use that root, without weakening source-work isolation.
grep -Fq 'resolve_autopilot_log_root()' "$SKILL" || missing+=("defines resolve_autopilot_log_root")
grep -Fq 'git -C "$CRON_WORKTREE" worktree list --porcelain' "$SKILL" || missing+=("resolves shared checkout from CRON_WORKTREE via git worktree list")
grep -Fq 'AUTOPILOT_LOG_ROOT="$(resolve_autopilot_log_root)"' "$SKILL" || missing+=("binds AUTOPILOT_LOG_ROOT from resolver")
grep -Fq '.oh/scripts/locked-append.sh "$AUTOPILOT_LOG_ROOT/.oh/crons/.cron.log"' "$SKILL" || missing+=("liveness appends through AUTOPILOT_LOG_ROOT via locked append")
grep -Fq '.oh/scripts/locked-append.sh "$AUTOPILOT_LOG_ROOT/.oh/memory/$TODAY/log.md"' "$SKILL" || missing+=("memory log appends through AUTOPILOT_LOG_ROOT via locked append")
grep -Fq 'root source checkout untouched' "$SKILL" || missing+=("skill distinguishes source isolation from runtime logs")
grep -Fq 'Runtime observability is the exception' "$SKILL" || missing+=("guidelines document runtime observability exception")
grep -Fq 'Autopilot treats runtime observability as the narrow exception' "$README" || missing+=("crons README documents the source/log split")

if (( ${#missing[@]} )); then
  printf 'REGRESSION: autopilot worktree log-root contract missing: %s\n' "${missing[*]}" >&2
  exit 1
fi

echo "PASS: worktree-mode autopilot keeps source work in CRON_WORKTREE but writes memory/liveness logs through AUTOPILOT_LOG_ROOT in the shared checkout" >&2
exit 0
