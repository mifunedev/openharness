---
id: uat-tester
title: "UAT Tester"
sidebar_position: 4
---

# UAT Tester

UAT Tester is a visual acceptance-testing agent that exercises deployed web applications as a real user would. Using headless Chromium via the `agent-browser` CLI, it navigates every user flow — authentication, CRUD operations, navigation, forms — across desktop, tablet, and mobile viewports. Its README describes its scope precisely: "A visual UAT agent that tests deployed web applications as a real user would. Identifies visual bugs, broken flows, accessibility violations, and UX issues. Produces a deduplicated, impact-ranked top-20 findings list per project as user stories." The agent supports multiple concurrent projects, each with its own scoped findings directory, and includes a recheck loop for verifying deployed fixes. It never writes application code, deploys changes, or merges PRs.

## Branch

[github.com/mifunedev/openharness@agent/uat-tester](https://github.com/mifunedev/openharness/tree/agent/uat-tester)

## Spin up

```bash
# Clone the harness and check out this agent's branch in a worktree:
git clone https://github.com/mifunedev/openharness.git ~/.openharness
cd ~/.openharness
mkdir -p .worktrees/agent
git worktree add .worktrees/agent/uat-tester origin/agent/uat-tester
cd .worktrees/agent/uat-tester
make sandbox
make shell
```

First files to read inside the sandbox:
- [`AGENTS.md`](https://github.com/mifunedev/openharness/blob/agent/uat-tester/AGENTS.md)
- [`workspace/AGENTS.md`](https://github.com/mifunedev/openharness/blob/agent/uat-tester/workspace/AGENTS.md)

## Workspace contents

- **Core testing skills** (under [`workspace/.claude/skills/`](https://github.com/mifunedev/openharness/blob/agent/uat-tester/workspace/.claude/skills/))
  - [`/visual-uat`](https://github.com/mifunedev/openharness/blob/agent/uat-tester/workspace/.claude/skills/visual-uat/SKILL.md) — full 6-phase UAT sweep of a registered project
  - [`/recheck`](https://github.com/mifunedev/openharness/blob/agent/uat-tester/workspace/.claude/skills/recheck/SKILL.md) — re-verify specific findings after fixes are deployed
  - [`/test-auth`](https://github.com/mifunedev/openharness/blob/agent/uat-tester/workspace/.claude/skills/test-auth/SKILL.md), [`/test-forms`](https://github.com/mifunedev/openharness/blob/agent/uat-tester/workspace/.claude/skills/test-forms/SKILL.md), [`/test-nav`](https://github.com/mifunedev/openharness/blob/agent/uat-tester/workspace/.claude/skills/test-nav/SKILL.md), [`/test-crud`](https://github.com/mifunedev/openharness/blob/agent/uat-tester/workspace/.claude/skills/test-crud/SKILL.md), [`/test-search`](https://github.com/mifunedev/openharness/blob/agent/uat-tester/workspace/.claude/skills/test-search/SKILL.md)
  - [`/test-a11y`](https://github.com/mifunedev/openharness/blob/agent/uat-tester/workspace/.claude/skills/test-a11y/SKILL.md) — WCAG A/AA, keyboard nav, ARIA, alt text, focus checks
  - [`/test-responsive`](https://github.com/mifunedev/openharness/blob/agent/uat-tester/workspace/.claude/skills/test-responsive/SKILL.md) — 3-viewport sweep (desktop, tablet, mobile)
  - [`/test-visual-regression`](https://github.com/mifunedev/openharness/blob/agent/uat-tester/workspace/.claude/skills/test-visual-regression/SKILL.md) — before/after screenshot comparison
  - [`/quality-gate`](https://github.com/mifunedev/openharness/blob/agent/uat-tester/workspace/.claude/skills/quality-gate/SKILL.md), [`/strategy-review`](https://github.com/mifunedev/openharness/blob/agent/uat-tester/workspace/.claude/skills/strategy-review/SKILL.md)
- **Specialist sub-agents** (spawned in parallel, under [`workspace/.claude/agents/`](https://github.com/mifunedev/openharness/blob/agent/uat-tester/workspace/.claude/agents/))
  - [`a11y-auditor.md`](https://github.com/mifunedev/openharness/blob/agent/uat-tester/workspace/.claude/agents/a11y-auditor.md) — WCAG compliance sweep
  - [`responsive-tester.md`](https://github.com/mifunedev/openharness/blob/agent/uat-tester/workspace/.claude/agents/responsive-tester.md) — 3-viewport coverage
  - [`flow-walker.md`](https://github.com/mifunedev/openharness/blob/agent/uat-tester/workspace/.claude/agents/flow-walker.md) — happy-path and edge-case user flows
  - [`visual-diff.md`](https://github.com/mifunedev/openharness/blob/agent/uat-tester/workspace/.claude/agents/visual-diff.md) — regression detection for rechecked items
- **Rules** (auto-loaded from [`workspace/.claude/rules/`](https://github.com/mifunedev/openharness/blob/agent/uat-tester/workspace/.claude/rules/))
  - `uat-testing.md` — core protocol: evidence required, dedup, top-20 cap, user story format, no app code
  - `agent-browser.md` — browser hygiene: session isolation, wait-before-capture, naming conventions
  - `findings-management.md` — JSON source of truth, severity criteria, dedup logic, archive protocol
  - `multi-project.md` — project isolation: scoped to slug, registration required
- **Heartbeat**
  - [`heartbeats/uat-report.md`](https://github.com/mifunedev/openharness/blob/agent/uat-tester/workspace/heartbeats/uat-report.md) — every 4 hours, 9 AM–9 PM: status report across registered projects
- **Project registry** — [`uat/projects.json`](https://github.com/mifunedev/openharness/blob/agent/uat-tester/workspace/uat/projects.json) — register each app under test with a slug, URL, and login instructions
- **Slack integration** — [`workspace/.claude/hooks/notify_slack.sh`](https://github.com/mifunedev/openharness/blob/agent/uat-tester/workspace/.claude/hooks/notify_slack.sh); `.slack/skills` for shared skill access

## How to use it

Register the target application in `uat/projects.json` with a slug, URL, and login instructions. Then ask the agent to run `/visual-uat <slug>` — it spawns the four specialist sub-agents in parallel (a11y auditor, responsive tester, flow walker, visual diff), collects their findings, deduplicates them, and produces a top-20 impact-ranked list as user stories in both JSON and Markdown. When developers report fixes, run `/recheck <slug> [IDs]` and the agent re-plays the original reproduction steps, returning `PASS`, `FAIL`, or `CHANGED` for each item. The `uat-report` heartbeat fires every 4 hours during active hours (9 AM–9 PM) to surface any status changes without manual prompting.

## Customization tips

Each project is registered independently in `uat/projects.json` — add as many projects as needed, each with its own slug and findings directory. The active window for the heartbeat (currently 9–21) and frequency (every 4 hours) are set in [`heartbeats.conf`](https://github.com/mifunedev/openharness/blob/agent/uat-tester/workspace/heartbeats.conf). Severity thresholds and the top-20 cap are governed by `workspace/.claude/rules/findings-management.md`. See `workspace/AGENTS.md` on the branch for the full environment and tool reference, including the `INSTALL_BROWSER=true` requirement for the sandbox build.

## Best practices observed

- Four specialist sub-agents (a11y auditor, responsive tester, flow walker, visual diff) spawn in parallel during a `/visual-uat` run, giving simultaneous coverage across accessibility, responsiveness, flows, and regression without sequential bottlenecks.
- A hard top-20 cap per project with an archive-and-promote mechanism keeps the findings list actionable — overflow is preserved in `findings-archive.json` and promoted back when higher-priority items are resolved.
- The self-improving autoresearch loop (Karpathy pattern) runs after every skill execution: hypothesize a change, apply it, measure on the next run, keep or revert — skills and rules tighten automatically based on real finding data rather than speculation.
