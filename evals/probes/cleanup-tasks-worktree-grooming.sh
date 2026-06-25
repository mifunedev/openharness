#!/usr/bin/env bash
# tier: A
# source: issue #168
# desc: the cleanup-tasks weekly sweep also grooms stale .worktrees/ branch
#       checkout folders while preserving durable .worktrees/agent/ identities and
#       .worktrees/project/ external project clones. The documented procedure must
#       enumerate registered git worktrees, skip live panes and branches with open
#       PRs, remove stale registered worktrees via git worktree remove, prune stale
#       corrupt/orphan folders only outside agent/project, and report the groomed
#       count in the cron liveness line.
# NOTE: this is a STATIC grep oracle over markdown (crons/cleanup-tasks.md), NOT a
#       runtime execution test of the cron. It guards the documented procedure
#       against silent revert, not shell behavior.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CRON="$ROOT/crons/cleanup-tasks.md"

if [[ ! -f "$CRON" ]]; then
  echo "SKIPPED: cleanup-tasks cron absent: $CRON" >&2
  exit 2
fi

# The grooming pass must be explicit and must not be mistaken for the temporary
# archive worktree used to commit task moves.
if ! grep -Fq 'Groom stale `.worktrees/` branch checkouts' "$CRON"; then
  echo "REGRESSION: cleanup-tasks lacks the .worktrees grooming pass" >&2
  exit 1
fi
if ! grep -Fq 'git worktree list --porcelain' "$CRON"; then
  echo "REGRESSION: grooming pass does not enumerate registered git worktrees" >&2
  exit 1
fi

# Durable namespaces are never cleanup candidates.
if ! grep -Fq '.worktrees/agent/' "$CRON" || ! grep -Fq '.worktrees/project/' "$CRON"; then
  echo "REGRESSION: grooming pass does not explicitly preserve .worktrees/agent/ and .worktrees/project/" >&2
  exit 1
fi
if ! grep -Fq 'NOT under `.worktrees/agent/`, NOT under' "$CRON"; then
  echo "REGRESSION: registered-worktree candidate filter does not exclude agent/project namespaces" >&2
  exit 1
fi
if ! grep -Fq 'excluding `.worktrees/agent/`' "$CRON"; then
  echo "REGRESSION: orphan-folder pruning does not exclude agent/project namespaces" >&2
  exit 1
fi

# Safety gates before removal: live pane, open PR, and 30-day age.
if ! grep -Fq "tmux list-panes -a -F '#{pane_current_path}'" "$CRON"; then
  echo "REGRESSION: grooming pass lacks live tmux-pane protection" >&2
  exit 1
fi
if ! grep -Fq 'gh pr list --head "$branch" --state open' "$CRON"; then
  echo "REGRESSION: grooming pass lacks open-PR protection" >&2
  exit 1
fi
if ! grep -Fq 'newer than 30 days' "$CRON"; then
  echo "REGRESSION: grooming pass lacks the 30-day staleness threshold" >&2
  exit 1
fi

# Registered worktrees use git worktree remove; corrupt/orphan dirs are the only
# paths allowed to use rm -rf, and they are still outside agent/project.
if ! grep -Fq 'git worktree remove --force "$path"' "$CRON"; then
  echo "REGRESSION: stale registered worktrees are not removed via git worktree remove" >&2
  exit 1
fi
if ! grep -Fq 'using `rm -rf "$path"`' "$CRON"; then
  echo "REGRESSION: corrupt/orphan folder pruning path is missing" >&2
  exit 1
fi

# Reporting/liveness includes the groomed count, so the weekly archive's output
# reflects this second cleanup surface.
if ! grep -Fq 'groomed W worktrees' "$CRON"; then
  echo "REGRESSION: cleanup-tasks liveness/reporting omits groomed worktree count" >&2
  exit 1
fi

# The reserved namespace cleanup must not delete agent/project even when removing
# empty top-level directories.
if ! grep -Fq '! -name agent ! -name project -empty -delete' "$CRON"; then
  echo "REGRESSION: empty namespace pruning does not preserve agent/project" >&2
  exit 1
fi

echo "PASS: cleanup-tasks grooms stale non-agent/non-project .worktrees safely and reports the groomed count" >&2
exit 0
