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
2.8. **Autopilot health (nudge).** Check the hourly `/autopilot` loop for
    stuck per-run sessions and a jammed queue, and nudge where the signal
    is unambiguous. Four checks, only the first acts autonomously:

    - **Stuck sessions (KILL — autonomous nudge).** For each new `cron-autopilot-*`
      or legacy `autopilot-*` tmux session, read the pane tail for a terminal
      interactive prompt the run can never clear on its own — a Claude
      usage/session limit, a `Resume from summary` menu, `/upgrade`, or a fatal
      error banner. A detached cron run frozen there will never finish. Under
      `worktree: true` (autopilot's default) it no longer blocks later `:05`
      fires — they spawn fresh worktrees — but it still holds a worktree slot
      toward the concurrency cap (and a non-worktree cron would still stall under
      `overlap: false`). Kill the session, then reap its worktree below:
      ```bash
      for s in $(tmux ls 2>/dev/null | grep -oE '^(cron-)?autopilot-[^:]*'); do
        if tmux capture-pane -p -t "$s" 2>/dev/null | tail -25 \
             | grep -qiE 'hit your (usage|session) limit|session limit|/usage-credits|/upgrade|Resume from summary|Resume full session'; then
          tmux kill-session -t "$s"; rm -f "/tmp/$s.keep" "/tmp/$s.pid"
          echo "NUDGE: killed stuck autopilot session $s (frozen at a usage-limit/resume prompt)"
        fi
      done
      # sweep orphaned keep-markers (session already gone)
      for m in /tmp/cron-autopilot-*.keep /tmp/autopilot-*.keep; do [ -e "$m" ] || continue; \
        s=$(basename "$m" .keep); tmux has-session -t "$s" 2>/dev/null || rm -f "$m"; done
      # reap fallback worktrees that NO live tmux pane is working inside — robust to the
      # autopilot session rename (cron-autopilot-<ts> → autopilot-<branch>) and to
      # ship-spec's separate Advisor session (agent-ship-<slug>) sharing the worktree;
      # matching the worktree dir name to a session name would delete an ACTIVE one.
      cwds="$(tmux list-panes -a -F '#{pane_current_path}' 2>/dev/null)"
      for d in .worktrees/cron/*/; do [ -d "$d" ] || continue; \
        abs="$(cd "$d" && pwd)"; \
        printf '%s\n' "$cwds" | grep -qxF "$abs" || printf '%s\n' "$cwds" | grep -qF "$abs/" \
          || git worktree remove --force "$d" 2>/dev/null || true; done
      git worktree prune 2>/dev/null || true
      ```
    - **Long-lived sessions (SURFACE — never kill on age).** A new
      `cron-autopilot-*` or legacy `autopilot-*` session alive > 90 min with no
      stuck marker may be a persisted ready-PR session the operator is driving,
      or a slow build. Surface
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
    - **Stale draft autopilot PRs (WATCHDOG — surface only).** An open draft
      `autopilot` PR with no update for more than 24 hours may be abandoned.
      A draft backlog that saturates autopilot's same-day creation cap is also
      a jammed-loop signal even before 24h: the loop cannot create another PR
      until an operator promotes, fixes, closes, or merges one of the drafts.
      Draft age/backlog alone never authorizes mutation. Keep these signals
      distinct from the ready non-draft nudge above:
      ```bash
      AUTOPILOT_DRAFT_STALE_HOURS=24
      AUTOPILOT_DAILY_CAP=6
      today=$(date -u +%Y-%m-%d)
      now_epoch=$(date -u +%s)
      draft_rows=$(gh pr list --state open --label autopilot --limit 100 \
        --json number,isDraft,updatedAt,createdAt,headRefName \
        --jq '.[] | select(.isDraft==true) | [.number,.updatedAt,.createdAt,.headRefName] | @tsv')
      printf '%s\n' "$draft_rows" \
        | while IFS=$'\t' read -r n updated _created branch; do
            [ -n "$n" ] || continue
            updated_epoch=$(date -u -d "$updated" +%s 2>/dev/null || echo "$now_epoch")
            age_s=$(( now_epoch - updated_epoch ))
            age_h=$(( age_s / 3600 ))
            if [ "$age_s" -gt $(( AUTOPILOT_DRAFT_STALE_HOURS * 3600 )) ]; then
              echo "WATCHDOG: stale autopilot draft PR #$n updated ${age_h}h ago — investigate branch $branch; do not auto-undraft/close"
            fi
          done
      today_drafts=$(printf '%s\n' "$draft_rows" | awk -F '\t' -v today="$today" '$3 ~ "^" today { c++ } END { print c+0 }')
      if [ "$today_drafts" -ge "$AUTOPILOT_DAILY_CAP" ]; then
        draft_list=$(printf '%s\n' "$draft_rows" | awk -F '\t' '$1 { printf "%s#%s(%s)", sep, $1, $4; sep=", " }')
        echo "WATCHDOG: autopilot draft backlog saturates daily cap (${today_drafts}/${AUTOPILOT_DAILY_CAP} today) — investigate/promote/close one of: ${draft_list}; do not auto-undraft/close"
      fi
      ```
      Surface stale-age rows as `WATCHDOG: stale autopilot draft PR #<n> updated
      <Nh> ago — investigate branch <branch>; do not auto-undraft/close`.
      Surface cap saturation as `WATCHDOG: autopilot draft backlog saturates
      daily cap (<N>/6 today) — investigate/promote/close one of: <list>; do not
      auto-undraft/close`. Do NOT mark the PR ready, close it, merge it, or kill
      any session based on draft age/backlog alone.
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
