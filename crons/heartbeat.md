---
id: heartbeat
schedule: "0 * * * *"
timezone: America/Denver
enabled: true
overlap: false
catchup: false
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
2.8. **Autopilot health (watchdog skill).** Run `/autopilot-watchdog` every
    heartbeat wake and include any emitted `NUDGE:`, `WATCHING:`, or
    `WATCHDOG:` lines in the heartbeat reply/log. The skill is also the ad-hoc
    operator entrypoint for this check; do not duplicate its bash here. Its
    load-bearing contract:

    - Draft autopilot PRs are stale after **2 hours** in draft with no update.
    - Draft stale/backlog findings are surface-only investigation hints; they do
      not authorize `gh pr ready`, `gh pr close`, or `gh pr merge`.
    - The only autonomous mutation is killing tmux sessions frozen at known
      usage-limit/resume prompts.
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
- Autopilot nudge/watchdog (step 2.8) → killed stuck session or a surfaced
  ready/long-lived/stale-draft signal → include in reply as `NUDGE: <action>`,
  `WATCHING: autopilot ...`, or `WATCHDOG: <action>` as emitted and note in
  `memory/<today>/log.md`. No stuck session, no ready PR, and no stale draft
  PR → no extra output.
- Append the result to `memory/<today>/log.md` either way.
- **Mandatory closing step (do this even after long action chains):**
  append one liveness line to `crons/.cron.log`:
  `printf '[%s] heartbeat: %s\n' "$(date -Iseconds)" "<status>" >> crons/.cron.log`
  where `<status>` is one of `OK`, `OK (N watching)`, `OK (stale ralph: <name>)`,
  `OK (resolved: <item-snippet>)`, `OK (nudged autopilot: <session>)`. This is the cron's only liveness
  signal — it MUST execute every pulse regardless of what else happened.

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
