---
title: "Harnesses Overview"
---

# Harnesses Overview

Open Harness provisions three agent CLIs into `~/.local` on first boot: **Claude Code** (default), **Codex**, and **Pi**. **OpenCode**, **DeepAgents**, **Hermes**, and **Grok Build** are optional — install one with `oh harness install <id>`, which also sets its `install.*` key so a fresh home mount reinstalls it at boot. No harness is baked into the image. **T3 Code** runs on demand via the `/t3` skill (or directly with `npx t3`) as a browser UI on port 3773, and **Prime Agent** installs on demand with `oh harness install prime-agent` — neither has an `INSTALL_*` key, because neither is ever baked into the image. Inside the sandbox, run `herdr` first, then launch whichever agent you prefer from its panes and switch between them at any time. Reserve tmux for Open Harness's managed/headless cron, gateway, and watchdog infrastructure.

Open Harness is the harness; the **agent** is your call. To go beyond the preinstalled options, install via `npm` / `pip` / `cargo` inside the sandbox or edit the Dockerfile. For Pi+Slack specifically, the recommended path is the `pi-messenger-bridge` npm package — see [Slack integration](../integrations/slack.md). The product surface is one developer, one project, one agent — not racing or stacking multiple CLIs against each other.

## Installing a harness

`oh harness` is the only path, and it does both halves in one command: it sets
the `install.*` key in `oh.json` so a fresh home mount reinstalls the harness at
boot, **and** installs the CLI into the already-running container so it is usable
now. It never rebuilds or restarts the sandbox.

```bash
oh harness list                 # what exists, what is enabled, what is installed
oh harness list --defaults      # only the kind:"default" harnesses, and only their probes
oh harness install opencode     # persist the flag + install into the running sandbox
oh harness status hermes        # one harness
```

If the sandbox is not running, the command persists the flag, prints a hint, and
exits 0 — start the sandbox with `oh sandbox` and re-run it, or let the next
build pick the harness up.

`oh harness` works from inside the sandbox too. There it installs into the
environment you are already in, and `list`/`status` report the CLIs actually
present rather than `?`. See
[Lifecycle commands → Where you are standing when you type `oh`](../lifecycle-commands.md#where-you-are-standing-when-you-type-oh).

Flags:

| Flag | Effect |
|---|---|
| `--persist-only` | Only set the `.devcontainer/.env` flag; do no container work |
| `--no-persist` | Live-install only; leave `.devcontainer/.env` unchanged (ephemeral — a container recreate loses it) |
| `--defaults` | `list` only: restrict the listing, and the verify probes it runs, to `kind:"default"` harnesses |

The manual path still works: uncomment the key in `.devcontainer/.env` (or export the
`INSTALL_*` build flag in `.devcontainer/.env`) and run
`oh destroy && oh sandbox`.

## Supported agents

| Agent | Role | Start command | Source |
|---|---|---|---|
| [Claude Code](./claude-code.md) | Anthropic's terminal coding agent (default) | `claude` | preinstalled |
| [Codex](./codex.md) | OpenAI's CLI coding agent | `codex` | preinstalled |
| [OpenCode](./opencode.md) | Terminal coding agent with OpenAI OAuth support | `opencode` | optional: `oh harness install opencode` |
| [Pi](./pi.md) | Lightweight, customizable agent | `pi` | default |
| [DeepAgents](./deepagents.md) | LangChain's multi-provider terminal agent | `deepagents` | optional: `oh harness install deepagents` |
| [Hermes](./hermes.md) | Nous Research's self-improving terminal agent | `hermes` | optional: `oh harness install hermes` |
| [Grok Build](./grok-build.md) | xAI's proprietary Grok Build terminal agent | `grok` | optional: `oh harness install grok-build` |
| [T3 Code](./t3code.md) | Browser UI over Claude/Codex/OpenCode (port 3773) | `/t3` or `npx t3` | on-demand |
| [Prime Agent](./prime-agent.md) | Prime Intellect's terminal coding agent, with daemon-backed sessions | `prime-agent` | on-demand: `oh harness install prime-agent` |

## Verifying installation

```bash
claude --version
codex --version
pi --version

# Optional CLIs, present only after `oh harness install <id>` (or its install.* key):
opencode --version      # install.opencode: true
deepagents -v           # install.deepagents: true
hermes --version        # install.hermes: true
grok --version          # install.grok_build: true

npx t3 --version        # T3 Code (not preinstalled — fetched on demand)
prime-agent --version   # Prime Agent (not preinstalled — oh harness install prime-agent)
```

## Authentication

Open Harness provisions Claude Code, Codex, and Pi into `~/.local` on first boot rather than baking them into the image. Authenticate at least one default harness before use; authenticate optional harnesses after enabling their install flags:

- **Claude Code**: run `claude` and follow the OAuth prompt (see [Claude Code](./claude-code.md)).
- **Codex**: run `codex login` (see [Codex](./codex.md)).
- **OpenCode**: run `opencode auth login` (see [OpenCode](./opencode.md)).
- **Pi**: configure provider keys via environment variables (see [Pi](./pi.md)).
- **DeepAgents**: write provider keys to `~/.deepagents/.env` (see [DeepAgents](./deepagents.md)).
- **Hermes**: run `hermes setup` (see [Hermes](./hermes.md)).
- **Grok Build**: run `grok login --device-auth` for headless/remote auth, `grok login` for interactive OAuth, or set `XAI_API_KEY` as a fallback (see [Grok Build](./grok-build.md)). Cached `~/.grok/auth.json` takes precedence over `XAI_API_KEY`.
- **Prime Agent**: run `prime-agent`, then `/login` — OAuth for ChatGPT Plus/Pro (Codex), Claude Pro/Max, or GitHub Copilot; API keys via environment variables or the same `/login` flow. Credentials land in `~/.prime/agent/auth.json` (see [Prime Agent](./prime-agent.md)).
- **T3 Code**: authenticate one of Claude / Codex / OpenCode first, then run `/t3` (or `npx t3`) and open the printed pairing URL (see [T3 Code](./t3code.md)).

## Default surfaces

Two optional surfaces cover most day-to-day use:

- **Pi+Slack** — chat with the agent from Slack instead of the terminal.
- **T3 Code** — browser UI on port `3773` driving Claude / Codex / OpenCode.

Each runs in its own named tmux session per [`.oh/skills/t3/references/sandbox-processes.md`](https://github.com/mifunedev/openharness/blob/development/.oh/skills/t3/references/sandbox-processes.md). For the two browser surfaces, open them in **VS Code's Simple Browser** (`Ctrl+Shift+P` → `Simple Browser: Show`; `Cmd+Shift+P` on macOS) so the live UI sits in a tab next to the code you're editing.

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

### Reattach to any session

```bash
tmux ls                          # list sessions
tmux attach -t <session-name>    # reattach (Ctrl-b d to detach)
```

[Connecting to the Sandbox](/docs/connecting)
