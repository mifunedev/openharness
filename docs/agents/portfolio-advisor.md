---
id: portfolio-advisor
title: "Portfolio Advisor"
sidebar_position: 6
---

# Portfolio Advisor

The Portfolio Advisor is a data-driven investment transition agent that maps a user's current holdings (Point A) to a target allocation (Point B) and designs a concrete transition plan — what to trade, when, in what sequence, and why. It tracks positions across multiple brokerage platforms via `portfolio/accounts.json`, enforces tax-loss harvesting discipline with wash-sale-calendar tracking, runs daily market checks (price fetch, drift report, sentiment score, Slack notification), weekly rebalance reviews, and monthly retrospectives. As its `SOUL.md` states: "You think in terms of transition paths — tax efficiency, lot selection, rebalance sequencing, and opportunity cost." All output is framed as educational analysis, not personalized financial advice.

## Branch

[github.com/ryaneggz/open-harness@agent/portfolio-advisor](https://github.com/ryaneggz/open-harness/tree/agent/portfolio-advisor)

## Spin up

```bash
# Clone the harness and check out this agent's branch in a worktree:
git clone https://github.com/ryaneggz/open-harness.git ~/.openharness
cd ~/.openharness
mkdir -p .worktrees/agent
git worktree add .worktrees/agent/portfolio-advisor origin/agent/portfolio-advisor
cd .worktrees/agent/portfolio-advisor
make sandbox
make shell
```

First files to read inside the sandbox:
- [`AGENTS.md`](https://github.com/ryaneggz/open-harness/blob/agent/portfolio-advisor/AGENTS.md)
- [`workspace/AGENTS.md`](https://github.com/ryaneggz/open-harness/blob/agent/portfolio-advisor/workspace/AGENTS.md)

## Workspace contents

**Skills:**
- [`workspace/.claude/skills/fetch-prices/SKILL.md`](https://github.com/ryaneggz/open-harness/blob/agent/portfolio-advisor/workspace/.claude/skills/fetch-prices/SKILL.md) — batch yfinance price fetch; run first before any other skill
- [`workspace/.claude/skills/drift-report/SKILL.md`](https://github.com/ryaneggz/open-harness/blob/agent/portfolio-advisor/workspace/.claude/skills/drift-report/SKILL.md) — Point A vs Point B gap analysis with ranked gaps and next action
- [`workspace/.claude/skills/allocation-check/SKILL.md`](https://github.com/ryaneggz/open-harness/blob/agent/portfolio-advisor/workspace/.claude/skills/allocation-check/SKILL.md) — 6-gate portfolio validation (includes Titan managed lot handling)
- [`workspace/.claude/skills/tax-loss-harvest/SKILL.md`](https://github.com/ryaneggz/open-harness/blob/agent/portfolio-advisor/workspace/.claude/skills/tax-loss-harvest/SKILL.md) — taxable account loss scan with wash-sale-aware replacement suggestions
- [`workspace/.claude/skills/sentiment-score/SKILL.md`](https://github.com/ryaneggz/open-harness/blob/agent/portfolio-advisor/workspace/.claude/skills/sentiment-score/SKILL.md) — macro sentiment aggregation across 7 categories via WebSearch
- [`workspace/.claude/skills/risk-metrics/SKILL.md`](https://github.com/ryaneggz/open-harness/blob/agent/portfolio-advisor/workspace/.claude/skills/risk-metrics/SKILL.md) — Sharpe, Sortino, Max DD, Beta, Vol, Calmar (deferred until sufficient history)
- [`workspace/.claude/skills/strategy-review/SKILL.md`](https://github.com/ryaneggz/open-harness/blob/agent/portfolio-advisor/workspace/.claude/skills/strategy-review/SKILL.md) — decision quality measurement and benchmark comparison
- [`workspace/.claude/skills/notify/SKILL.md`](https://github.com/ryaneggz/open-harness/blob/agent/portfolio-advisor/workspace/.claude/skills/notify/SKILL.md) — Slack notification via `notify/post.sh`
- [`workspace/.claude/skills/allocation-check/SKILL.md`](https://github.com/ryaneggz/open-harness/blob/agent/portfolio-advisor/workspace/.claude/skills/allocation-check/SKILL.md) — portfolio gate validation

**Heartbeats:**
- [`workspace/heartbeats/market-check.md`](https://github.com/ryaneggz/open-harness/blob/agent/portfolio-advisor/workspace/heartbeats/market-check.md) — daily market check, weekdays 4:30pm ET (after close)
- [`workspace/heartbeats/rebalance-review.md`](https://github.com/ryaneggz/open-harness/blob/agent/portfolio-advisor/workspace/heartbeats/rebalance-review.md) — weekly rebalance review, Fridays 5pm MT
- [`workspace/heartbeats/monthly-retro.md`](https://github.com/ryaneggz/open-harness/blob/agent/portfolio-advisor/workspace/heartbeats/monthly-retro.md) — monthly retrospective, 1st of each month 10am MT
- [`workspace/heartbeats/memory-distill.md`](https://github.com/ryaneggz/open-harness/blob/agent/portfolio-advisor/workspace/heartbeats/memory-distill.md) — weekly memory distillation, Sundays 8pm MT

**Portfolio data:**
- [`workspace/portfolio/accounts.json`](https://github.com/ryaneggz/open-harness/blob/agent/portfolio-advisor/workspace/portfolio/accounts.json) — multi-platform source of truth (per-account, per-lot)
- [`workspace/portfolio/target.json`](https://github.com/ryaneggz/open-harness/blob/agent/portfolio-advisor/workspace/portfolio/target.json) — target allocation (Point B) with TLH constraints
- [`workspace/portfolio/transition-tracker.md`](https://github.com/ryaneggz/open-harness/blob/agent/portfolio-advisor/workspace/portfolio/transition-tracker.md) — actionable task backlog; every heartbeat checks this first

**Sub-agents:**
- [`workspace/.claude/agents/implementer.md`](https://github.com/ryaneggz/open-harness/blob/agent/portfolio-advisor/workspace/.claude/agents/implementer.md), [`critic.md`](https://github.com/ryaneggz/open-harness/blob/agent/portfolio-advisor/workspace/.claude/agents/critic.md), [`pm.md`](https://github.com/ryaneggz/open-harness/blob/agent/portfolio-advisor/workspace/.claude/agents/pm.md), [`council.md`](https://github.com/ryaneggz/open-harness/blob/agent/portfolio-advisor/workspace/.claude/agents/council.md) — parallel council pattern for strategic or irreversible decisions

## How to use it

Start the sandbox and enter with `make shell`, then run `claude` inside `workspace/`. Load raw brokerage exports (CSV, JSON) into `workspace/sources/<platform>/` and ask the agent to structure them into `portfolio/accounts.json`. The daily heartbeat (weekdays after market close) runs `/fetch-prices` → `/drift-report` → TLH quick scan → `/sentiment-score` → Slack notification automatically. Use the weekly rebalance heartbeat output to review recommended trades; the agent flags opportunities but does not execute trades. For significant strategic decisions (new framework rules, allocation paradigm shifts), the agent spawns an Implementer/Critic/PM council in parallel, synthesizes findings, and documents the outcome in `transition-tracker.md`'s decision log.

## Customization tips

The Slack notification hook requires `SLACK_WEBHOOK_URL` (or equivalent) configured in the sandbox environment — see `workspace/.claude/skills/notify/post.sh` on the branch. Target allocation is defined in `portfolio/target.json`; edit Point B tickers and weights there. The BTC-correlated exposure cap (20%) and wash-sale minimum loss threshold ($200) are documented in `workspace/AGENTS.md` — override them there with a documented exception following the framework in the operating procedures. Forecast gates for high-stakes trades are tracked in `portfolio/forecasts.json`.

## Best practices observed

- Quality gates (`/allocation-check`, `/tax-loss-harvest`) run before any trade recommendation; `/tax-loss-harvest` runs before rebalancing because harvests may correct drift naturally and avoid unnecessary sells.
- Strategic and irreversible decisions route through a three-agent parallel council (Implementer + Critic + PM), with synthesis and outcome logged to `transition-tracker.md` — proven to catch math errors and strategic gaps that single-agent review misses.
- Market-check heartbeat scheduled via `heartbeats/market-check.md` at weekday 4:30pm ET (after close), with a Slack daily summary so portfolio state is visible without requiring an interactive session.
