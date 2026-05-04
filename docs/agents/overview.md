---
sidebar_position: 1
title: "Agents Overview"
---

# Agents Overview

Open Harness ships with five agent CLIs preinstalled in the sandbox image: **Claude Code** (default), **Codex**, **OpenCode**, **Pi**, and **DeepAgents**. Inside the sandbox, launch whichever you prefer — switch between them at any time, or keep long-running sessions in tmux.

The sandbox is the product; the harness is your call. To go beyond the preinstalled options, install via `npm` / `pip` / `cargo` inside the sandbox, edit the Dockerfile, or layer in a [harness pack](../guide/bring-your-own-harness.md) like [`@ryaneggz/mifune`](https://github.com/ryaneggz/mifune) (Pi+Mom Slack bot). The product surface is one developer, one project, one harness — not racing or stacking multiple CLIs against each other.

## Supported agents

| Agent | Role | Start command | Source |
|---|---|---|---|
| [Claude Code](./claude-code.md) | Anthropic's terminal coding agent (default) | `claude` | preinstalled |
| [Codex](./codex.md) | OpenAI's CLI coding agent | `codex` | preinstalled |
| [OpenCode](./opencode.md) | Terminal coding agent with OpenAI OAuth support | `opencode` | preinstalled |
| [Pi](./pi.md) | Lightweight, customizable harness | `pi` | preinstalled |
| [DeepAgents](./deepagents.md) | LangChain's multi-provider terminal agent | `deepagents` | preinstalled |

## Verifying installation

```bash
claude --version
codex --version
opencode --version
pi --version
deepagents -v
```

## Running an agent in tmux

Use named tmux sessions so each agent's output stays isolated and survives disconnects:

```bash
tmux new-session -d -s agent-claude     'claude'
tmux new-session -d -s agent-codex      'codex --dangerously-bypass-approvals-and-sandbox'
tmux new-session -d -s agent-opencode   'opencode'
tmux new-session -d -s agent-pi         'pi'
tmux new-session -d -s agent-deepagents 'deepagents'
```

Attach to any session at any time:

```bash
tmux attach -t agent-claude
```

See the individual agent pages for auth setup and usage examples.
