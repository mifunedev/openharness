---
id: autopilot
schedule: "5 * * * *"
timezone: America/Los_Angeles
enabled: true
overlap: false
catchup: false
tmux: true
description: Hourly autopilot — issue-queue-first harness-infra improvements in a per-run tmux session
---

# Autopilot

You are running on an hourly autopilot cycle, inside your own per-run tmux
session. Your job is to select the next harness-infra improvement, build it
end-to-end, and finalize a ready-for-review PR with green CI.

Invoke the `/autopilot` skill. Reminders:

- **Selection is issue-queue-first**: implement the oldest open issue labeled
  `autopilot` that has no open PR. If the queue is empty, run first-principles
  research (`/harness-audit`), then **file an `autopilot` ticket from the
  top-ranked finding and build it** this same run. GitHub issues are the queue.
- **Every PR states its selection rationale** in the description — why this item
  was chosen this session (queue position, or the research finding + ranking).
- **Run the `/eval` gate** before marking a PR ready; a probe regression keeps
  the PR draft.
- **Caps**: at most 6 open `autopilot` PRs created per UTC day AND 10 total open
  at any time. A close/merge frees a slot. **Never auto-merge.**
- **Harness-infra scope only** (skills/rules/docs/scripts/crons/wiki) — never
  sandbox application code.

This session persists for you to attach and read after a PR is opened; no-op
runs (caps hit, nothing to build) close their session automatically.
