---
title: "T3 Code"
---

# T3 Code

T3 Code is a web-based coding agent harness from Theo Browne / ping.gg. Unlike the other harnesses listed here, T3 Code is **not a CLI you talk to in a terminal** — it runs a web UI backed by a server on port `3773` and orchestrates an underlying provider (Claude Code, Codex, or OpenCode) as the actual coding agent. You bring your own already-authenticated provider and T3 Code drives it from a browser or from the T3 Code mobile app.

## Purpose

Use T3 Code when you want a browser or phone UI over the same providers the other harnesses run from the terminal — multi-thread sessions, conversational history, and a UI for review/approval flows, while reusing whatever provider auth you already have set up in the sandbox.

## Requirements

T3 Code's server package requires Node `^22.16 || ^23.11 || >=24.10`. The sandbox base image is `node:22-trixie-slim`, so a 22.x older than 22.16 is the realistic failure. Check before you launch:

```bash
node -v
```

`/t3 doctor` runs the same check and reports an actionable error when the version is out of range.

## Install

T3 Code is **not preinstalled** in the sandbox image. The `/t3` skill starts it on demand via `npx --yes t3 serve` and keeps it in tmux:

```text
/t3
```

The first launch downloads the package and starts the server. No global install is required, but you can install it for faster subsequent starts:

```bash
pnpm add -g t3
```

Verify:

```bash
npx t3 --version
```

## Which command to run

| Command | Use it when | What it does |
|---------|-------------|--------------|
| `npx t3` | You are on the machine with the browser and want the normal local launch | Starts the server and opens the local UI flow |
| `npx t3 serve` | The server runs headless in the sandbox and you connect from elsewhere | Starts the server only, prints the connection string, a pairing token, a pairing URL, and a QR code |
| `npx t3 serve --tailscale-serve` | You want a phone or another tailnet device to reach the server privately | Same as `serve`, plus configures Tailscale Serve on HTTPS 443 and advertises `https://<machine>.<tailnet>.ts.net/` |
| `npx t3 pair` | A server is already running and you want to add a device | Mints a fresh one-time pairing token without restarting the server |
| `npx t3 pair --tailscale` | A server is already running and the new device is on the tailnet | Publishes over Tailscale Serve HTTPS and pairs through the MagicDNS URL |

Inside the sandbox, prefer the `/t3` skill over calling `npx` by hand — it owns the tmux session and the preflight checks.

Use `--tailscale-serve-port <port>` (on `serve`) or `--tailscale-serve-port <port>` (on `pair --tailscale`) when HTTPS 443 is already taken on that tailnet node. `pair --tailscale` also accepts `--ttl` and `--base-dir`.

## Authentication

T3 Code currently supports Codex, Claude, and OpenCode as backends. Install and authenticate **at least one provider** in the sandbox before launching T3 Code (see the per-provider pages for details):

- **[Codex](./codex.md)**: run `codex login`
- **[Claude Code](./claude-code.md)**: run `claude` and complete OAuth
- **[OpenCode](./opencode.md)**: run `opencode auth login`

Provider authentication is **separate** from T3 pairing. Pairing binds a client (browser or phone) to your running T3 server; it grants no provider credentials and does not replace `claude` / `codex login` / `opencode auth login`.

T3 Code itself uses a **pairing-URL** auth model: on start it prints a one-time URL like `http://localhost:3773/pair#token=...` plus a QR code. Open the URL, or scan the QR from the T3 Code mobile app, to bind the client to the running server. The token is single-use. To add a second device, run `npx t3 pair` against the running server — **do not restart T3 Code**.

Treat pairing URLs and tokens as secrets. Do not paste them into issues, pull requests, or chat.

## Run in tmux

Per [`.oh/skills/t3/references/sandbox-processes.md`](https://github.com/mifunedev/openharness/blob/development/.oh/skills/t3/references/sandbox-processes.md), long-running processes inside the sandbox go in named tmux sessions. T3 Code stays bound to **container loopback** (`127.0.0.1:3773`); the harness publishes no host port for it. Reach it through VSCode port forwarding, an SSH tunnel, or Tailscale Serve — see [Connecting to the Sandbox](/docs/connecting).

Prefer the `/t3` skill when an agent is available:

```text
/t3 doctor          # preflight: tmux, npx, Node range, and Tailscale state
/t3 start           # launch `npx t3 serve` in tmux and print the pairing URL
/t3 start --tailscale   # launch `npx t3 serve --tailscale-serve`
/t3 status          # inspect the tmux session and recent output
/t3 url             # print the latest pairing URL found in logs
/t3 pair            # mint a fresh pairing token for a running server
/t3 pair --tailscale    # pair a new device through the MagicDNS HTTPS URL
/t3 stop            # stop the tmux session
```

Manual terminal fallback:

```bash
tmux new-session -d -s agent-t3code 'npx --yes t3 serve 2>&1 | tee /tmp/agent-t3code.log'
tmux capture-pane -t agent-t3code -p | grep -i pairingUrl
```

Reattach to the session at any time:

```bash
tmux attach -t agent-t3code
```

The session survives a shell or SSH disconnect. Detach with `Ctrl-b d`.

## Mobile access over Tailscale

`--tailscale-serve` configures Tailscale Serve on HTTPS **443** and advertises `https://<machine>.<tailnet>.ts.net/`. The phone must be signed in to the **same tailnet** as the sandbox. Full end-to-end recipe, prerequisites, and troubleshooting: [Connecting → Mobile access over Tailscale](/docs/connecting#mobile-access-over-tailscale).

The Serve mapping persists after T3 Code stops. Withdraw it explicitly:

```bash
tailscale serve --https=443 off
```

Use `--tailscale-serve-port 8443` to publish on an alternate HTTPS port; withdraw it with `tailscale serve --https=8443 off`.

## Revoking access

Two independent credentials exist. Revoke both when you retire a device.

```bash
t3 auth                          # issue, inspect, and revoke T3 sessions and pairing credentials
tailscale serve --https=443 off  # withdraw the Serve mapping
tailscale logout                 # sign this node out of the tailnet
```

Remove the device from the tailnet in the Tailscale admin console as well — `tailscale logout` signs out the node, the admin console deletes it.

## Sharing publicly

Tailscale is the **private** path and the supported mobile path. If you need a genuinely public preview URL for someone who is not on your tailnet, use `/cloudflared 3773` instead. That is public bearer-URL exposure — anyone with the link reaches the port. Tailscale Funnel is **not** enabled by default and the harness ships no Funnel command. See [Security considerations](../security-considerations.md).

## Tips

- T3 Code is a UI over the providers — installing T3 Code does **not** replace `claude login` / `codex login` / `opencode auth login`. Authenticate the provider first, then start T3 Code.
- The hosted page at `https://app.t3.codes` is HTTPS, so it cannot talk to a plain-HTTP tailnet endpoint (mixed content). Use `--tailscale-serve`, which is HTTPS, or the native mobile app.
- T3 Code uses Node's experimental SQLite at startup; the warning in the log is expected.

## Upstream documentation

- [`pingdotgg/t3code` on GitHub](https://github.com/pingdotgg/t3code)
- [T3 Code remote access](https://github.com/pingdotgg/t3code/blob/main/docs/user/remote-access.md)

[Connecting to the Sandbox](/docs/connecting)
