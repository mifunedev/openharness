---
title: "Harnesses Overview"
---

# Harnesses Overview

Open Harness installs no agent CLI at boot. A harness enters the sandbox only when you run `oh harness install <id>`. **Claude Code**, **Codex**, **Pi**, **OpenCode**, **Hermes**, and **Grok Build** install this way. The install lands in `~/.local` inside the persistent home volume, so it survives a container recreate. No harness is baked into the image. **T3 Code** is on demand: the `/t3` skill (or `npx t3`) fetches it and serves a browser UI on port 3773. Inside the sandbox, run `oh tool install herdr`, then run `herdr`, then launch whichever agent you prefer from its panes and switch between them at any time. Reserve tmux for Open Harness's managed/headless cron, gateway, and watchdog infrastructure.

Open Harness is the harness; the **agent** is your call. To go beyond the catalog, install via `npm` / `pip` / `cargo` inside the sandbox or edit the Dockerfile. For Pi+Slack specifically, the recommended path is the `pi-messenger-bridge` npm package — see [Slack integration](../integrations/slack.md). The product surface is one developer, one project, one agent — not racing or stacking multiple CLIs against each other.

## Installing a harness

`oh harness install <id>` is the only door. It probes the running sandbox,
installs the CLI into `~/.local` in the persistent home volume, and reports. It
reads and writes no `oh.json` field. It never rebuilds or restarts the sandbox.

```bash
oh harness list                 # what exists, and what is installed
oh harness install opencode     # install into the running sandbox
oh harness status hermes        # one harness
```

The command needs a running sandbox. If the sandbox is not running, it says so
and exits non-zero. Start the sandbox with `oh sandbox install docker`, then re-run it.

`oh harness` works from inside the sandbox too. There it installs into the
environment you are already in, and `list`/`status` report the CLIs actually
present rather than `?`. See
[Lifecycle commands → Where you are standing when you type `oh`](../lifecycle-commands.md#where-you-are-standing-when-you-type-oh).

Flags:

| Flag | Effect |
|---|---|
| `--json` | `list` and `status` only: machine-readable output |

Each catalog entry has a `kind`. `installable` harnesses install through the
verb. `on-demand` harnesses (T3 Code) are fetched by `npx` at each run and are
never installed. There is no other install path, and no configuration key
selects one.

An install persists because the home volume persists. `oh destroy` removes that
volume, and the install with it.

## Supported agents

| Agent | Role | Start command | Source |
|---|---|---|---|
| [Claude Code](./claude-code.md) | Anthropic's terminal coding agent | `claude` | `oh harness install claude-code` |
| [Codex](./codex.md) | OpenAI's CLI coding agent | `codex` | `oh harness install codex` |
| [OpenCode](./opencode.md) | Terminal coding agent with OpenAI OAuth support | `opencode` | `oh harness install opencode` |
| [Pi](./pi.md) | Lightweight, customizable agent | `pi` | `oh harness install pi` |
| [Hermes](./hermes.md) | Nous Research's self-improving terminal agent | `hermes` | `oh harness install hermes` |
| [Grok Build](./grok-build.md) | xAI's proprietary Grok Build terminal agent | `grok` | `oh harness install grok-build` |
| [T3 Code](./t3code.md) | Browser UI over Claude/Codex/OpenCode (port 3773) | `/t3` or `npx t3` | on demand, no install |

## Verifying installation

```bash
# Each CLI is present only after `oh harness install <id>`:
claude --version
codex --version
pi --version
opencode --version
hermes --version
grok --version

npx t3 --version        # T3 Code — on demand, fetched by npx
```

## Authentication

Install a harness with `oh harness install <id>`, then authenticate it. Authenticate at least one harness before use:

- **Claude Code**: run `claude` and follow the OAuth prompt (see [Claude Code](./claude-code.md)).
- **Codex**: run `codex login` (see [Codex](./codex.md)).
- **OpenCode**: run `opencode auth login` (see [OpenCode](./opencode.md)).
- **Pi**: configure provider keys via environment variables (see [Pi](./pi.md)).
- **Hermes**: run `hermes setup` (see [Hermes](./hermes.md)).
- **Grok Build**: run `grok login --device-auth` for headless/remote auth, `grok login` for interactive OAuth, or set `XAI_API_KEY` as a fallback (see [Grok Build](./grok-build.md)). Cached `~/.grok/auth.json` takes precedence over `XAI_API_KEY`.
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
tmux new-session -d -s agent-t3code 'npx --yes t3 serve 2>&1 | tee /tmp/agent-t3code.log'
tmux capture-pane -t agent-t3code -p | grep -iE 'pair|token|url'
```

Open the printed pairing URL (`http://localhost:3773/pair#token=…`) in the Simple Browser tab. Full setup: [T3 Code](./t3code.md).

### Reattach to any session

```bash
tmux ls                          # list sessions
tmux attach -t <session-name>    # reattach (Ctrl-b d to detach)
```

[Connecting to the Sandbox](/docs/connecting)
