---
title: "Cron Runtime"
slug: cron-runtime
tags: [cron, runtime, scheduler, drift-check, automation, open-harness]
created: 2026-06-16
updated: 2026-06-20
sources:
  - raw/2026-06-16-cron-runtime.md
related: [pi-loop, ship-spec-orchestration]
confidence: provisional
---

# Cron Runtime

## Relevant Source Files
- `scripts/cron-runtime.ts:8-32` — `CronEntry` carries scheduler/config fields, prompt body text, and the source `filePath` used by hot reload.
- `scripts/cron-runtime.ts:35-37` — `CRONS_DIR`, `PID_FILE`, and `LOG_FILE` define the runtime's local state files.
- `scripts/cron-runtime.ts:75-101` — frontmatter parsing maps `schedule`, `enabled`, `tmux`, `worktree`, `agent`, `preflight`, and `repo` into `CronEntry` while preserving the caller-provided source file path.
- `scripts/cron-runtime.ts:126-172` — `loadCrons` filters disabled crons, invalid ids, id mismatches, unsafe agents/remotes/repos, and invalid schedules before scheduling.
- `scripts/cron-runtime.ts:176-217` — `acquireLock` is the singleton guard: it uses exclusive pidfile creation, preserves live holders, and reclaims stale/unparsable files by unlinking then retrying exclusive creation.
- `scripts/cron-runtime.ts:234-274` — `reloadEntryForFire` re-reads fire-time execution metadata and must preserve the original path-qualified `filePath` so later body reloads keep reading the cron file, not a basename in the process cwd.
- `scripts/cron-runtime.ts:277-291` — `reloadBody` re-reads only the cron body from disk at fire time using the same path-qualified `filePath`.
- `scripts/cron-runtime.ts:740-813` — `fireTmux` decides worktree isolation, reloads the body, writes the prompt file, and launches tmux.
- `scripts/cron-runtime.ts:825-866` — `preflight` runs before worktree/tmux/agent creation.
- `scripts/cron-runtime.ts:980-1048` — `scheduleAll` arms crons and `sighupHandler` stops/re-arms them on SIGHUP.
- `.claude/skills/drift-check/SKILL.md:190-203` — `/drift-check` defines conservative stale frontmatter/config detection.

## Summary
Open Harness' cron runtime is a small scheduler that reads `crons/*.md` frontmatter into `CronEntry` records, uses the markdown body as the agent prompt, and protects the scheduler with a singleton pidfile lock. Body text hot-reloads at fire time through the entry's path-qualified `filePath`; selected execution metadata (`preflight`, `repo`, agent, tmux/worktree flags, etc.) is also re-read immediately before a fire while the already-armed Croner schedule cadence still requires SIGHUP or restart to change.

## Detail
A cron file has two lifecycles. Its leading frontmatter becomes scheduler/config state: `parseCronFile` maps `schedule`, `enabled`, `tmux`, `worktree`, `agent`, `preflight`, and `repo` into a `CronEntry` while retaining the caller-provided source path (`scripts/cron-runtime.ts:75-101`). `loadCrons` then drops entries that the runtime will not arm: disabled files, invalid ids, filename/id mismatches, unsafe agent/repo/remote overrides, and invalid schedules (`scripts/cron-runtime.ts:126-172`). Those filters define what counts as a schedulable cron.

Before arming jobs, the runtime acquires `crons/.pid` through `acquireLock` (`scripts/cron-runtime.ts:147-186`). The lock path uses exclusive pidfile creation (`wx`) first, so two concurrent starts cannot both create the singleton marker. If an existing holder is live, startup returns false and exits; if the pidfile is stale or unparsable, the runtime unlinks it and retries exclusive creation instead of overwriting blindly. If another contender wins between stale cleanup and retry, the next loop re-inspects that live holder and backs off.

The body lifecycle is different. `reloadEntryForFire` re-reads safety-sensitive execution metadata immediately before each fire and returns a live entry that keeps the cached body plus the original path-qualified `filePath` (`scripts/cron-runtime.ts:234-274`). `reloadBody` then re-reads that same file at fire time and returns the latest body text without changing the already-armed schedule context (`scripts/cron-runtime.ts:277-291`). Preserving the full `filePath` across both reload steps is load-bearing: otherwise the runtime can try to open `heartbeat.md` or `autopilot.md` from the process cwd, log `BODY_RELOAD_ERR`, and keep using stale boot-time prompt bodies. `fireTmux` calls `reloadBody`, writes the prompt file, and launches the tmux/agent wrapper; if `worktree: true`, it isolates that fire in a fresh `.worktrees/cron/<session>` checkout (`scripts/cron-runtime.ts:740-813`). A configured `preflight` gate runs before any worktree, tmux session, or agent is created (`scripts/cron-runtime.ts:825-866`).

Rescheduling is explicit. `scheduleAll` reads the cron directory and arms jobs, while `sighupHandler` stops active handles and re-runs `scheduleAll` without exiting the runtime (`scripts/cron-runtime.ts:980-1048`). That means body-only edits hot-reload on the next fire, selected safety/execution metadata can update at fire time, but schedule cadence and newly added/removed cron files need either SIGHUP reschedule or a `cron-system` restart.

If the singleton lock is wedged, recover manually rather than adding broad auto-recovery: stop the `cron-system` tmux session, verify the PID recorded in `crons/.pid` is not a live runtime/session you need to preserve, remove `crons/.pid`, then restart the cron runtime from the repository root.

`/drift-check` is the read-only guard for this distinction. It compares schedulable cron file mtimes against the live runtime start time and conservatively warns that restart-required frontmatter/config may be stale; without a runtime snapshot it does not prove which field changed (`.claude/skills/drift-check/SKILL.md:190-203`). Its Step C-2 predicate mirrors the runtime's schedulable filters and names the restart-required field set in the diagnostic (`.claude/skills/drift-check/SKILL.md:250-392`).

## System Relationships

```mermaid
flowchart LR
  File["crons/*.md"] --> Parse["parseCronFile<br/>frontmatter + body"]
  Parse --> Load["loadCrons<br/>validate schedulable entries"]
  Load --> Lock["acquireLock<br/>exclusive crons/.pid"]
  Lock --> Arm["scheduleAll<br/>arm Cron handles"]
  Arm --> Fire["fire/fireTmux"]
  Fire --> Meta["reloadEntryForFire<br/>execution metadata + path"]
  Meta --> Preflight["optional preflight"]
  Meta --> Body["reloadBody<br/>latest prompt body"]
  Fire --> Tmux["tmux + agent<br/>root or worktree"]
  File --> Drift["/drift-check<br/>mtime > runtime start"]
  Drift --> Warn["possible stale frontmatter/config<br/>SIGHUP or restart"]
  Arm --> SIGHUP["sighupHandler<br/>stop + re-arm"]
```

## See Also
- [[pi-loop]]
- [[ship-spec-orchestration]]
