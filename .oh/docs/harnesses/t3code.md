---
sidebar_position: 6
title: "T3 Code"
---

# T3 Code

T3 Code is a web-based coding agent harness from Theo Browne / ping.gg. Unlike the other harnesses listed here, T3 Code is **not a CLI you talk to in a terminal** — it runs a local web UI on port `3773` and orchestrates an underlying provider (Claude Code, Codex, or OpenCode) as the actual coding agent. You bring your own already-authenticated provider and T3 Code drives it from a browser.

## Purpose

Use T3 Code when you want a browser UI over the same providers the other harnesses run from the terminal — multi-thread sessions, conversational history, and a UI for review/approval flows, while reusing whatever provider auth you already have set up in the sandbox.

## Install

T3 Code is **not preinstalled** in the sandbox image. The `/t3` skill starts it on demand via `npx --yes t3` and keeps it in tmux:

```text
/t3
```

For a direct shell launch, run:

```bash
npx t3
```

The first launch downloads the package and starts the server. No global install is required, but you can install it for faster subsequent starts:

```bash
pnpm add -g t3
```

Verify:

```bash
npx t3 --version
```

## Authentication

T3 Code currently supports Codex, Claude, and OpenCode as backends. Install and authenticate **at least one provider** in the sandbox before launching T3 Code (see the per-provider pages for details):

- **[Codex](./codex.md)**: run `codex login`
- **[Claude Code](./claude-code.md)**: run `claude` and complete OAuth
- **[OpenCode](./opencode.md)**: run `opencode auth login`

T3 Code itself uses a **pairing-URL** auth model: on first start it logs a one-time URL like `http://localhost:3773/pair#token=...` to stdout. Open that URL in your browser to bind the UI to the running server. The token is single-use; restart T3 Code to mint a fresh one.

## Run in tmux

Per [`context/rules/sandbox-processes.md`](https://github.com/mifunedev/openharness/blob/development/context/rules/sandbox-processes.md), long-running processes inside the sandbox go in named tmux sessions. T3 Code listens on `0.0.0.0:3773` so it can be reached from the host. Prefer the `/t3` skill when an agent is available:

```text
/t3 start      # launch in tmux and print the pairing URL when available
/t3 status     # inspect the tmux session and recent output
/t3 url        # print the latest pairing URL found in logs
/t3 stop       # stop the tmux session
```

Manual terminal fallback:

```bash
tmux new-session -d -s agent-t3code 'npx t3 2>&1 | tee /tmp/agent-t3code.log'
tmux capture-pane -t agent-t3code -p | grep -i pairingUrl
```

Open the printed pairing URL in your host browser. Reattach to the session at any time:

```bash
tmux attach -t agent-t3code
```

If you need to share the T3 Code UI beyond your attached host session, use `/cloudflared 3773` to start a Cloudflared tunnel for the local port.

## Tips

- T3 Code is a UI over the providers — installing T3 Code does **not** replace `claude login` / `codex login` / `opencode auth login`. Authenticate the provider first, then start T3 Code.
- The pairing token is regenerated on every server restart. Treat it as ephemeral — don't bookmark the URL.
- T3 Code uses Node's experimental SQLite at startup; the warning in the log is expected.

## Upstream documentation

- [`pingdotgg/t3code` on GitHub](https://github.com/pingdotgg/t3code)

[Connecting to the Sandbox](/docs/connecting)
