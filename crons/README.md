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

## Override

Set `CRONS_DIR=<path>` to point the runtime at a different directory
(default: `crons`).
