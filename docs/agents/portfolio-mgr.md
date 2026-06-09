---
id: portfolio-mgr
title: "Portfolio Manager"
sidebar_position: 7
---

# Portfolio Manager

Portfolio Manager is a quantitative portfolio-management agent that tracks and rebalances a mock $100K portfolio modeled on Ray Dalio's All Weather strategy and Bridgewater Associates' latest 13F filing. It pulls live prices via yfinance, scores market sentiment with WebSearch, computes risk metrics (Sharpe, Sortino, max drawdown, beta, volatility), and flags allocation drift before it exceeds the 5% rebalancing threshold. As the agent's own SOUL.md states: "You are data-driven: cite numbers, percentages, and Sharpe ratios, not vibes." This is an educational simulation — all trades are mock, and the agent never presents output as financial advice.

## Branch

[github.com/mifunedev/openharness@agent/portfolio-mgr](https://github.com/mifunedev/openharness/tree/agent/portfolio-mgr)

## Spin up

```bash
# Clone the harness and check out this agent's branch in a worktree:
git clone https://github.com/mifunedev/openharness.git ~/.openharness
cd ~/.openharness
mkdir -p .worktrees/agent
git worktree add .worktrees/agent/portfolio-mgr origin/agent/portfolio-mgr
cd .worktrees/agent/portfolio-mgr
make sandbox
make shell
```

First files to read inside the sandbox:
- [`AGENTS.md`](https://github.com/mifunedev/openharness/blob/agent/portfolio-mgr/AGENTS.md)
- [`workspace/AGENTS.md`](https://github.com/mifunedev/openharness/blob/agent/portfolio-mgr/workspace/AGENTS.md)

## Workspace contents

- **Skills**
  - [`/allocation-check`](https://github.com/mifunedev/openharness/blob/agent/portfolio-mgr/workspace/.claude/skills/allocation-check/SKILL.md) — validate current weights against target allocation before any rebalance
  - [`/risk-metrics`](https://github.com/mifunedev/openharness/blob/agent/portfolio-mgr/workspace/.claude/skills/risk-metrics/SKILL.md) — compute Sharpe, Sortino, max drawdown, beta, and volatility
  - [`/sentiment-score`](https://github.com/mifunedev/openharness/blob/agent/portfolio-mgr/workspace/.claude/skills/sentiment-score/SKILL.md) — WebSearch-driven macro sentiment composite
  - [`/strategy-review`](https://github.com/mifunedev/openharness/blob/agent/portfolio-mgr/workspace/.claude/skills/strategy-review/SKILL.md) — measure decision quality over rolling periods
- **Heartbeats** (defined in [`heartbeats.conf`](https://github.com/mifunedev/openharness/blob/agent/portfolio-mgr/workspace/heartbeats.conf))
  - [`market-check.md`](https://github.com/mifunedev/openharness/blob/agent/portfolio-mgr/workspace/heartbeats/market-check.md) — daily at 4:30 PM ET after market close: fetch prices, compute P&L, run risk-metrics and sentiment-score, flag drift > 3%
  - [`rebalance-review.md`](https://github.com/mifunedev/openharness/blob/agent/portfolio-mgr/workspace/heartbeats/rebalance-review.md) — Friday 5 PM MT: weekly rebalance decision
  - [`monthly-retro.md`](https://github.com/mifunedev/openharness/blob/agent/portfolio-mgr/workspace/heartbeats/monthly-retro.md) — 1st of each month: rolling performance retrospective
  - [`memory-distill.md`](https://github.com/mifunedev/openharness/blob/agent/portfolio-mgr/workspace/heartbeats/memory-distill.md) — Sunday 8 PM MT: distill daily logs into MEMORY.md
- **Portfolio data** — [`portfolio/state.json`](https://github.com/mifunedev/openharness/blob/agent/portfolio-mgr/workspace/portfolio/state.json) (current holdings), [`portfolio/ledger.json`](https://github.com/mifunedev/openharness/blob/agent/portfolio-mgr/workspace/portfolio/ledger.json) (strategy versions + forward performance), [`portfolio/scorecard.md`](https://github.com/mifunedev/openharness/blob/agent/portfolio-mgr/workspace/portfolio/scorecard.md) (rolling summary)
- **Pi banner** — [`workspace/.pi/banner.json`](https://github.com/mifunedev/openharness/blob/agent/portfolio-mgr/workspace/.pi/banner.json) with a custom extension at [`workspace/.pi/extensions/custom-banner.ts`](https://github.com/mifunedev/openharness/blob/agent/portfolio-mgr/workspace/.pi/extensions/custom-banner.ts)
- **Sub-agents** — agent-builder, command-builder, skill-builder under [`workspace/.claude/agents/`](https://github.com/mifunedev/openharness/blob/agent/portfolio-mgr/workspace/.claude/agents/)

## How to use it

Once the sandbox is running and Claude Code is started (`claude`), the agent enters an autonomous daily cycle driven by the `market-check` heartbeat. During interactive sessions you can ask the agent to run any skill directly — for example, ask it to run `/risk-metrics` or `/allocation-check` to get an on-demand snapshot. The portfolio state lives in `portfolio/state.json`; the agent reads it at every heartbeat and writes updates to the daily memory log. When allocation drift on any position exceeds 5%, the agent proposes a rebalance and runs the quality-gate chain (`/risk-metrics` then `/allocation-check`) before confirming the mock trade.

## Customization tips

The target tickers and allocation weights are stored in `MEMORY.md` and `portfolio/state.json` on the branch — update them to swap the underlying 13F or All Weather mix. The heartbeat schedule (market-close time, rebalance day) is in [`heartbeats.conf`](https://github.com/mifunedev/openharness/blob/agent/portfolio-mgr/workspace/heartbeats.conf); edit the cron expressions there and run `make heartbeat` to re-sync the daemon. See `workspace/AGENTS.md` on the branch for the full environment and tool reference.

## Best practices observed

- Dual-skill quality gate (`/risk-metrics` → `/allocation-check`) runs before every rebalance decision, preventing premature trades on noisy single-day moves.
- Market-check heartbeat scheduled via [`heartbeats/market-check.md`](https://github.com/mifunedev/openharness/blob/agent/portfolio-mgr/workspace/heartbeats/market-check.md) fires daily at 4:30 PM ET after market close, keeping the agent on a market-hours rhythm without manual triggers.
- `portfolio/ledger.json` tracks strategy versions alongside forward performance, enabling before/after comparison whenever the All Weather weights are changed.
