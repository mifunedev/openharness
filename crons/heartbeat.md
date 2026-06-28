---
id: heartbeat
schedule: "0 * * * *"
timezone: America/Los_Angeles
enabled: false
overlap: false
catchup: false
agent: pi
description: Hourly pulse — review memory, surface anything urgent
---

# Heartbeat

You are running on an hourly heartbeat. Your job is a brief check-in
that catches anything time-sensitive without doing real work.

## Tasks

1. Read today's `memory/<today>/log.md` (create the directory if it
   does not exist; today is `date -u +%Y-%m-%d`).
2. Check active Ralph sessions: for each `tasks/*/progress.txt`, note
   any whose last update is older than 2 hours. Surface those in the log.
2.5. Read the `## Active items` section below. For each item, decide
    whether resolution can be confirmed using ONLY the validation
    mechanisms enumerated in that section. If yes, surface
    `RESOLVED: <item>` so the next session removes the line. If no
    enumerated mechanism applies, surface
    `WATCHING: <item> (un-checkable)` and skip — do not invent ad-hoc
    checks. Do NOT edit `crons/heartbeat.md` yourself; sessions own
    that file.
2.7. Run `/drift-check`. If it reports any findings (framework drift
    `origin`↔`upstream`, branch-behind/append-file drift, or
    cron-staleness drift), surface
    each finding in `memory/<today>/log.md` and include in the reply as
    `DRIFT: <summary>`. When `/drift-check` reports all classes clean,
    append nothing extra — the existing `HEARTBEAT_OK` reply stays
    unchanged; do NOT add a per-pulse "no drift" block on clean runs.
2.8. **Watchdog nudge.** Run `/watchdog --action all --repo mifunedev/openharness`.
    The watchdog is generic, but its current required action is autopilot draft
    PR recovery: determine whether draft PRs are active, stuck, or stale; if a
    draft is already green/mergeable/clean, remove draft with `gh pr ready`; if
    it is stale but not promotable, complete the remaining work on that PR branch,
    run targeted checks, push, and only then remove draft. It may also kill tmux
    sessions frozen at usage-limit/resume prompts, or reap completed autopilot PR
    sessions only after the PR is terminal and the pane is idle. It never merges
    PRs and never kills sessions on age alone.
2.10. **One-shot scheduled maintenance (date-gated).** Compute the current
    Denver date and hour:
    ```bash
    SDATE=$(TZ=America/Denver date +%Y-%m-%d)
    SHOUR=$(TZ=America/Denver date +%H)
    ```
    - If `SDATE` is `2026-06-20` **and** `SHOUR` is (`12` **or** `13`) **and** the
      sentinel `/tmp/oh-restart-273.done` is absent → run the **Scheduled
      maintenance** procedure (see `## Scheduled maintenance` below). This is the
      **spec-execute** node of `tasks/restart-openharness-tmux/` (issue #273). The
      `13` hour is a single retry: the script writes the sentinel only on success
      and is `flock`-guarded, so a healthy noon run makes the 13:00 pulse a no-op,
      while a failed/missed noon run gets one more attempt.
    - Any other date/hour → skip; do no scheduled maintenance this pulse.
3. Decide whether anything needs action right now.
4. If yes, act. If no, append a brief "nothing pressing" note to
   `memory/<today>/log.md` and exit.

## Reporting

- Healthy with nothing to do → reply `HEARTBEAT_OK`.
- Action taken or stale Ralph session detected → one-line summary plus
  the action.
- Pending `## Active items` → include in reply as
  `WATCHING: <item> (added <date>, age <Nd>)`. Resolved-this-pulse →
  `RESOLVED: <item> — remove the line in next session`.
- Drift detected by `/drift-check` → include in reply as
  `DRIFT: <summary>` and note in `memory/<today>/log.md`. Clean run →
  no extra output.
- Watchdog nudge (step 2.8) → completed/undrafted stale PRs, killed stuck
  sessions, reaped completed autopilot PR sessions, or active-watch signals →
  include in reply as `NUDGE: <action>` (and `WATCHING: ...` for active or
  open-PR items) and note in `memory/<today>/log.md`. Clean watchdog run → no
  extra output.
- Scheduled maintenance (step 2.10) → when the one-shot maintenance fired,
  include `MAINT: restart-273 launched (detached)` and note it in
  `memory/<today>/log.md`. The detached restart script writes its own
  separate `restart-273:` liveness line and #273 comment.
- **Memory log contract (do this either way):** run a shell block that computes
  `TODAY` and `HEARTBEAT_TIME`, then append a structured record to
  `memory/$TODAY/log.md` through `scripts/locked-append.sh`. Do not paste shell
  expressions into the markdown heading; the log must contain the computed time,
  never a literal `$(date ...)` string.

  ```bash
  TODAY=$(date -u +%Y-%m-%d)
  HEARTBEAT_TIME=$(date -u +%H:%M)
  mkdir -p "memory/$TODAY"
  scripts/locked-append.sh "memory/$TODAY/log.md" <<EOF

  ## Heartbeat -- $HEARTBEAT_TIME UTC
  - **Result**: <OK | ACTION | WATCHING | DRIFT | NUDGE | STALE-RALPH>
  - **Action**: <one-line summary of action taken, or "nothing pressing">
  - **Observation**: <one sentence with the most important signal>
  EOF
  ```

- **Mandatory closing step (do this even after long action chains):** append one
  liveness line to `crons/.cron.log` through `scripts/locked-append.sh`:

  ```bash
  STATUS="<status>"
  printf '[%s] heartbeat: %s\n' "$(date -Iseconds)" "$STATUS" | scripts/locked-append.sh crons/.cron.log
  ```

  where `<status>` is one of `OK`, `OK (N watching)`, `OK (stale ralph: <name>)`,
  `OK (resolved: <item-snippet>)`, `OK (watchdog: <summary>)`, or `OK (maint)`.
  This is the cron's only per-pulse liveness signal — it MUST
  execute every pulse regardless of what else happened.

## Scheduled maintenance

Date-gated by step 2.10 to a specific one-shot window. The current entry executes
issue **#273** — clear the stale `system-cron` argv on the tmux server — at
**2026-06-20 12:00 America/Denver**, the operator-chosen auto-execute slot. This is
the **spec-execute** node of the `tasks/restart-openharness-tmux/` spec (planned in
`prd.md`/`prd.json`, critiqued in `critique.md`).

The restart kills and relaunches the tmux server, which would kill this heartbeat
agent's own session mid-step. So the heartbeat does **not** perform the restart
inline — it launches the reviewed runbook-as-code **detached** so it outlives the
server teardown.

**Ordering — the launch is this pulse's FINAL action.** Because the restart tears
down this agent's own session, first complete the normal Reporting steps for this
pulse (the `MAINT: restart-273 launched (detached)` reply line, the memory log, and
the `crons/.cron.log` liveness line), and ONLY THEN, as the last command, launch the
detached script:

```bash
# spec-execute: launch the #273 restart detached (it survives `tmux kill-server`).
# ABSOLUTE path — the launch must not depend on the agent's CWD; a relative path that
# fails to resolve would misfire silently (backgrounded, output only in the boot log).
setsid bash "$HARNESS/.oh/scripts/maintenance/restart-openharness-tmux.sh" </dev/null \
  >/tmp/oh-restart-273.boot.log 2>&1 &
```

The detached script owns everything after launch: it waits an 8s grace window, then
captures the live durable session map, kills the server, relaunches the durable
sessions that were live at capture in dependency order (website origin before its
tunnel; `cron-system` before `cron-watchdog`), clears a stale `crons/.pid`, verifies
(durable stack back + cleared argv + a live cron runtime; `mifune.dev` is checked but
informational, since it rebuilds on its own), appends a `restart-273:` liveness line
to `crons/.cron.log` through `scripts/locked-append.sh`, and closes #273 on success
(comments and stays open if degraded). It is `flock`- and sentinel-guarded
(`/tmp/oh-restart-273.done`), so the 13:00 retry pulse or any double-fire is a no-op.

Surface the result in the heartbeat reply as `MAINT: restart-273 launched
(detached)`. Once the date has passed, a follow-up removes this one-shot step and
this section.

## Active items

Watchlist the heartbeat surfaces each pulse. Tasks that need to be
concluded across sessions land here.

Sessions add and remove lines; the cron only reads. Format:

    - [ ] YYYY-MM-DD: <description> (source: <what-added-it>)

Entry: a session appends a line when (a) something needs deferred
follow-up, (b) a prior heartbeat pulse surfaced something worth
tracking, or (c) a skill (/harness-audit, /skill-lint,
/strategic-proposal) suggested it.

Exit: remove the line when resolved, or replace with `see #<issue>`
when promoted to a GitHub issue. Items 30+ days old surface as STALE
in heartbeat replies until re-dated or removed.

### Permitted validation checks (step 2.5 must use only these)

- `gh pr view <N> --json state` — resolved if `state == "MERGED"`
- `gh issue view <N> --json state` — resolved if `state == "CLOSED"`
- `gh run list --branch <branch> --limit 1 --json conclusion` — resolved if `conclusion == "success"`
- `gh release list --limit 5` — resolved if the named version is in the output
- Date-based reminders ("on YYYY-MM-DD do X") — resolved when the date has passed AND a corresponding entry exists in today's `memory/<today>/log.md` confirming the action

If an item maps to none of these, it is un-checkable. Sessions must
either rephrase it to fit a check or accept it will surface
indefinitely until manually removed.

*(Empty — append items as needed.)*
