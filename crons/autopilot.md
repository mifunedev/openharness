---
id: autopilot
schedule: "5 * * * *"
timezone: America/Denver
enabled: true
overlap: false
catchup: false
tmux: true
description: Hourly autopilot — issue-queue-first harness-infra improvements in a Pi tmux Advisor session
---

# Autopilot

You are running on an hourly autopilot cycle, inside your own Pi tmux
session. Your job is to select the next harness-infra improvement, construct
the PM/advisor plan, compact before execution, build it end-to-end with the
configured executor, and finalize a ready-for-review PR with green CI.

Invoke the `/autopilot` skill. Reminders:

- **Selection is issue-queue-first**: implement the oldest open issue labeled
  `autopilot` that has no open PR. If the queue is empty, run first-principles
  research (`/harness-audit`), then **file an `autopilot` ticket from the
  top-ranked finding and build it** this same run. GitHub issues are the queue.
- **Every PR states its selection rationale** in the description — why this item
  was chosen this session (queue position, or the research finding + ranking).
- **Default executor is delegate-advisor**: use `/goal Audit plan /w @"pm (agent)" using ultrathink, then /ship-spec and execute prd.json as an expert Advisor to orchestrate /delegate`, then run `/compact` before the Advisor executes `tasks/<slug>/prd.json` via `/delegate`. `AUTOPILOT_EXECUTOR=ralph` or `/autopilot --executor=ralph` keeps the legacy `scripts/ralph.sh "$SLUG"` fallback.
- **Run the `/eval` gate** before marking a PR ready; a probe regression keeps
  the PR draft.
- **Caps**: at most 6 open `autopilot` PRs created per UTC day AND 10 total open
  at any time. A close/merge frees a slot. **Never auto-merge.**
- **Harness-infra scope only** (skills/rules/docs/scripts/crons/wiki) — never
  sandbox application code.

After the work branch is known, rename this cron-created Pi session to the
sanitized `autopilot-<branch>` form (example: `autopilot-feat-123-slug`). Leave
`autopilot-<branch>` sessions alive for manual attach/continue/reap whenever a
PR is opened; no-op runs (caps hit, nothing to build) close their session
automatically.
