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
timezone: America/Denver
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

## Scheduled jobs

| File | Schedule | Description |
|------|----------|-------------|
| `autopilot.md` | `5 * * * *` (every hour at +5 min) | Self-improving loop — issue-queue-first selection (build the oldest open `autopilot` issue; research + file a ticket when the queue is empty), eval gate before ready, finalized in a per-run tmux session (kill-switch: `enabled: false`) |
| `heartbeat.md` | `0 * * * *` (hourly) | Hourly pulse — review memory, surface anything urgent |
| `cleanup-tasks.md` | `0 23 * * 0` (Sun 23:00 MT) | Weekly Ralph session sweep — archive completed tasks |
| `eval-weekly.md` | `0 6 * * 0` (Sun 06:00 MT) | Weekly eval suite — run probes, log any regressions to memory |

## tmux sessions

A job with `tmux: true` in its frontmatter runs each fire in its own detached tmux session instead of an in-process child, so the user can attach to a run, read its scrollback, and reattach later.

- **Session name**: `<id>-<MMDD>-<HHMM>` (e.g. `autopilot-0610-1805`), derived from the fire time. The runtime logs `SPAWNED <session>` to `.cron.log`.
- **Env exported into the agent**: `CRON_TMUX_SESSION=<session>` and `CRON_KEEP_MARKER=/tmp/<session>.keep`.
- **Keep-marker contract**: if the agent `touch`es `$CRON_KEEP_MARKER` before exiting, the session persists by resuming the run's own conversation as a live, attachable agent (`claude --continue` — idle until you `tmux attach -t <session>` and drive it), falling back to a shell if that exits; otherwise it auto-closes when the agent finishes. The autonomous run itself is always headless (`claude -p`); the resumed agent does nothing until a human attaches, so it adds no unattended-permission exposure. By convention a job keeps its session only when the run produced something worth revisiting (e.g. autopilot keeps it when a PR was opened).
- **Overlap guard**: a per-id pidfile `/tmp/cron-<id>.pid` blocks a new fire while a previous one is still running when `overlap: false`; the skipped fire logs `SKIPPED_OVERLAP`.

Jobs with `tmux` absent or `false` keep the default in-process spawn. Steer autopilot's priorities by filing GitHub issues labeled `autopilot` (the work queue) — no in-repo backlog file.

## Hot-reload

A cron definition's **body** (the agent prompt) hot-reloads at fire time: the runtime re-reads the file just before each fire, so edits take effect at the next scheduled fire without a restart. On a read/parse error, the runtime falls back to the cached boot-time body and logs `BODY_RELOAD_ERR`. When a fire's body differs from the boot-time cached version, a `BODY_RELOADED` line appears in `crons/.cron.log` — this signal recurs on every fire after an edit until the runtime is restarted (which re-baselines). Frontmatter changes (`schedule`, `enabled`, `timezone`, `overlap`) require a runtime restart; no watcher is implemented. Rollback: remove the `reloadBody` call and restore the two `entry.body` usages in `scripts/cron-runtime.ts`.

## Override

Set `CRONS_DIR=<path>` to point the runtime at a different directory
(default: `crons`).
