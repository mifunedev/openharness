#!/usr/bin/env bash
# tier: A
# source: issue #168; issue #327
# desc: the cleanup-tasks weekly sweep grooms stale .worktrees/ branch
#       checkout folders while preserving durable .worktrees/agent/ identities,
#       the projects/ external clone root, and dirty/unpushed stale
#       worktrees. The documented procedure must enumerate registered git
#       worktrees, skip live panes and branches with open PRs, require dirty /
#       staged / untracked / missing-upstream / unpushed preservation gates before
#       `git worktree remove --force`, avoid recursive orphan deletion, and report
#       the groomed count in cron liveness.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
CRON="$ROOT/crons/cleanup-tasks.md"

if [[ ! -f "$CRON" ]]; then
  echo "SKIPPED: cleanup-tasks cron absent: $CRON" >&2
  exit 2
fi

if ! grep -Fq 'Groom stale `.worktrees/` branch checkouts' "$CRON"; then
  echo "REGRESSION: cleanup-tasks lacks the .worktrees grooming pass" >&2
  exit 1
fi
if ! grep -Fq 'git worktree list --porcelain' "$CRON"; then
  echo "REGRESSION: grooming pass does not enumerate registered git worktrees" >&2
  exit 1
fi

if ! grep -Fq '.worktrees/agent/' "$CRON" || ! grep -Fq '`projects/`' "$CRON"; then
  echo "REGRESSION: grooming pass does not explicitly preserve .worktrees/agent/ and skip projects/" >&2
  exit 1
fi
if ! grep -Fq 'NOT under `.worktrees/agent/`, NOT under' "$CRON"; then
  echo "REGRESSION: registered-worktree candidate filter does not exclude the agent/ and projects/ namespaces" >&2
  exit 1
fi
if ! grep -Fq 'excluding `.worktrees/agent/`' "$CRON"; then
  echo "REGRESSION: orphan-folder pruning does not exclude the agent/ and projects/ namespaces" >&2
  exit 1
fi

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

for required in \
  'git -C "$path" diff --quiet' \
  'git -C "$path" diff --cached --quiet' \
  'git -C "$path" ls-files --others --exclude-standard' \
  'git -C "$path" rev-parse --abbrev-ref --symbolic-full-name @{u}' \
  'git -C "$path" log --oneline @{u}..HEAD'; do
  if ! grep -Fq "$required" "$CRON"; then
    echo "REGRESSION: grooming pass lacks preservation gate: $required" >&2
    exit 1
  fi
done
for reason in dirty staged untracked missing-upstream unpushed; do
  if ! grep -Fq "$reason" "$CRON"; then
    echo "REGRESSION: grooming pass does not log skip reason '$reason'" >&2
    exit 1
  fi
done

if ! grep -Eq 'git worktree remove --force "\$path"|git-maintenance\.sh worktree-remove "\$path"' "$CRON"; then
  echo "REGRESSION: stale registered worktrees are not removed via forced worktree removal" >&2
  exit 1
fi

if grep -Fq 'rm -rf "$path"' "$CRON"; then
  echo "REGRESSION: orphan-folder pruning still authorizes recursive rm -rf" >&2
  exit 1
fi
if ! grep -Fq 'rmdir "$path"' "$CRON"; then
  echo "REGRESSION: orphan-folder pruning lacks non-recursive empty-directory removal" >&2
  exit 1
fi
if ! grep -Fq 'orphan-nonempty' "$CRON"; then
  echo "REGRESSION: orphan-folder pruning does not log preserved non-empty orphans" >&2
  exit 1
fi

if ! grep -Fq 'groomed W worktrees' "$CRON"; then
  echo "REGRESSION: cleanup-tasks liveness/reporting omits groomed worktree count" >&2
  exit 1
fi

if ! grep -Fq '! -name agent -empty -delete' "$CRON"; then
  echo "REGRESSION: empty namespace pruning does not preserve agent/" >&2
  exit 1
fi

echo "PASS: cleanup-tasks grooms stale non-agent .worktrees only after preservation gates; dirty/unpushed candidates and non-empty orphans are logged instead of recursively deleted" >&2
exit 0
