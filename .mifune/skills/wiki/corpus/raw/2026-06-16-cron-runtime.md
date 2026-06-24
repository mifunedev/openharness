# Cron runtime source snapshot — 2026-06-16

Local source snapshot for `wiki/cron-runtime.md`.

## Source references

- `scripts/cron-runtime.ts:8-26` — `CronEntry` fields include schedule/enabled/tmux/worktree/agent/preflight/body/filePath.
- `scripts/cron-runtime.ts:51-72` — `parseCronFile` maps frontmatter to `CronEntry` and keeps body separate.
- `scripts/cron-runtime.ts:101-145` — `loadCrons` filters disabled entries, invalid ids, id mismatches, invalid agents, and invalid schedules.
- `scripts/cron-runtime.ts:164-176` — `reloadBody` re-reads the cron file body at fire time.
- `scripts/cron-runtime.ts:513-571` — `fireTmux` decides overlap/worktree behavior, reloads body, writes the prompt, and starts tmux.
- `scripts/cron-runtime.ts:592-627` — `runPreflight` / `fire` run preflight before worktree/tmux/agent creation.
- `scripts/cron-runtime.ts:722-790` — `scheduleAll` and `sighupHandler` arm and reschedule crons.
- `.claude/skills/drift-check/SKILL.md:190-203` — `/drift-check` explains conservative stale frontmatter/config detection.
- `.claude/skills/drift-check/SKILL.md:250-392` — Step C-2 qualifies schedulable crons and emits the restart-required field diagnostic.
