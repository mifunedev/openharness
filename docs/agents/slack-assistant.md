---
id: slack-assistant
title: "Slack Assistant"
sidebar_position: 9
---

# Slack Assistant

Slack Assistant is a general-purpose AI assistant that runs inside the Open Harness sandbox and makes itself reachable to team members via Slack through the Mom bot integration. Its identity is deliberately broad: "You are a general-purpose AI assistant running inside an isolated Docker container. Team members reach you via Slack through the Mom bot integration." The agent is direct and concise in Slack replies, keeps threads for longer discussions, and maintains long-term memory across sessions via `MEMORY.md` and daily log files. Two heartbeats keep it autonomously active: a weekday end-of-day summary and a Sunday memory distillation.

## Branch

[github.com/ryaneggz/open-harness@agent/slack-assistant](https://github.com/ryaneggz/open-harness/tree/agent/slack-assistant)

## Spin up

```bash
# Clone the harness and check out this agent's branch in a worktree:
git clone https://github.com/ryaneggz/open-harness.git ~/.openharness
cd ~/.openharness
mkdir -p .worktrees/agent
git worktree add .worktrees/agent/slack-assistant origin/agent/slack-assistant
cd .worktrees/agent/slack-assistant
make sandbox
make shell
```

First files to read inside the sandbox:
- [`AGENTS.md`](https://github.com/ryaneggz/open-harness/blob/agent/slack-assistant/AGENTS.md)
- [`workspace/AGENTS.md`](https://github.com/ryaneggz/open-harness/blob/agent/slack-assistant/workspace/AGENTS.md)

## Workspace contents

- **Skills**
  - [`/quality-gate`](https://github.com/ryaneggz/open-harness/blob/agent/slack-assistant/workspace/.claude/skills/quality-gate/SKILL.md) — validate decisions against defined thresholds before execution
  - [`/strategy-review`](https://github.com/ryaneggz/open-harness/blob/agent/slack-assistant/workspace/.claude/skills/strategy-review/SKILL.md) — measure decision quality over rolling periods
- **Heartbeats** (defined in [`heartbeats.conf`](https://github.com/ryaneggz/open-harness/blob/agent/slack-assistant/workspace/heartbeats.conf))
  - [`daily-summary.md`](https://github.com/ryaneggz/open-harness/blob/agent/slack-assistant/workspace/heartbeats/default.md) — weekdays at 6 PM Mountain Time: end-of-day activity summary
  - `memory-distill.md` — Sundays at 8 PM Mountain Time: distill daily logs into MEMORY.md
- **Pi banner** — [`workspace/.pi/banner.json`](https://github.com/ryaneggz/open-harness/blob/agent/slack-assistant/workspace/.pi/banner.json) and [`workspace/.pi/extensions/custom-banner.ts`](https://github.com/ryaneggz/open-harness/blob/agent/slack-assistant/workspace/.pi/extensions/custom-banner.ts)
- **Sub-agents** — agent-builder, command-builder, skill-builder under [`workspace/.claude/agents/`](https://github.com/ryaneggz/open-harness/blob/agent/slack-assistant/workspace/.claude/agents/)
- **Mom Slack bot** — [`workspace/AGENTS.md`](https://github.com/ryaneggz/open-harness/blob/agent/slack-assistant/workspace/AGENTS.md) documents auto-start behavior and manual control (`make mom-start`, `make mom-stop`, `make mom-status`); data directory is `~/workspace/mom-data/`

## How to use it

After provisioning the sandbox, set `MOM_SLACK_APP_TOKEN` and `MOM_SLACK_BOT_TOKEN` in the container environment — the Mom Slack bot starts automatically on container boot when both tokens are present. Team members can then @-mention or DM the bot in Slack to interact with the agent. The agent reads `MEMORY.md` at every session start and appends to the daily log (`memory/YYYY-MM-DD.md`) throughout its work. For interactive Claude Code sessions, start `claude` inside the sandbox; for Slack-only use, Mom runs independently and the agent responds via the bot.

## Customization tips

Slack connectivity requires `MOM_SLACK_APP_TOKEN` and `SLACK_BOT_TOKEN` set in the sandbox environment. The heartbeat schedule (timezone, days, times) is in [`heartbeats.conf`](https://github.com/ryaneggz/open-harness/blob/agent/slack-assistant/workspace/heartbeats.conf) — edit cron expressions and run `make heartbeat` to re-sync. The Pi banner and custom extension can be swapped by editing [`workspace/.pi/banner.json`](https://github.com/ryaneggz/open-harness/blob/agent/slack-assistant/workspace/.pi/banner.json). See `workspace/AGENTS.md` on the branch for the full env-var list and Mom bot configuration.

## Best practices observed

- Mom bot auto-starts on container boot when both Slack tokens are present, so the agent is available in Slack without a manual launch step after provisioning.
- Two-heartbeat schedule (daily weekday summary + Sunday memory distillation) keeps the agent's memory current without over-running API calls on weekends.
- Custom Pi banner extension ships on the branch, demonstrating how to extend the Pi agent UI for a specific agent identity without modifying core harness files.
