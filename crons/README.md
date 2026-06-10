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
| `autopilot.md` | `5 * * * *` (every hour at +5 min) | Self-improving loop — select backlog item, build through full pipeline, finalize ready-for-review PR (kill-switch: `enabled: false`) |
| `heartbeat.md` | `0 * * * *` (hourly) | Hourly pulse — review memory, surface anything urgent |
| `cleanup-tasks.md` | `0 23 * * 0` (Sun 23:00 MT) | Weekly Ralph session sweep — archive completed tasks |
| `eval-weekly.md` | `0 6 * * 0` (Sun 06:00 MT) | Weekly eval suite — run probes, log any regressions to memory |

## Curated backlog

`autopilot-backlog.md` is a **reference file, not a scheduled job**. It contains a curated checklist of harness-infra improvements that the autopilot loop reads to select its next work item. It has no `schedule:` field and is never processed by the cron runtime. Maintain it by hand to steer autopilot's priorities without touching code.

## Override

Set `CRONS_DIR=<path>` to point the runtime at a different directory
(default: `crons`).
