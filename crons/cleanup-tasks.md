---
id: cleanup-tasks
schedule: "0 23 * * 0"
timezone: America/Denver
enabled: true
overlap: false
catchup: false
description: Weekly Ralph session sweep — archive completed tasks
---

# Weekly Task Cleanup

Sweep `tasks/` once per week and archive anything that has finished.
Per SPEC v0.7 §"Weekly cleanup cron": completed tasks move into the
dated archive under `tasks/`; incomplete tasks are left alone with a
note. `memory/` carries journal artifacts only — never a `tasks/`
subfolder.

## Tasks

1. Compute `TODAY=$(date -u +%Y-%m-%d)`. The dated destination
   `tasks/archive/$TODAY/` is created inside the worktree (step 4); all
   archive moves now run there, not in the shared checkout.
2. **Pre-flight (scoped to `tasks/`):** check only the surface this job
   mutates — run `git status --porcelain -- tasks/ ':!tasks/archive/'`.
   Only a mid-write task under `tasks/` (the `tasks/archive/`
   destination is excluded so an in-progress archive write never
   self-flags the sweep) blocks the run; foreign WIP elsewhere in the
   shared checkout — an in-flight feature branch, a concurrent session's
   edits — is untouched and does NOT abort the sweep, mirroring the
   autopilot loop's `BLOCKED-OWNED-WIP` owned-surface convention. If that
   scoped status is non-empty, abort: append a note to
   `memory/$TODAY/log.md`, emit the distinct liveness token to
   `crons/.cron.log`
   (`printf '[%s] cleanup-tasks: %s\n' "$(date -Iseconds)" "BLOCKED-TASKS-WIP" >> crons/.cron.log`),
   and stop here — do NOT fall through to step 7's `OK` line. This
   `BLOCKED-TASKS-WIP` token is intentionally distinct from the
   `OK (archived N, skipped M)` success token and the `HEARTBEAT_OK`
   nothing-to-do reply. Do not contaminate the archive branch with
   unrelated changes.
3. Resolve `$BASE` = default target branch per `context/rules/git.md`
   (`development` → `main` → `master`, whichever exists). Fetch it
   (`git fetch origin "$BASE"`), then provision a dedicated, crash-safe
   worktree for the archive work — never branch or commit against the
   shared checkout (its dirty state must neither block a switch nor leak
   into the archive commit):
   - **Prune stale first** so a same-day re-run is idempotent (tear down
     and recreate — never reuse a possibly-dirty worktree left by a prior
     failed run):
     ```bash
     git worktree remove --force .worktrees/archive/$TODAY 2>/dev/null || true
     git branch -D "archive/$TODAY" 2>/dev/null || true   # drop a stale branch from a partial run
     git worktree prune
     ```
   - **Create** the worktree off `origin/$BASE` (paths resolve from the
     repo root, not the cron's ambient cwd):
     ```bash
     git worktree add .worktrees/archive/$TODAY -b archive/$TODAY origin/$BASE
     ```
   - **Arm crash-safe teardown** so a failed push/PR step (or any error
     exit) never strands the worktree for next week's run to collide with:
     ```bash
     trap 'git worktree remove --force .worktrees/archive/$TODAY 2>/dev/null || true; git worktree prune' EXIT
     ```
   Every `git` command for the archive from here on runs inside the
   worktree via `git -C .worktrees/archive/$TODAY <cmd>`.
4. Inside the worktree, create the dated destination
   (`mkdir -p .worktrees/archive/$TODAY/tasks/archive/$TODAY`), then scan
   the worktree's `origin/$BASE` checkout — committed state only, so
   uncommitted task dirs in the shared checkout are never archived. For
   each `.worktrees/archive/$TODAY/tasks/<taskdesc>/` (skipping
   `tasks/archive/`):
   - If `tasks/<taskdesc>/progress.txt` ends with a line matching exactly
     `STATUS: COMPLETE`:
     - Kill the matching tmux session if one exists:
       `tmux kill-session -t <taskdesc> 2>/dev/null || true`.
     - Move the folder inside the worktree:
       `git -C .worktrees/archive/$TODAY mv tasks/<taskdesc> tasks/archive/$TODAY/<taskdesc>`
       (falls back to `mv` + `git -C .worktrees/archive/$TODAY add` if
       `git mv` rejects an untracked path).
   - Otherwise, leave the folder in place and append a one-line note to
     `memory/$TODAY/log.md` recording that `<taskdesc>` is still active
     (include the last `progress.txt` modification time).
5. If anything was archived this run (`N > 0`) — every git step runs
   inside the worktree via `git -C .worktrees/archive/$TODAY`:
   - Stage the moves: `git -C .worktrees/archive/$TODAY add tasks/`.
   - Commit: `git -C .worktrees/archive/$TODAY commit -m "archive: weekly cleanup $TODAY (N tasks)"`.
   - Push: `git -C .worktrees/archive/$TODAY push -u origin "archive/$TODAY"`.
   - Open a PR (or update an existing one for the same branch) per
     `context/rules/git.md` conventions:
     `gh pr create --base "$BASE" --head "archive/$TODAY" \
        --title "FROM archive/$TODAY TO $BASE" \
        --body "Weekly task sweep — archived N completed tasks, skipped M still-active.\n\nArchived: <list>\nSkipped: <list>"`.
     If `gh pr create` reports the PR already exists, capture its URL
     via `gh pr view --json url -q .url` instead.
6. After the sweep, append a single summary line to
   `memory/$TODAY/log.md`: `cleanup-tasks: archived N, skipped M, pr <url-or-none>`.
7. **Mandatory closing steps (always run):**
   - **Tear down the worktree** — covers normal completion, the
     nothing-to-archive case (`N = 0`), and partial runs; complements the
     step-3 `trap`, which also fires on any error/abort exit:
     `git worktree remove --force .worktrees/archive/$TODAY 2>/dev/null || true; git worktree prune`.
   - **Liveness line:** append one liveness line to `crons/.cron.log`:
     `printf '[%s] cleanup-tasks: %s\n' "$(date -Iseconds)" "OK (archived N, skipped M)" >> crons/.cron.log`.
     Create the file if it does not exist.

## Reporting

- Nothing to archive and nothing stale → reply `HEARTBEAT_OK` (no
  branch, no PR).
- Otherwise → list of archived and skipped task names with counts, plus
  the PR URL on a final line.
