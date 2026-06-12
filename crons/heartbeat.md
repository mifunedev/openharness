---
id: heartbeat
schedule: "0 * * * *"
timezone: America/Los_Angeles
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
    cron-staleness drift), surface each finding in
    `memory/<today>/log.md` and include it in the reply as
    `DRIFT: <summary>`. When `/drift-check` reports all classes clean,
    append nothing extra — the existing `HEARTBEAT_OK` reply stays
    unchanged; do NOT add a per-pulse "no drift" block on clean runs.
2.8. **Autopilot health (nudge).** Check the hourly `/autopilot` loop for
    stuck per-run sessions and a jammed queue, and nudge where the signal
    is unambiguous. Three checks, only the first acts autonomously:

    - **Stuck sessions (KILL — autonomous nudge).** For each `autopilot-*`
      tmux session, read the pane tail for a terminal interactive prompt the
      run can never clear on its own — a usage/session limit, a
      `Resume from summary` menu, `/upgrade`, or a fatal error banner. A
      detached cron run frozen there will never finish and, under
      `overlap: false`, blocks every later `:05` fire:
      ```bash
      for s in $(tmux ls 2>/dev/null | grep -oE '^autopilot[^:]*'); do
        if tmux capture-pane -p -t "$s" 2>/dev/null | tail -25 \
             | grep -qiE 'hit your (usage|session) limit|session limit|/usage-credits|/upgrade|Resume from summary|Resume full session'; then
          tmux kill-session -t "$s"; rm -f "/tmp/$s.keep"
          echo "NUDGE: killed stuck autopilot session $s (frozen at a usage-limit/resume prompt)"
        fi
      done
      # sweep orphaned keep-markers (session already gone)
      for m in /tmp/autopilot-*.keep; do [ -e "$m" ] || continue; \
        s=$(basename "$m" .keep); tmux has-session -t "$s" 2>/dev/null || rm -f "$m"; done
      ```
    - **Long-lived sessions (SURFACE — never kill on age).** An `autopilot-*`
      session alive > 90 min with no stuck marker may be a persisted
      ready-PR session the operator is driving, or a slow build. Surface
      `WATCHING: autopilot session <s> alive <age> — verify it is not hung`
      and leave it. Age alone never justifies a kill.
    - **Ready / jammed-loop PR (SURFACE — never merge).** A green, mergeable,
      non-draft open `autopilot` PR sitting unreviewed wants an operator
      merge (the loop self-merges nothing):
      ```bash
      gh pr list --state open --label autopilot \
        --json number,isDraft,mergeable,mergeStateStatus \
        --jq '.[] | select(.isDraft==false and .mergeable=="MERGEABLE" and .mergeStateStatus=="CLEAN") | .number'
      ```
      Surface each as `NUDGE: autopilot PR #<n> is green + mergeable — merge
      to free the queue`. Do NOT run `gh pr merge`.
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
- Autopilot nudge (step 2.8) → killed stuck session or a surfaced
  ready/long-lived signal → include in reply as `NUDGE: <action>` (and
  `WATCHING: autopilot ...` for surfaced-only items) and note in
  `memory/<today>/log.md`. No stuck session and no ready PR → no extra
  output.
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
