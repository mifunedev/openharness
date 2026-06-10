---
id: cleanup-tasks
schedule: "0 23 * * 0"
timezone: America/Los_Angeles
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

1. Compute `TODAY=$(date -u +%Y-%m-%d)` and ensure
   `tasks/archive/$TODAY/` exists.
2. **Pre-flight:** verify the working tree is clean
   (`git status --porcelain` empty). If dirty, abort the sweep, append
   a note to `memory/$TODAY/log.md`, and skip to step 7. Do not
   contaminate the archive branch with unrelated changes.
3. Resolve `$BASE` = default target branch per `context/rules/git.md`
   (`development` → `main` → `master`, whichever exists). Fetch it
   (`git fetch origin "$BASE"`) and create the archive branch off
   `origin/$BASE`:
   `git switch -c "archive/$TODAY" "origin/$BASE"`.
   If the branch already exists (re-run on same day), switch to it
   instead.
4. For each `tasks/<taskdesc>/` (skipping `tasks/archive/`):
   - If `progress.txt` ends with a line matching exactly
     `STATUS: COMPLETE`:
     - Kill the matching tmux session if one exists:
       `tmux kill-session -t <taskdesc> 2>/dev/null || true`.
     - Move the folder: `git mv tasks/<taskdesc> tasks/archive/$TODAY/<taskdesc>`
       (falls back to `mv` + `git add` if `git mv` rejects an untracked path).
   - Otherwise, leave the folder in place and append a one-line note to
     `memory/$TODAY/log.md` recording that `<taskdesc>` is still active
     (include the last `progress.txt` modification time).
5. If anything was archived this run (`N > 0`):
   - Stage the moves: `git add tasks/`.
   - Commit: `git commit -m "archive: weekly cleanup $TODAY (N tasks)"`.
   - Push: `git push -u origin "archive/$TODAY"`.
   - Open a PR (or update an existing one for the same branch) per
     `context/rules/git.md` conventions:
     `gh pr create --base "$BASE" --head "archive/$TODAY" \
        --title "FROM archive/$TODAY TO $BASE" \
        --body "Weekly task sweep — archived N completed tasks, skipped M still-active.\n\nArchived: <list>\nSkipped: <list>"`.
     If `gh pr create` reports the PR already exists, capture its URL
     via `gh pr view --json url -q .url` instead.
6. After the sweep, append a single summary line to
   `memory/$TODAY/log.md`: `cleanup-tasks: archived N, skipped M, pr <url-or-none>`.
7. **Mandatory closing step:** append one liveness line to `crons/.cron.log`:
   `printf '[%s] cleanup-tasks: %s\n' "$(date -Iseconds)" "OK (archived N, skipped M)" >> crons/.cron.log`.
   Create the file if it does not exist.

## Reporting

- Nothing to archive and nothing stale → reply `HEARTBEAT_OK` (no
  branch, no PR).
- Otherwise → list of archived and skipped task names with counts, plus
  the PR URL on a final line.
