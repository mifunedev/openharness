---
id: overview
title: "Agents Overview"
sidebar_position: 1
---

# Agents Overview

Open Harness ships a set of pre-built agent identities on public `agent/*` branches. Each branch contains a fully-scaffolded `workspace/` — identity files (`SOUL.md`, `AGENTS.md`), skills, heartbeats, and memory — that gives a harness a specific purpose. Check out the branch, run `make sandbox`, and the agent is live.

## Agents vs. Harnesses

| | Harnesses | Agents |
|---|---|---|
| **What** | The CLI engine you run (`claude`, `codex`, `pi`, …) | A configured workspace that gives an engine purpose |
| **Where** | Preinstalled in the sandbox image | `agent/*` branches; `workspace/` bind-mounted at runtime |
| **Analogy** | The interpreter | The program |

An agent identity is engine-agnostic: the same `workspace/` can drive Claude Code, Codex, or Pi — whichever harness is authenticated. See [Harnesses](../harnesses/overview.md) for the engine-level docs.

## Adopting an agent

**Option A — worktree (keeps your main checkout intact):**

```bash
git fetch origin
git worktree add .worktrees/agent/<name> agent/<name>
cd .worktrees/agent/<name>
make sandbox
```

**Option B — fresh clone:**

```bash
git clone https://github.com/ryaneggz/open-harness.git
cd open-harness
git checkout agent/<name>
make sandbox
```

Both paths land you at the standard `make sandbox` flow described in [Installation](/docs/installation).

## Available agents

| Agent | Description | Branch |
|---|---|---|
| [Blog Writer](./blog-writer) | Writes technical blog posts for ruska.ai in Ryan Eggleston's voice — developer-bookmark quality, SMB-forward | [agent/blog-writer](https://github.com/ryaneggz/open-harness/tree/agent/blog-writer) |
| [DC Designer](./dc-designer) | Provisions and maintains a sandbox for an AI-driven 50MW–200MW hyperscale datacenter facility design | [agent/dc-designer](https://github.com/ryaneggz/open-harness/tree/agent/dc-designer) |
| [LinkedIn Ghostwriter](./linkedin-ghostwriter) | General-purpose coding agent scaffolded for LinkedIn content drafting workflows | [agent/linkedin-ghostwriter](https://github.com/ryaneggz/open-harness/tree/agent/linkedin-ghostwriter) |
| [Portfolio Advisor](./portfolio-advisor) | Designs concrete portfolio transition plans from current holdings to a target allocation using yfinance data | [agent/portfolio-advisor](https://github.com/ryaneggz/open-harness/tree/agent/portfolio-advisor) |
| [Portfolio Manager](./portfolio-mgr) | Runs a mock $100K portfolio informed by Bridgewater's 13F filing and Ray Dalio's All Weather strategy | [agent/portfolio-mgr](https://github.com/ryaneggz/open-harness/tree/agent/portfolio-mgr) |
| [SDR — Pallet](./sdr-pallet) | Consultative outbound sales agent targeting shipping-pallet buyers in North Carolina | [agent/sdr-pallet](https://github.com/ryaneggz/open-harness/tree/agent/sdr-pallet) |
| [Slack Assistant](./slack-assistant) | General-purpose team assistant reachable via Slack through the Mom bot integration | [agent/slack-assistant](https://github.com/ryaneggz/open-harness/tree/agent/slack-assistant) |
| [UAT Tester](./uat-tester) | Visual acceptance testing agent — methodical, screenshot-driven, ranked by user impact | [agent/uat-tester](https://github.com/ryaneggz/open-harness/tree/agent/uat-tester) |

Each page documents the agent's purpose, workspace layout, and any setup steps beyond `make sandbox`.
