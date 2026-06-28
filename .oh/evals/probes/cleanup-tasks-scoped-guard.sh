#!/usr/bin/env bash
# tier: A
# source: issue #85
# desc: the cleanup-tasks weekly sweep's pre-flight is SCOPED to tasks/ (not the
#       whole tree) and the archive branch/commit work is ISOLATED in a crash-safe
#       worktree. Step 2 uses the path-scoped, archive-excluded
#       `git status --porcelain -- tasks/ ':!tasks/archive/'` (no bare tree-wide
#       `git status --porcelain` survives), a dirty tasks/ emits the distinct
#       BLOCKED-TASKS-WIP liveness token, and the archive runs in a `git worktree
#       add`/`git worktree remove` lifecycle — the old shared-checkout
#       `git switch -c "archive/` is gone. So foreign WIP elsewhere neither aborts
#       the sweep nor leaks into the archive commit.
# NOTE: this is a STATIC grep oracle over markdown (crons/cleanup-tasks.md), NOT a
#       runtime execution test of the cron — same limitation as owned-surface-guard.sh.
#       It guards the documented procedure against silent revert, not its behavior.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
CRON="$ROOT/crons/cleanup-tasks.md"

if [[ ! -f "$CRON" ]]; then
  echo "SKIPPED: cleanup-tasks cron absent: $CRON" >&2
  exit 2
fi

# --- (a) the pre-flight is path-scoped to tasks/ --------------------------------------
# On an UNMODIFIED cron the pre-flight is tree-wide, so this scoped form is absent → exit 1
# (the symmetric-oracle anchor). `grep -F` keeps the `--porcelain` / `--` literal.
if ! grep -Fq 'git status --porcelain -- tasks/' "$CRON"; then
  echo "REGRESSION: pre-flight is not scoped to tasks/ (missing 'git status --porcelain -- tasks/')" >&2
  exit 1
fi

# --- (b) no bare unscoped `git status --porcelain` survives ---------------------------
# List every `git status --porcelain` line, then drop the pathspec-scoped `-- tasks/`
# lines. Anything left is a bare tree-wide check that would abort the sweep on foreign WIP.
unscoped="$(grep -n 'git status --porcelain' "$CRON" \
  | grep -v -- '-- tasks/' \
  || true)"
if [[ -n "$unscoped" ]]; then
  echo "REGRESSION: bare unscoped 'git status --porcelain' (no '-- tasks/' pathspec) remains:" >&2
  echo "$unscoped" >&2
  exit 1
fi

# --- (c) a dirty tasks/ emits the distinct BLOCKED-TASKS-WIP liveness token -----------
if ! grep -q 'BLOCKED-TASKS-WIP' "$CRON"; then
  echo "REGRESSION: BLOCKED-TASKS-WIP token missing from crons/cleanup-tasks.md" >&2
  exit 1
fi

# --- (d) the archive work is isolated in a worktree (add + remove lifecycle) -----------
if ! grep -q 'git worktree add' "$CRON"; then
  echo "REGRESSION: 'git worktree add' missing — archive work is not isolated in a worktree" >&2
  exit 1
fi
if ! grep -q 'git worktree remove' "$CRON"; then
  echo "REGRESSION: 'git worktree remove' missing — worktree teardown is not crash-safe" >&2
  exit 1
fi

# --- (e) the old shared-checkout `git switch -c "archive/` is gone (asymmetric oracle) -
if grep -Fq 'git switch -c "archive/' "$CRON"; then
  echo "REGRESSION: old shared-checkout 'git switch -c \"archive/' pattern still present" >&2
  exit 1
fi

echo "PASS: cleanup-tasks pre-flight scoped to tasks/ (no bare 'git status --porcelain'); BLOCKED-TASKS-WIP emitted; archive isolated in a 'git worktree add'/'remove' lifecycle; no shared-checkout 'git switch -c'" >&2
exit 0
