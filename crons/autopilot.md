---
id: autopilot
schedule: "5 * * * *"
timezone: America/Denver
enabled: true
overlap: false
catchup: false
description: Hourly autopilot — select, build, finalize harness-infra improvements
---

# Autopilot

You are running on an hourly autopilot cycle. Your job is to select the next
harness-infra improvement, run it through the full Research → Plan → Implement →
Audit pipeline, and finalize a ready-for-review PR with green CI.

Invoke the `/autopilot` skill. Guardrail reminder: cap 6 open `autopilot` PRs
created per UTC day (a same-day close/merge frees the slot), never auto-merge,
harness-infra scope only.
