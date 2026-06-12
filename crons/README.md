# `crons/`

Markdown-frontmatter cron definitions consumed by
`scripts/cron-runtime.ts`. Each `<id>.md` file declares one scheduled
job; the runtime scans this directory at boot, schedules every enabled
job via [Croner](https://github.com/Hexagon/croner), and re-fires the
file's body as the next prompt to the active agent.

See `scripts/cron-runtime.ts` for the runtime implementation
(frontmatter parsing, scheduling, overlap/catchup semantics).

## File shape

```markdown
---
id: <unique-id>          # must match filename, kebab-case
schedule: "0 23 * * 0"   # 5-field cron expression
timezone: America/Los_Angeles
enabled: true
overlap: false           # skip new fire if previous still running
catchup: false           # don't replay missed fires after downtime
tmux: false              # optional — run each fire in its own detached tmux session
description: <one-line>
---

# Title

Body becomes the agent prompt at fire time.
```

## Conventions

- Filename = `<id>.md`, kebab-case.
- Heartbeats follow the `heartbeat-<name>.md` naming convention; their
  tmux session is `heartbeat-<name>`
  (see `.claude/rules/sandbox-processes.md`).
- Disable a job by setting `enabled: false` — do not delete the file
  (preserves history).
- Runtime artefacts in this directory (`.cron.log`, `.pid`) are
  gitignored; markdown definitions are tracked.

## Status tokens

The runtime appends one tab-separated line per event to the gitignored
`crons/.cron.log`, shaped `<iso-timestamp>\t<id>\t<status>\t<msg>`. The
status column is one of:

| Token | Meaning |
|-------|---------|
| `BOOT` | Runtime started and scheduled its crons (`id` is `system`; `msg` is the cron count). |
| `SPAWNED` | A `tmux: true` fire launched its detached session (`msg` is the session name). |
| `FIRE` | A scheduled job fired and began running its body. |
| `OK` | The fired child process exited cleanly (exit code 0). |
| `EXIT_n` | The fired child process exited non-zero with code `n`. |
| `ERR` | The child process failed to spawn (process-level error, not a job throw). |
| `ERR_JOB` | A synchronous cron job-callback threw; recorded instead of being swallowed. Format: `<id>\tERR_JOB\t<error-string>`. |
| `SKIPPED_OVERLAP` | A fire was skipped because the previous run was still in flight (`overlap: false`). |

`BODY_RELOADED` and `BODY_RELOAD_ERR` are documented under
[Hot-reload](#hot-reload).

## Scheduled jobs

| File | Schedule | Description |
|------|----------|-------------|
| `heartbeat.md` | `0 * * * *` (hourly) | Hourly pulse — review memory, surface anything urgent |
| `cleanup-tasks.md` | `0 23 * * 0` (Sun 23:00 PT by default) | Weekly Ralph session sweep — archive completed tasks |

## tmux sessions

A job with `tmux: true` in its frontmatter runs each fire in its own detached
tmux session instead of an in-process child, so the user can attach to a run,
read its scrollback, and reattach later.

- **Session name**: `<id>-<MMDD>-<HHMM>` (e.g. `heartbeat-0610-1805`), derived from the fire time. The runtime logs `SPAWNED <session>` to `.cron.log`.
- **Env exported into the agent**: `CRON_TMUX_SESSION=<session>` and `CRON_KEEP_MARKER=/tmp/<session>.keep`.
- **Keep-marker contract**: if the agent `touch`es `$CRON_KEEP_MARKER` before exiting, the session persists by resuming the run's own conversation as a live, attachable agent (`claude --continue` — idle until you `tmux attach -t <session>` and drive it), falling back to a shell if that exits; otherwise it auto-closes when the agent finishes.
- **Overlap guard**: a per-id pidfile `/tmp/cron-<id>.pid` blocks a new fire while a previous one is still running when `overlap: false`; the skipped fire logs `SKIPPED_OVERLAP`.

Jobs with `tmux` absent or `false` keep the default in-process spawn.

## Hot-reload

A cron definition's **body** (the agent prompt) hot-reloads at fire time: the
runtime re-reads the file just before each fire, so edits take effect at the
next scheduled fire without a restart. On a read/parse error, the runtime falls
back to the cached boot-time body and logs `BODY_RELOAD_ERR`. When a fire's body
differs from the boot-time cached version, a `BODY_RELOADED` line appears in
`crons/.cron.log` — this signal recurs on every fire after an edit until the
runtime is restarted, which re-baselines. Frontmatter changes (`schedule`,
`enabled`, `timezone`, `overlap`) require a runtime restart; no watcher is
implemented.

## Override

Set `CRONS_DIR=<path>` to point the runtime at a different directory
(default: `crons`).
