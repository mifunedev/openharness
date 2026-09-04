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

1. Check active `/spec execute` tasks: for each `.oh/tasks/*/progress.txt`, note
   any whose last update is older than 2 hours. Surface those in the reply.
2.5. Read the `## Active items` section below. For each item, decide
    whether resolution can be confirmed using ONLY the validation
    mechanisms enumerated in that section. If yes, surface
    `RESOLVED: <item>` so the next session removes the line. If no
    enumerated mechanism applies, surface
    `WATCHING: <item> (un-checkable)` and skip — do not invent ad-hoc
    checks. Do NOT edit `crons/heartbeat.md` yourself; sessions own
    that file.
2.7. Run `/audit drift`. If it reports any findings (framework drift
    `origin`↔`upstream`, branch-behind/append-file drift, or
    cron-staleness drift), include each finding in the reply as
    `DRIFT: <summary>`. When `/audit drift` reports all classes clean,
    append nothing extra — the existing `HEARTBEAT_OK` reply stays
    unchanged; do NOT add a per-pulse "no drift" block on clean runs.
3. Decide whether anything needs action right now.
4. If yes, act. If no, reply `HEARTBEAT_OK` and exit.

## Reporting

- Healthy with nothing to do → reply `HEARTBEAT_OK`.
- Action taken or stale `/spec execute` task detected → one-line summary plus
  the action.
- Pending `## Active items` → include in reply as
  `WATCHING: <item> (added <date>, age <Nd>)`. Resolved-this-pulse →
  `RESOLVED: <item> — remove the line in next session`.
- Drift detected by `/audit drift` → include in reply as
  `DRIFT: <summary>`. Clean run → no extra output.
- **Mandatory closing step (do this even after long action chains):** append one
  liveness line to `crons/.cron.log` through `scripts/locked-append.sh`:

  ```bash
  STATUS="<status>"
  printf '[%s] heartbeat: %s\n' "$(date -Iseconds)" "$STATUS" | scripts/locked-append.sh crons/.cron.log
  ```

  where `<status>` is one of `OK`, `OK (N watching)`, `OK (stale spec task: <name>)`,
  or `OK (resolved: <item-snippet>)`.
  This is the cron's only per-pulse liveness signal — it MUST
  execute every pulse regardless of what else happened.

## Active items

Watchlist the heartbeat surfaces each pulse. Tasks that need to be
concluded across sessions land here.

Sessions add and remove lines; the cron only reads. Format:

    - [ ] YYYY-MM-DD: <description> (source: <what-added-it>)

Entry: a session appends a line when (a) something needs deferred
follow-up, (b) a prior heartbeat pulse surfaced something worth
tracking, or (c) a skill (/audit harness, /audit skills,
/strategic-proposal) suggested it.

Exit: remove the line when resolved, or replace with `see #<issue>`
when promoted to a GitHub issue. Items 30+ days old surface as STALE
in heartbeat replies until re-dated or removed.

### Permitted validation checks (step 2.5 must use only these)

- `gh pr view <N> --json state` — resolved if `state == "MERGED"`
- `gh issue view <N> --json state` — resolved if `state == "CLOSED"`
- `gh run list --branch <branch> --limit 1 --json conclusion` — resolved if `conclusion == "success"`
- `gh release list --limit 5` — resolved if the named version is in the output
- Date-based reminders ("on YYYY-MM-DD do X") — resolved when the date has passed AND a corresponding `crons/.cron.log` liveness line confirms the action

If an item maps to none of these, it is un-checkable. Sessions must
either rephrase it to fit a check or accept it will surface
indefinitely until manually removed.

*(Empty — append items as needed.)*
