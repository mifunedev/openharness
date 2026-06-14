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
agent: pi                # optional — override CRON_AGENT_BIN for this job only
description: <one-line>
---

# Title

Body becomes the agent prompt at fire time.
```

## Conventions

- Filename = `<id>.md`, kebab-case.
- Cron tmux sessions follow the `cron-<name>` category-prefix convention:
  the runtime is `cron-system`, and detached job fires are
  `cron-<id>-<MMDD>-<HHMM>` (see `.claude/rules/sandbox-processes.md`).
- Migration note: older sandboxes used runtime session `system-cron` and
  autopilot run sessions/markers named `autopilot-*`. New sandboxes use
  `cron-system` and `cron-autopilot-*`. During the transition, heartbeat scans
  and sweeps both old and new autopilot names. To complete migration, kill the
  legacy `system-cron` session once, then restart/relaunch the sandbox so the
  entrypoint starts `cron-system` without running duplicate cron runtimes.
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
| `RELOAD` | A `SIGHUP` reschedule re-read `crons/` and re-armed every schedule without restarting the runtime (`id` is `system`; `msg` is the cron count, e.g. `4 scheduled, 0 skipped`). See [Hot-reload](#hot-reload). |
| `SCHED_INVALID` | A cron was skipped because its `schedule:` is not a valid cron expression (`msg` contains the offending schedule string). |
| `SPAWNED` | A `tmux: true` fire launched its detached session (`msg` is the session name). |
| `FIRE` | A scheduled job fired and began running its body. |
| `AGENT_START` | The shell wrapper started an agent for the task (`msg` is `agent=<name>`). A Claude→Codex fallback emits a second `AGENT_START` for Codex. |
| `AGENT_FALLBACK` | Default Claude execution hit a usage/session-limit pattern and retried through Codex (`msg` is `from=claude to=codex`). |
| `AGENT_DONE` | The shell wrapper finished an agent run (`msg` is `agent=<name> exit=<code>`), making the completing agent evident even after fallback. |
| `OK` | The fired child process exited cleanly (exit code 0). |
| `EXIT_n` | The fired child process exited non-zero with code `n`. When the job's log file is populated, a bounded tail of the job's trailing output is appended as the `msg` (4th column) — the optional field already used by `ERR_JOB`/`ERR`/`BODY_RELOADED` — so the failure is diagnosable from `.cron.log` alone (see example below). |
| `ERR` | The child process failed to spawn (process-level error, not a job throw). |
| `ERR_JOB` | A synchronous cron job-callback threw; recorded instead of being swallowed. Format: `<id>\tERR_JOB\t<error-string>`. |
| `SKIPPED_OVERLAP` | A fire was skipped because the previous run was still in flight (`overlap: false`). |

An enriched `EXIT_n` line (tab-separated, tail whitespace-collapsed and
bounded to 200 chars):

```text
2026-06-12T23:30:00.000Z\theartbeat\tEXIT_1\tError: connect ECONNREFUSED 127.0.0.1:5432 … (bounded tail of the job's log)
```

A cron whose `schedule:` string is not a valid cron expression is skipped
at load time — it logs `SCHED_INVALID` and never enters the scheduled set,
so a single malformed schedule cannot crash the runtime and the other crons
keep running.

`BODY_RELOADED` and `BODY_RELOAD_ERR` are documented under
[Hot-reload](#hot-reload).

## Scheduled jobs

| File | Schedule | Description |
|------|----------|-------------|
| `autopilot.md` | `5 * * * *` (every hour at +5 min) | Self-improving loop — issue-queue-first selection (build the oldest open `autopilot` issue; research + file a ticket when the queue is empty), eval gate before ready, finalized in a per-run tmux session (kill-switch: `enabled: false`) |
| `heartbeat.md` | `0 * * * *` (hourly) | Hourly pulse — review memory, surface anything urgent |
| `cleanup-tasks.md` | `0 23 * * 0` (Sun 23:00 MT) | Weekly Ralph session sweep — archive completed tasks |
| `eval-weekly.md` | `0 6 * * 0` (Sun 06:00 MT) | Weekly eval suite — run probes, log any regressions to memory |

## tmux sessions

A job with `tmux: true` in its frontmatter runs each fire in its own detached tmux session instead of an in-process child, so the user can attach to a run, read its scrollback, and reattach later.

- **Session name**: `cron-<id>-<MMDD>-<HHMM>` (e.g. `cron-autopilot-0610-1805`), derived from the fire time. The runtime logs `SPAWNED <session>` to `.cron.log`.
- **Agent selection**: by default jobs use `CRON_AGENT_BIN` (compose default: `claude`). A cron can set `agent: <binary>` in frontmatter to override that for one job; `autopilot.md` sets `agent: pi` so the run itself and its kept Advisor session are attachable Pi sessions without forcing heartbeat/cleanup/eval onto Pi.
- **Agent attribution**: the shell wrapper logs `AGENT_START agent=<name>` and `AGENT_DONE agent=<name> exit=<code>` from inside the run. If default Claude falls back to Codex, `.cron.log` shows `AGENT_START agent=claude`, `AGENT_FALLBACK from=claude to=codex`, `AGENT_START agent=codex`, then `AGENT_DONE agent=codex exit=<code>`.
- **Env exported into the agent**: `CRON_TMUX_SESSION=<session>`, `CRON_KEEP_MARKER=/tmp/<session>.keep`, and `CRON_OVERLAP_PIDFILE=/tmp/cron-<id>.pid`.
- **Keep-marker contract**: if the agent `touch`es `$CRON_KEEP_MARKER` before exiting, the session persists by resuming the run's own conversation as a live, attachable agent (`claude --continue` for a Claude run, `pi --continue` for an `agent: pi` run, or `codex` after a Claude→Codex fallback), falling back to a shell if that exits; otherwise it auto-closes when the agent finishes. Claude/Codex tmux runs are headless (`claude -p`, or `codex exec --sandbox danger-full-access` after a Claude usage/session-limit fallback). Pi tmux runs intentionally use the positional TUI shape (`pi "$(cat prompt)"`), matching `tmux new -s <name> pi "<prompt>"`, so attaching mid-run shows the live Pi pane instead of a blank piped/headless screen. By convention a job keeps its session only when the run produced something worth revisiting (e.g. autopilot keeps it when a PR was opened).
- **Overlap guard**: a per-id pidfile `/tmp/cron-<id>.pid` blocks a new fire while a previous one is still running when `overlap: false`; the skipped fire logs `SKIPPED_OVERLAP`. Kept interactive sessions that reach a terminal state can remove `$CRON_OVERLAP_PIDFILE` themselves before staying alive for manual review, so an intentionally retained pane does not suppress future fires.

Jobs with `tmux` absent or `false` keep the default in-process spawn. Steer autopilot's priorities by filing GitHub issues labeled `autopilot` (the work queue) — no in-repo backlog file.

## Hot-reload

A cron definition's **body** (the agent prompt) hot-reloads at fire time: the runtime re-reads the file just before each fire, so edits take effect at the next scheduled fire without a restart. On a read/parse error, the runtime falls back to the cached boot-time body and logs `BODY_RELOAD_ERR`. When a fire's body differs from the boot-time cached version, a `BODY_RELOADED` line appears in `crons/.cron.log` — this signal recurs on every fire after an edit until the runtime is restarted (which re-baselines). Schedule/frontmatter changes (`schedule`, `enabled`, `timezone`, `overlap`) and added/removed `crons/*.md` files now take effect via a `SIGHUP` reschedule (see [Reload schedules](#reload-schedules-sighup) below) — there is still no auto-watcher, so the reload is operator-triggered. A full runtime restart is only needed for `scripts/cron-runtime.ts` *code* changes. Rollback: remove the `reloadBody` call and restore the two `entry.body` usages in `scripts/cron-runtime.ts`.

## Reload schedules (SIGHUP)

The runtime installs a `SIGHUP` handler: on signal it stops the live croner jobs, re-reads every `crons/*.md`, and re-arms the schedules — so schedule/frontmatter edits and added/removed cron files apply without restarting the `cron-system` tmux session. Each successful reload appends a `RELOAD` line (`id` `system`, `msg` the cron count) to `crons/.cron.log`. A malformed `schedule:` present during a reload is dropped (`SCHED_INVALID`) exactly as at boot; the rest stay scheduled and the runtime does not exit. In-flight fires are not interrupted — `overlap: false` remains the only protection against a reschedule racing a still-running fire.

The runtime runs inside the container, so reload from the host via `docker exec`:

```bash
# Health check first — confirm the PID file points at a live runtime.
docker exec -u sandbox openharness sh -c 'kill -0 "$(cat crons/.pid)" 2>/dev/null && echo alive || echo "not running"'

# Reload schedules.
docker exec -u sandbox openharness kill -HUP "$(cat crons/.pid)"
```

The bare `kill -HUP "$(cat crons/.pid)"` form works only from *inside* the container — the host is a different PID namespace, so the PID in `crons/.pid` (set by `PID_FILE`) does not resolve there. **Escape hatch:** if a reload arms zero crons (e.g. files removed by accident), restart the runtime to restore the last good state — `tmux kill-session -t cron-system`, then relaunch it from the repo root: `node --experimental-strip-types scripts/cron-runtime.ts` (the documented `cron-system` start, per `.devcontainer/entrypoint.sh`).

## Override

Set `CRONS_DIR=<path>` to point the runtime at a different directory
(default: `crons`).
