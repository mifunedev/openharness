---
sidebar_position: 1
title: "Harnesses Overview"
---

# Harnesses Overview

Open Harness ships with five agent CLIs preinstalled in the sandbox image: **Claude Code** (default), **Codex**, **OpenCode**, **Pi**, and **DeepAgents**. A sixth harness, **T3 Code**, runs on demand via `npx t3` as a browser UI on port 3773. Inside the sandbox, launch whichever you prefer — switch between them at any time, or keep long-running sessions in tmux.

The sandbox is the product; the harness is your call. To go beyond the preinstalled options, install via `npm` / `pip` / `cargo` inside the sandbox, edit the Dockerfile, or layer in a harness pack such as [`@ryaneggz/mifune`](https://github.com/ryaneggz/mifune). For Pi+Slack specifically, the recommended path is the in-tree extension at [`.pi/extensions/slack/`](../integrations/slack.md). The product surface is one developer, one project, one harness — not racing or stacking multiple CLIs against each other.

## Supported agents

| Agent | Role | Start command | Source |
|---|---|---|---|
| [Claude Code](./claude-code.md) | Anthropic's terminal coding agent (default) | `claude` | preinstalled |
| [Codex](./codex.md) | OpenAI's CLI coding agent | `codex` | preinstalled |
| [OpenCode](./opencode.md) | Terminal coding agent with OpenAI OAuth support | `opencode` | preinstalled |
| [Pi](./pi.md) | Lightweight, customizable harness | `pi` | preinstalled |
| [DeepAgents](./deepagents.md) | LangChain's multi-provider terminal agent | `deepagents` | preinstalled |
| [T3 Code](./t3code.md) | Browser UI over Claude/Codex/OpenCode (port 3773) | `npx t3` | on-demand |

## Verifying installation

```bash
claude --version
codex --version
opencode --version
pi --version
deepagents -v
npx t3 --version    # T3 Code (not preinstalled — fetched on demand)
```

## Authentication

Open Harness ships Claude Code, Codex, OpenCode, Pi, and DeepAgents preinstalled. Authenticate at least one harness before use:

- **Claude Code**: run `claude` and follow the OAuth prompt (see [Claude Code](./claude-code.md)).
- **Codex**: run `codex login` (see [Codex](./codex.md)).
- **OpenCode**: run `opencode auth login` (see [OpenCode](./opencode.md)).
- **Pi**: configure provider keys via environment variables (see [Pi](./pi.md)).
- **DeepAgents**: write provider keys to `~/.deepagents/.env` (see [DeepAgents](./deepagents.md)).
- **T3 Code**: authenticate one of Claude / Codex / OpenCode first, then `npx t3` and open the printed pairing URL (see [T3 Code](./t3code.md)).

## Running an agent in tmux

Use named tmux sessions so each agent's output stays isolated and survives disconnects:

```bash
tmux new-session -d -s agent-claude     'claude'
tmux new-session -d -s agent-codex      'codex --dangerously-bypass-approvals-and-sandbox'
tmux new-session -d -s agent-opencode   'opencode'
tmux new-session -d -s agent-pi         'pi'
tmux new-session -d -s agent-deepagents 'deepagents'
tmux new-session -d -s agent-t3code     'npx t3 2>&1 | tee /tmp/agent-t3code.log'
```

Attach to any session at any time:

```bash
tmux attach -t agent-claude
```

See the individual agent pages for auth setup and usage examples.

[Connecting to the Sandbox](/docs/connecting)
