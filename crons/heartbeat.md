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
- Append the result to `memory/<today>/log.md` either way.
- **Mandatory closing step (do this even after long action chains):**
  append one liveness line to `crons/.cron.log`:
  `printf '[%s] heartbeat: %s\n' "$(date -Iseconds)" "<status>" >> crons/.cron.log`
  where `<status>` is one of `OK`, `OK (N watching)`, `OK (stale ralph: <name>)`,
  `OK (resolved: <item-snippet>)`. This is the cron's only liveness
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

- [ ] 2026-05-04: On 2026-05-10, schedule Open Harness X campaign week 2 through Post Bridge; keep X automated only, 2-3 posts max, Tuesday/Thursday/optional Saturday, with tasteful emoji structure. (source: weekly Sunday campaign scheduling)
- [ ] 2026-05-04: On 2026-05-17, schedule Open Harness X campaign week 3 through Post Bridge; keep X automated only, 2-3 posts max, Tuesday/Thursday/optional Saturday, with tasteful emoji structure. (source: weekly Sunday campaign scheduling)
- [ ] 2026-05-04: On 2026-05-24, schedule Open Harness X campaign week 4 through Post Bridge; keep X automated only, 2-3 posts max, Tuesday/Thursday/optional Saturday, with tasteful emoji structure. (source: weekly Sunday campaign scheduling)
- [ ] 2026-05-04: On 2026-06-01, review the Open Harness X campaign and decide whether to extend, pause, or do a Product Hunt/HN push. (source: weekly Sunday campaign scheduling)
