---
id: autopilot
schedule: "5 * * * *"
timezone: America/Denver
enabled: false
overlap: false
catchup: false
tmux: true
worktree: true
agent: pi
preflight: scripts/autopilot-caps.sh
repo: mifunedev/openharness
description: Hourly autopilot — issue-queue-first harness-infra improvements in an isolated-worktree Pi tmux Advisor session
---

# Autopilot

You are running on an hourly autopilot cycle, inside your own Pi tmux
session **in an isolated git worktree** (`$CRON_WORKTREE`, set by the cron
runtime because this cron declares `worktree: true`). The shared root checkout is
never touched, so the run can never dirty it or be skipped for overlap. Your job
is to select the next harness-infra improvement, construct the PM/advisor plan,
then run `/ship-spec --issue`, which builds and finalizes the item end-to-end
(compacts, worktree Advisor, `/delegate` + ralph, `/eval`, `/pr-audit` undraft)
into a ready-for-review PR. Autopilot defers the build to `/ship-spec` rather than
re-running implement/eval/finalize itself.

Invoke the `/autopilot` skill. Reminders:

- **Selection is issue-queue-first**: implement the oldest open issue labeled
  `autopilot` that has no open PR. If the queue is empty, run first-principles
  research (`/harness-audit`), then **file an `autopilot` ticket from the
  top-ranked finding and build it** this same run. GitHub issues are the queue.
- **Every PR states its selection rationale** in the description — why this item
  was chosen this session (queue position, or the research finding + ranking).
- **Default executor is delegate-advisor**: use `/goal Audit plan /w @"pm (agent)" using ultrathink, then run /ship-spec --issue to build it end-to-end (worktree Advisor, /delegate + ralph, /eval, /pr-audit undraft) into a ready-for-review PR`, then let `/ship-spec` own the build — it compacts, runs the worktree Advisor + `/delegate` + ralph, gates on `/eval`, and undrafts via `/pr-audit`. `AUTOPILOT_EXECUTOR=ralph` or `/autopilot --executor=ralph` keeps the legacy inline `scripts/ralph.sh "$SLUG"` fallback.
- **The `/eval` gate runs inside `/ship-spec`** before it marks the PR ready; a
  new green→red probe regression keeps the PR draft.
- **Caps**: at most 6 open `autopilot` PRs created per UTC day AND 10 total open
  at any time. A close/merge frees a slot. **Never auto-merge.** These caps are
  now enforced deterministically *before launch* by the `preflight:
  scripts/autopilot-caps.sh` gate (logs `SKIPPED-CAP-*` + liveness and spawns no
  session on a capped hour), scoped to `repo: mifunedev/openharness`; your
  in-session §1 recheck is defense-in-depth for a long run that crosses the cap
  mid-flight.
- **Harness-infra scope only** (skills/rules/docs/scripts/crons/wiki) — never
  sandbox application code.

After the work branch is known, rename this cron-created Pi session to the
sanitized `autopilot-<branch>` form (example: `autopilot-feat-123-slug`). Leave
`autopilot-<branch>` sessions alive for manual attach/continue/reap whenever a
PR is opened; no-op runs (caps hit, nothing to build) close their session
automatically.
