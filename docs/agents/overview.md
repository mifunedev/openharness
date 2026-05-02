---
sidebar_position: 1
title: "Agents Overview"
---

# Agents Overview

Open Harness ships with Claude Code preinstalled in the sandbox image as the default agent. Additional agents (Codex, Gemini CLI, Pi Agent + Mom Slack bot) are available via [harness packs](../guide/bring-your-own-harness.md) like [`@ryaneggz/mifune`](https://github.com/ryaneggz/mifune). Packs add their agents to the same sandbox, each in its own git worktree, with its own identity and its own cron schedule.

## Why run multiple agents at once?

Different agents have different strengths. Running them in parallel lets you route tasks by capability — long-horizon planning in one agent, rapid iteration in another, Slack-driven automation in a third — without spinning up separate machines or fighting over a shared working tree.

Open Harness makes this practical by giving each agent:

- **Its own worktree** — separate branch, no merge conflicts mid-task.
- **Its own SOUL** — a `SOUL.md` persona file that shapes the agent's tone and priorities.
- **Its own schedule** — heartbeat files in `workspace/heartbeats/` drive cron-based autonomous runs independent of what other agents are doing.

## Supported agents

| Agent | Role | Start command | Source |
|---|---|---|---|
| [Claude Code](./claude-code.md) | General-purpose terminal coding agent | `claude` | preinstalled |
| [Codex](./codex.md) | Fully autonomous code generation and editing | `codex` | preinstalled |
| [Gemini CLI](./gemini.md) | Google Gemini-powered CLI agent | `gemini` | opt-in install |
| Pi Agent | Automations, Slack, heartbeats, and extensions | `pi` | [`@ryaneggz/mifune`](https://github.com/ryaneggz/mifune) harness pack |

## Installation

Claude Code and Codex are installed in the base sandbox image and available system-wide after provisioning:

```bash
claude --version
codex --version
```

For Pi Agent + the Mom Slack bot, install the mifune harness pack:

```bash
oh harness add @ryaneggz/mifune
```

## Running agents in parallel

Use separate tmux sessions so each agent's output stays isolated and survives disconnects:

```bash
tmux new-session -d -s agent-claude 'claude'
tmux new-session -d -s agent-codex  'codex --full-auto'
```

Attach to any session at any time:

```bash
tmux attach -t agent-claude
```

See the individual agent pages for auth setup and usage examples.
