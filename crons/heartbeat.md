---
id: heartbeat
schedule: "0 * * * *"
timezone: America/Denver
enabled: true
overlap: false
catchup: false
agent: pi
description: Hourly pulse — review memory, surface anything urgent; also the date-gated home of the weekly eval + task-cleanup sweeps
---

# Heartbeat

You are running on an hourly heartbeat. Your job is a brief check-in
that catches anything time-sensitive without doing real work — **except**
at two specific hours each week, when this same hourly pulse also runs a
date-gated weekly job (step 2.9). The weekly eval suite and the weekly
task-cleanup sweep were standalone crons before #264; they are now folded
into this heartbeat as `date`-gated steps so there is a single hourly
runtime timer instead of three.

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
2.9. **Weekly work (date-gated — run AT MOST one per pulse).** Compute the
    current Denver day-of-week and hour:
    ```bash
    WDOW=$(TZ=America/Denver date +%w)    # 0 = Sunday
    WHOUR=$(TZ=America/Denver date +%H)   # 00–23
    ```
    - If `WDOW` is `0` **and** `WHOUR` is `06` → run the **Weekly eval**
      procedure (see `## Weekly eval` below). This is the former
      `eval-weekly` cron (Sun 06:00 America/Denver).
    - If `WDOW` is `0` **and** `WHOUR` is `23` → run the **Weekly task
      cleanup** procedure (see `## Weekly task cleanup` below). This is the
      former `cleanup-tasks` cron (Sun 23:00 America/Denver).
    - Any other hour → skip; do no weekly work this pulse.
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
- Weekly work (step 2.9) → when the Weekly eval ran, include
  `EVAL: <OK|REGRESSION(N)>`; when the Weekly task cleanup ran, include
  `CLEANUP: <archived N, skipped M, groomed W | BLOCKED-TASKS-WIP>`. Each
  weekly procedure appends its own structured memory log + liveness line in
  addition to the heartbeat's.
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
  - **Result**: <OK | ACTION | WATCHING | DRIFT | NUDGE | STALE-RALPH | EVAL | CLEANUP>
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
  `OK (resolved: <item-snippet>)`, `OK (watchdog: <summary>)`, `OK (eval)`,
  `OK (cleanup)`, or `OK (maint)`. This is the cron's only per-pulse liveness
  signal — it MUST
  execute every pulse regardless of what else happened. The weekly procedures in
  step 2.9 append their OWN additional `eval-weekly:` / `cleanup-tasks:` liveness
  lines so existing log readers and watchdogs keep finding those tokens.

## Weekly eval

Date-gated by step 2.9 to **Sunday 06:00 America/Denver**. Run the context
fitness-function probe suite and log any regressions. This is a **log-only**
run: no issues are opened, no notifications are sent.

> **Note:** CI (`eval-probes` in `.github/workflows/ci-harness.yml`) is the
> primary green→red regression gate — it runs the suite on every PR and push to
> `development`/`main`. This weekly pass is a **supplemental** check that catches
> regressions from non-PR activity (direct commits, drift in live real state).

1. Compute `TODAY=$(date -u +%Y-%m-%d)` and ensure the log directory
   exists: `mkdir -p "memory/$TODAY"`.
2. Run the eval suite and capture full output to a temp file:
   ```bash
   bash .mifune/skills/eval/run.sh > /tmp/eval-weekly-out.txt 2>&1 || true
   ```
3. Check for regressions:
   ```bash
   grep -E "^  - " /tmp/eval-weekly-out.txt || true
   ```
4. If any lines matching `^  - ` were found (these are the regression
   entries produced by `run.sh`), append one dated entry per run to
   `memory/$TODAY/log.md` through `scripts/locked-append.sh`:

   ```
   ## eval-weekly -- HH:MM UTC
   - **Result**: REGRESSION
   - **Probe**: <probe-id from regression line>
   - **Source**: <source field from regression line>
   - **Observation**: probe regressed from PASS; see evals/RESULTS.md for current status
   ```

   Use one `## eval-weekly -- HH:MM UTC` heading block per run (not per
   probe). List each regressed probe as a separate bullet under
   `- **Probe**:` within that block.

   If there are no regressions, append instead:
   ```
   ## eval-weekly -- HH:MM UTC
   - **Result**: OP
   - **Probes**: <N from "ran N probe(s)" line>
   - **Observation**: all probes passed or skipped; no regressions
   ```

5. **Liveness:** append one liveness line to `crons/.cron.log` through
   `scripts/locked-append.sh`:
   ```bash
   printf '[%s] eval-weekly: %s\n' "$(date -Iseconds)" "<OK|REGRESSION(N)>" | scripts/locked-append.sh crons/.cron.log
   ```
   where the status token is `OK` when no regressions were found, or
   `REGRESSION(N)` (e.g. `REGRESSION(2)`) when N probes regressed.

Surface the result in the heartbeat reply as `EVAL: <OK|REGRESSION(N)>`.

## Weekly task cleanup

Date-gated by step 2.9 to **Sunday 23:00 America/Denver**. Sweep `tasks/`
once per week and archive anything that has finished. Per SPEC v0.7
§"Weekly cleanup cron": completed tasks move into the dated archive under
`tasks/`; incomplete tasks are left alone with a note. The same pass also
grooms stale `.worktrees/` branch checkouts, but it never touches the durable
`.worktrees/agent/` or `.worktrees/project/` namespaces. `memory/` carries
journal artifacts only — never a `tasks/` subfolder.

1. Compute `TODAY=$(date -u +%Y-%m-%d)`. The dated destination
   `tasks/archive/$TODAY/` is created inside the worktree (step 4); all
   archive moves now run there, not in the shared checkout.
2. **Pre-flight (scoped to `tasks/`):** check only the surface this job
   mutates — run `git status --porcelain -- tasks/ ':!tasks/archive/'`.
   Only a mid-write task under `tasks/` (the `tasks/archive/`
   destination is excluded so an in-progress archive write never
   self-flags the sweep) blocks the run; foreign WIP elsewhere in the
   shared checkout — an in-flight feature branch, a concurrent session's
   edits — is untouched and does NOT abort the sweep, mirroring the
   autopilot loop's `BLOCKED-OWNED-WIP` owned-surface convention. If that
   scoped status is non-empty, abort: append a note to
   `memory/$TODAY/log.md`, emit the distinct liveness token to
   `crons/.cron.log`
   (`printf '[%s] cleanup-tasks: %s\n' "$(date -Iseconds)" "BLOCKED-TASKS-WIP" | scripts/locked-append.sh crons/.cron.log`),
   and stop here — do NOT fall through to step 7's `OK` line. This
   `BLOCKED-TASKS-WIP` token is intentionally distinct from the
   `OK (archived N, skipped M)` success token and the `HEARTBEAT_OK`
   nothing-to-do reply. Do not contaminate the archive branch with
   unrelated changes.
3. Resolve `$BASE` = default target branch per `.mifune/skills/git/SKILL.md`
   (`development` → `main` → `master`, whichever exists). Fetch it
   (`git fetch origin "$BASE"`), then provision a dedicated, crash-safe
   worktree for the archive work — never branch or commit against the
   shared checkout (its dirty state must neither block a switch nor leak
   into the archive commit):
   - **Prune stale first** so a same-day re-run is idempotent (tear down
     and recreate — never reuse a possibly-dirty worktree left by a prior
     failed run):
     ```bash
     git worktree remove --force .worktrees/archive/$TODAY 2>/dev/null || true
     git branch -D "archive/$TODAY" 2>/dev/null || true   # drop a stale branch from a partial run
     git worktree prune
     ```
   - **Create** the worktree off `origin/$BASE` (paths resolve from the
     repo root, not the cron's ambient cwd):
     ```bash
     git worktree add .worktrees/archive/$TODAY -b archive/$TODAY origin/$BASE
     ```
   - **Arm crash-safe teardown** so a failed push/PR step (or any error
     exit) never strands the worktree for next week's run to collide with:
     ```bash
     trap 'git worktree remove --force .worktrees/archive/$TODAY 2>/dev/null || true; git worktree prune' EXIT
     ```
   Every `git` command for the archive from here on runs inside the
   worktree via `git -C .worktrees/archive/$TODAY <cmd>`.
4. Inside the worktree, create the dated destination
   (`mkdir -p .worktrees/archive/$TODAY/tasks/archive/$TODAY`), then scan
   the worktree's `origin/$BASE` checkout — committed state only, so
   uncommitted task dirs in the shared checkout are never archived. For
   each `.worktrees/archive/$TODAY/tasks/<taskdesc>/` (skipping
   `tasks/archive/`):
   - If `tasks/<taskdesc>/progress.txt` ends with a line matching exactly
     `STATUS: COMPLETE`:
     - Kill the matching tmux session if one exists:
       `tmux kill-session -t <taskdesc> 2>/dev/null || true`.
     - Move the folder inside the worktree:
       `git -C .worktrees/archive/$TODAY mv tasks/<taskdesc> tasks/archive/$TODAY/<taskdesc>`
       (falls back to `mv` + `git -C .worktrees/archive/$TODAY add` if
       `git mv` rejects an untracked path).
   - Otherwise, leave the folder in place and append a one-line note to
     `memory/$TODAY/log.md` recording that `<taskdesc>` is still active
     (include the last `progress.txt` modification time).
5. **Groom stale `.worktrees/` branch checkouts** from the shared repo
   root after the task scan. Initialize `W=0` plus a `GROOMED_WORKTREES`
   list. This pass is intentionally limited to harness branch worktrees
   and cron/archive leftovers: it must skip any path under
   `.worktrees/agent/` and `.worktrees/project/` without inspecting or
   mutating those namespaces. Also skip the current archive worktree
   `.worktrees/archive/$TODAY` until step 8 tears it down.
   - Build the registered-worktree candidate set from
     `git worktree list --porcelain`. For each worktree path under
     `$PWD/.worktrees/` that is NOT under `.worktrees/agent/`, NOT under
     `.worktrees/project/`, and NOT `.worktrees/archive/$TODAY`:
     - Skip if any live tmux pane is cwd'd inside it:
       `tmux list-panes -a -F '#{pane_current_path}' | grep -F -- "$path"`.
     - Skip if its branch has an open PR:
       `gh pr list --head "$branch" --state open --json number --jq 'length'`.
     - Skip if the worktree's latest commit is newer than 30 days.
     - Otherwise remove it with `git worktree remove --force "$path"`,
       append the path to `GROOMED_WORKTREES`, and increment `W`.
   - Then prune corrupt/orphan folders that are not registered git
     worktrees: scan `.worktrees/` directories excluding `.worktrees/agent/`,
     `.worktrees/project/`, and `.worktrees/archive/$TODAY`; remove only
     directories older than 30 days with no live tmux pane cwd'd inside
     them, using `rm -rf "$path"`, then record them in
     `GROOMED_WORKTREES` and increment `W`.
   - Remove empty non-reserved namespace directories left behind by the
     sweep (`find .worktrees -mindepth 1 -maxdepth 1 -type d ! -name agent ! -name project -empty -delete`), then run `git worktree prune`.
   - Append a one-line note to `memory/$TODAY/log.md` for each skipped
     registered worktree, recording the reason (`open-pr`, `live-pane`, or
     `too-new`) and its last commit time.
6. If anything was archived this run (`N > 0`) — every git step runs
   inside the worktree via `git -C .worktrees/archive/$TODAY`:
   - Stage the moves: `git -C .worktrees/archive/$TODAY add tasks/`.
   - Commit: `git -C .worktrees/archive/$TODAY commit -m "archive: weekly cleanup $TODAY (N tasks)"`.
   - Push: `git -C .worktrees/archive/$TODAY push -u origin "archive/$TODAY"`.
   - Open a PR (or update an existing one for the same branch) per
     `.mifune/skills/git/SKILL.md` conventions:
     `gh pr create --base "$BASE" --head "archive/$TODAY" \
        --title "FROM archive/$TODAY TO $BASE" \
        --body "Weekly task sweep — archived N completed tasks, skipped M still-active, groomed W stale worktrees.\n\nArchived: <list>\nSkipped: <list>\nGroomed worktrees: <list>"`.
     If `gh pr create` reports the PR already exists, capture its URL
     via `gh pr view --json url -q .url` instead.
7. After the sweep, append a single summary line to
   `memory/$TODAY/log.md`: `cleanup-tasks: archived N, skipped M, groomed W worktrees, pr <url-or-none>`.
8. **Mandatory closing steps (always run):**
   - **Tear down the worktree** — covers normal completion, the
     nothing-to-archive case (`N = 0`), and partial runs; complements the
     step-3 `trap`, which also fires on any error/abort exit:
     `git worktree remove --force .worktrees/archive/$TODAY 2>/dev/null || true; git worktree prune`.
   - **Liveness line:** append one liveness line to `crons/.cron.log` through
     `scripts/locked-append.sh`:
     `printf '[%s] cleanup-tasks: %s\n' "$(date -Iseconds)" "OK (archived N, skipped M, groomed W worktrees)" | scripts/locked-append.sh crons/.cron.log`.

Surface the result in the heartbeat reply as
`CLEANUP: <archived N, skipped M, groomed W | BLOCKED-TASKS-WIP>`. Nothing to
archive, nothing skipped, and no stale worktrees groomed → no branch, no PR.

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
setsid bash /home/sandbox/harness/scripts/maintenance/restart-openharness-tmux.sh </dev/null \
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
