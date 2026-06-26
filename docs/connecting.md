---
id: connecting
slug: /connecting
sidebar_position: 4
title: "Connecting to the Sandbox"
---

# Connecting to the Sandbox

The sandbox is a Docker container running on your host (or a remote server). Getting UI apps like the docs site and T3 Code onto your laptop browser depends on **how** you connect — not every connection method forwards ports. This page covers your options, explains which one to use, and walks an end-to-end recipe.

## Three ways to connect

| Option | Command / action | Port forwarding to laptop |
|--------|-----------------|--------------------------|
| **A — Terminal** | `make shell` from the host | None — plain shell only |
| **B — VSCode Attach (local)** | Dev Containers extension → "Attach to Running Container" → `openharness` | Automatic while attached |
| **C — VSCode Remote-SSH + Attach (remote host)** | SSH into your host in VSCode, then Attach to Container | Automatic while attached |

### Option A — Terminal

```bash
cd ~/.openharness
make shell
```
Pass an optional container name to attach to a different running container, e.g. `make shell portfolio-advisor` (add `SHELL_USER=<user>` if the target has no `sandbox` user).

You land inside the container as the `sandbox` user. This is enough to run CLI agents and configure Slack. Container ports are **not** forwarded to your laptop — you cannot open `localhost:3000` in your browser via this method alone.

### Option B — VSCode Attach to Running Container (local host)

1. Install the [Dev Containers](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers) extension.
2. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) → **Dev Containers: Attach to Running Container**.
3. Select **openharness**.

VSCode opens a remote window connected to the container and **automatically forwards container ports to `localhost`** on your laptop for the duration of the session.

### Option C — VSCode Remote-SSH + Attach (remote host)

If the sandbox runs on a remote server:

1. Connect to the server via **Remote-SSH** in VSCode.
2. From that SSH window, follow Option B to attach to the `openharness` container.

Port forwarding works identically — VSCode tunnels the container ports through the SSH connection to your laptop `localhost`. No manual `ssh -L` required.

## Why VSCode Attach is the recommended path

Attaching via VSCode is the easiest way to reach container UIs on your laptop browser. The auto-forwarding is session-scoped: ports appear under the **Ports** panel while attached and disappear when you close or detach from the VSCode window.

If you only need a terminal (no browser UI), Option A is fine.

## What happens when you close VSCode

When you close the VSCode remote window or detach from the container, the port forwards drop. Apps in tmux keep running inside the container — they are unaffected — but `localhost:<port>` on your laptop no longer resolves until you re-attach.

## Default exposure posture

The base sandbox publishes **no application ports** to the host by default.

Container ports (3000, 3773, etc.) are reachable from your laptop only via VSCode's auto-forwarding, a manual `ssh -L` tunnel, or an explicit compose overlay you add yourself.

## Opt-in public exposure

If you need a port reachable beyond your laptop — for example, to share a preview with a teammate — there are two opt-in paths:

**1. Compose overlay binding `0.0.0.0`**

Add a custom compose file that binds the port on all interfaces and merge it in via `compose.overrides:` in `harness.yaml` (tracked) or `composeOverrides[]` in `config.json` (user-local, gitignored):

```yaml
# docker-compose.my-expose.yml
services:
  sandbox:
    ports:
      - "0.0.0.0:3000:3000"
```

This is NOT the default; you opt in explicitly. Be aware that binding to `0.0.0.0` exposes the port on the host's public interface.

**2. External tunnel**

The harness ships no built-in tunnel tool. For public access, bring your own: `cloudflared`, `ngrok`, `tailscale funnel`, or an nginx/Caddy reverse proxy. Start the tunnel inside the sandbox in a named tmux session (see [tmux conventions](#tmux-session-naming)).

## tmux session naming

All long-running processes inside the sandbox run in named tmux sessions. The naming convention is `<category>-<identifier>`:

| Category | Example | Purpose |
|----------|---------|---------|
| `client-` | `client-slack-pi`, `client-discord` | External-surface clients bridging an in-sandbox agent |
| `agent-` | `agent-watcher`, `agent-batch` | Headless / long-running agent processes (interactive CLIs are foreground, not tmux) |
| `app-` | `app-docs`, `app-api` | Dev servers |

For the full convention see [`context/rules/sandbox-processes.md`](https://github.com/mifunedev/openharness/blob/development/context/rules/sandbox-processes.md).

## End-to-end recipe

This recipe assumes the sandbox is already running (`make ps` confirms the `openharness` container is up). Steps run inside the sandbox unless noted.

### Step 1 — Attach via VSCode

Follow Option B (or C for a remote host). The Ports panel in VSCode shows forwarded ports as you launch apps.

### Step 2 — Configure Slack

Set `PI_SLACK_APP_TOKEN` / `PI_SLACK_BOT_TOKEN` in `.devcontainer/.env`, then configure the messenger from inside the session with the bridge's `/msg-bridge` command (trusted users, channels) — that is the default method. The `client-slack-pi` session starts automatically on container boot; manage it with `gateway pi` (`gateway pi --restart` to pick up token edits, `gateway status` to check). The tracked `.pi/msg-bridge.json` (`autoConnect`, `auth.trustedUsers`) is an optional headless pre-seed. For the full walkthrough see [Integrations → Slack](/docs/integrations/slack).

After the bridge is up, verify it is live:

```bash
tmux capture-pane -t client-slack-pi -p | grep -i 'Bot user ID'
```

### Step 3 — Launch T3 Code

T3 Code is not preinstalled; the first invocation downloads it via `npx`. If an agent is running, prefer the `/t3` skill:

```text
/t3 start
/t3 url
```

Manual terminal fallback:

```bash
tmux new-session -d -s agent-t3code 'npx t3 2>&1 | tee /tmp/agent-t3code.log'
tmux attach -t agent-t3code
```

Watch the session output — T3 Code prints a pairing URL. Open that URL in your browser to complete the browser-based pairing step. After pairing, the UI is available at `localhost:3773` on your laptop (via VSCode auto-forwarding).

Detach from the tmux session without stopping it: `Ctrl-b d`.

For more on T3 Code setup see [Harnesses → T3 Code](/docs/harnesses/t3code).

### Step 4 — Launch the docs site

```bash
tmux new-session -d -s app-docs 'pnpm --filter @openharness/docs start 2>&1 | tee /tmp/app-docs.log'
```

The Docusaurus dev server binds port 3000 inside the container. Via VSCode auto-forwarding, open `localhost:3000` in your laptop browser.

### Step 5 — Confirm ports in VSCode

Open the **Ports** panel (bottom status bar → Ports, or `Ctrl+Shift+P` → "Focus on Ports"). You should see:

| Port | Forwarded to | App |
|------|-------------|-----|
| 3000 | localhost:3000 | Docs site |
| 3773 | localhost:3773 | T3 Code UI |

If a port is missing, confirm the tmux session is running (`tmux ls`) and that you are still attached via VSCode.

## Quick-reference: reach `localhost` from your laptop

| App | Container port | Laptop URL (VSCode attached) |
|-----|---------------|------------------------------|
| Docs site | 3000 | `http://localhost:3000` |
| T3 Code UI | 3773 | `http://localhost:3773` |
