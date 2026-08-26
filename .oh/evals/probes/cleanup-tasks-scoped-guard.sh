#!/usr/bin/env bash
# tier: A
# source: issue #85
# desc: the cleanup-tasks weekly sweep's pre-flight is SCOPED to .oh/tasks/ (not the
#       whole tree) and the archive branch/commit work is ISOLATED in a crash-safe
#       worktree. Step 2 uses the path-scoped, archive-excluded
#       `git status --porcelain -- .oh/tasks/ ':!.oh/tasks/archive/'` (no bare tree-wide
#       `git status --porcelain` survives), a dirty .oh/tasks/ emits the distinct
#       BLOCKED-TASKS-WIP liveness token, and the archive runs in a `git worktree
#       add`/`git worktree remove` lifecycle — the old shared-checkout
#       `git switch -c "archive/` is gone. So foreign WIP elsewhere neither aborts
#       the sweep nor leaks into the archive commit.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
CRON="$ROOT/.oh/crons/cleanup-tasks.md"

if [[ ! -f "$CRON" ]]; then
  echo "SKIPPED: cleanup-tasks cron absent: $CRON" >&2
  exit 2
fi

if ! grep -Fq 'git status --porcelain -- .oh/tasks/' "$CRON"; then
  echo "REGRESSION: pre-flight is not scoped to .oh/tasks/ (missing 'git status --porcelain -- .oh/tasks/')" >&2
  exit 1
fi

unscoped="$(grep -n 'git status --porcelain' "$CRON" \
  | grep -v -- '-- .oh/tasks/' \
  || true)"
if [[ -n "$unscoped" ]]; then
  echo "REGRESSION: bare unscoped 'git status --porcelain' (no '-- .oh/tasks/' pathspec) remains:" >&2
  echo "$unscoped" >&2
  exit 1
fi

if ! grep -q 'BLOCKED-TASKS-WIP' "$CRON"; then
  echo "REGRESSION: BLOCKED-TASKS-WIP token missing from .oh/crons/cleanup-tasks.md" >&2
  exit 1
fi

if ! grep -q 'git worktree add' "$CRON"; then
  echo "REGRESSION: 'git worktree add' missing — archive work is not isolated in a worktree" >&2
  exit 1
fi
if ! grep -Eq 'git worktree remove|git-maintenance\.sh worktree-remove' "$CRON"; then
  echo "REGRESSION: worktree teardown missing ('git worktree remove' or git-maintenance.sh worktree-remove) — not crash-safe" >&2
  exit 1
fi

if grep -Fq 'git switch -c "archive/' "$CRON"; then
  echo "REGRESSION: old shared-checkout 'git switch -c \"archive/' pattern still present" >&2
  exit 1
fi

echo "PASS: cleanup-tasks pre-flight scoped to .oh/tasks/ (no bare 'git status --porcelain'); BLOCKED-TASKS-WIP emitted; archive isolated in a 'git worktree add'/'remove' lifecycle; no shared-checkout 'git switch -c'" >&2
exit 0
