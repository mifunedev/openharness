---
sidebar_position: 1
title: "Harnesses Overview"
---

# Harnesses Overview

Open Harness ships with three agent CLIs in the default sandbox image: **Claude Code** (default), **Codex**, and **Pi**. **OpenCode**, **DeepAgents**, **Hermes**, and **Grok Build** are optional image-level installs controlled by `harness.yaml` `install:` keys (or `.devcontainer/.env` build flags). **T3 Code** runs on demand via the `/t3` skill (or directly with `npx t3`) as a browser UI on port 3773. Inside the sandbox, launch whichever you prefer — switch between them at any time, or keep long-running sessions in tmux.

Open Harness is the harness; the **agent** is your call. To go beyond the preinstalled options, install via `npm` / `pip` / `cargo` inside the sandbox, edit the Dockerfile, or layer in a harness pack such as [`@ryaneggz/mifune`](https://github.com/ryaneggz/mifune). For Pi+Slack specifically, the recommended path is the `pi-messenger-bridge` npm package (pinned in `.pi/settings.json`; see [Slack integration](../integrations/slack.md)). The product surface is one developer, one project, one agent — not racing or stacking multiple CLIs against each other.

## Supported agents

| Agent | Role | Start command | Source |
|---|---|---|---|
| [Claude Code](./claude-code.md) | Anthropic's terminal coding agent (default) | `claude` | preinstalled |
| [Codex](./codex.md) | OpenAI's CLI coding agent | `codex` | preinstalled |
| [OpenCode](./opencode.md) | Terminal coding agent with OpenAI OAuth support | `opencode` | optional: `install.opencode: true` in `harness.yaml` |
| [Pi](./pi.md) | Lightweight, customizable agent | `pi` | default |
| [DeepAgents](./deepagents.md) | LangChain's multi-provider terminal agent | `deepagents` | optional: `install.deepagents: true` in `harness.yaml` |
| [Hermes](./hermes.md) | Nous Research's self-improving terminal agent | `hermes` | optional: `install.hermes: true` in `harness.yaml` |
| [Grok Build](./grok-build.md) | xAI's proprietary Grok Build terminal agent | `grok` | optional: `install.grok_build: true` in `harness.yaml` |
| [T3 Code](./t3code.md) | Browser UI over Claude/Codex/OpenCode (port 3773) | `/t3` or `npx t3` | on-demand |

## Verifying installation

```bash
claude --version
codex --version
pi --version

# Optional image-level CLIs, present only when enabled in harness.yaml (or .devcontainer/.env):
opencode --version      # install.opencode: true
deepagents -v           # install.deepagents: true
hermes --version        # install.hermes: true
grok --version          # install.grok_build: true

npx t3 --version        # T3 Code (not preinstalled — fetched on demand)
```

## Authentication

Open Harness ships Claude Code, Codex, and Pi in the default image. Authenticate at least one default harness before use; authenticate optional harnesses after enabling their install flags:

- **Claude Code**: run `claude` and follow the OAuth prompt (see [Claude Code](./claude-code.md)).
- **Codex**: run `codex login` (see [Codex](./codex.md)).
- **OpenCode**: run `opencode auth login` (see [OpenCode](./opencode.md)).
- **Pi**: configure provider keys via environment variables (see [Pi](./pi.md)).
- **DeepAgents**: write provider keys to `~/.deepagents/.env` (see [DeepAgents](./deepagents.md)).
- **Hermes**: run `hermes setup` (see [Hermes](./hermes.md)).
- **Grok Build**: run `grok login --device-auth` for headless/remote auth, `grok login` for interactive OAuth, or set `XAI_API_KEY` as a fallback (see [Grok Build](./grok-build.md)). Cached `~/.grok/auth.json` takes precedence over `XAI_API_KEY`.
- **T3 Code**: authenticate one of Claude / Codex / OpenCode first, then run `/t3` (or `npx t3`) and open the printed pairing URL (see [T3 Code](./t3code.md)).

## Default surfaces

Three surfaces cover most day-to-day use:

- **Pi+Slack** — chat with the agent from Slack instead of the terminal.
- **T3 Code** — browser UI on port `3773` driving Claude / Codex / OpenCode.
- **Docs app** — the Docusaurus site you're reading now, on port `3000`.

Each runs in its own named tmux session per [`context/rules/sandbox-processes.md`](https://github.com/mifunedev/openharness/blob/development/context/rules/sandbox-processes.md). For the two browser surfaces, open them in **VS Code's Simple Browser** (`Ctrl+Shift+P` → `Simple Browser: Show`; `Cmd+Shift+P` on macOS) so the live UI sits in a tab next to the code you're editing.

### Pi+Slack

The Pi agent with the Slack bridge loaded. Configuration is native — edit `.devcontainer/.env` + `.pi/msg-bridge.json` (see [Slack integration](../integrations/slack.md)). The `client-slack-pi` session is started automatically on container boot (or manually with `gateway pi`):

```bash
gateway status                   # show client-slack-pi + client-slack-hermes
tmux attach -t client-slack-pi   # watch the live log
```

Talk to the agent from Slack (DM or `@mention`). Full setup: [Slack integration](../integrations/slack.md).

### T3 Code

Web UI on `http://localhost:3773` over an already-authenticated provider. Prefer the agent skill:

```text
/t3 start
/t3 url
```

Manual terminal fallback:

```bash
tmux new-session -d -s harness-t3code 'npx t3 2>&1 | tee /tmp/harness-t3code.log'
tmux capture-pane -t harness-t3code -p | grep -i pairingUrl
```

Open the printed pairing URL (`http://localhost:3773/pair#token=…`) in the Simple Browser tab. Full setup: [T3 Code](./t3code.md).

### Docs app

The site you're reading now, served locally:

```bash
tmux new-session -d -s app-docs 'pnpm --filter @openharness/docs dev 2>&1 | tee /tmp/app-docs.log'
```

Open `http://localhost:3000` in the Simple Browser tab for hot-reload feedback on doc edits without leaving the editor.

### Reattach to any session

```bash
tmux ls                          # list sessions
tmux attach -t <session-name>    # reattach (Ctrl-b d to detach)
```

[Connecting to the Sandbox](/docs/connecting)
