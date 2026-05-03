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

1. Compute `TODAY=$(date -u +%Y-%m-%d)` and ensure
   `tasks/archive/$TODAY/` exists.
2. For each `tasks/<taskdesc>/` (skipping `tasks/archive/`):
   - If `progress.txt` ends with a line matching exactly
     `STATUS: COMPLETE`:
     - Kill the matching tmux session if one exists:
       `tmux kill-session -t <taskdesc> 2>/dev/null || true`.
     - Move the folder: `mv tasks/<taskdesc> tasks/archive/$TODAY/<taskdesc>`.
   - Otherwise, leave the folder in place and append a one-line note to
     `memory/$TODAY/log.md` recording that `<taskdesc>` is still active
     (include the last `progress.txt` modification time).
3. After the sweep, append a single summary line to
   `memory/$TODAY/log.md`: `cleanup-tasks: archived N, skipped M`.
4. **Mandatory closing step:** append one liveness line to `crons/cron.log`:
   `printf '[%s] cleanup-tasks: %s\n' "$(date -Iseconds)" "OK (archived N, skipped M)" >> crons/cron.log`.
   Create the file if it does not exist.

## Reporting

- Nothing to archive and nothing stale → reply `HEARTBEAT_OK`.
- Otherwise → list of archived and skipped task names with counts.
