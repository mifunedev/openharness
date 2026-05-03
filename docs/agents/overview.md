---
sidebar_position: 1
title: "Agents Overview"
---

# Agents Overview

Open Harness ships with three agent CLIs preinstalled in the sandbox image: **Claude Code**, **Codex**, and **Pi**. Inside the sandbox, launch whichever you prefer — switch between them at any time, or stack them in tmux sessions for parallel work.

The sandbox is the product; the harness is your call. To go beyond the three preinstalled options, install via `npm` / `pip` / `cargo` inside the sandbox, edit the Dockerfile, or layer in a [harness pack](../guide/bring-your-own-harness.md) like [`@ryaneggz/mifune`](https://github.com/ryaneggz/mifune) (Pi+Mom Slack bot).

## Supported agents

| Agent | Role | Start command | Source |
|---|---|---|---|
| [Claude Code](./claude-code.md) | Anthropic's terminal coding agent | `claude` | preinstalled |
| [Codex](./codex.md) | OpenAI's CLI coding agent | `codex` | preinstalled |
| [Pi](./pi.md) | Lightweight, customizable harness | `pi` | preinstalled |

## Verifying installation

```bash
claude --version
codex --version
pi --version
```

## Running multiple agents in tmux

Use separate tmux sessions so each agent's output stays isolated and survives disconnects:

```bash
tmux new-session -d -s agent-claude 'claude'
tmux new-session -d -s agent-codex  'codex --full-auto'
tmux new-session -d -s agent-pi     'pi'
```

Attach to any session at any time:

```bash
tmux attach -t agent-claude
```

See the individual agent pages for auth setup and usage examples.
