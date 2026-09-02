---
title: "Connecting to the Sandbox"
---

# Connecting to the Sandbox

The sandbox is a Docker container running on your host (or a remote server). Getting UI apps like T3 Code onto your laptop browser depends on **how** you connect — not every connection method forwards ports. This page covers your options, explains which one to use, and walks an end-to-end recipe.

## Three ways to connect

| Option | Command / action | Port forwarding to laptop |
|--------|-----------------|--------------------------|
| **A — Terminal** | `oh shell` from the host | None — plain shell only |
| **B — VSCode Attach (local)** | Dev Containers extension → "Attach to Running Container" → `openharness` | Automatic while attached |
| **C — VSCode Remote-SSH + Attach (remote host)** | SSH into your host in VSCode, then Attach to Container | Automatic while attached |
| **D — Direct SSH (opt-in)** | `ssh -p 2222 sandbox@localhost` after enabling the sshd overlay | None — SSH shell only (tunnel/proxy separately) |

### Option A — Terminal

```bash
cd ~/.openharness
oh shell
```
Pass an optional container name to attach to a different running container, e.g. `oh shell portfolio-advisor`. `oh shell` always attaches as the `sandbox` user; if the target container has no such user, use `docker exec -it -u <user> <container> zsh` instead.

You land inside the container as the `sandbox` user. A fresh sandbox has no `herdr`: run `oh tool install herdr`, then `herdr`, then launch CLI agents and complete interactive setup from its panes. Container ports are **not** forwarded to your laptop — you cannot open `localhost:3000` in your browser via this method alone.

> **Attach, do not "Reopen in Container".** *Dev Containers: Reopen in Container*
> reads `.devcontainer/devcontainer.json`, which names `docker-compose.yml` alone,
> so it bypasses `.oh/scripts/docker-compose.sh` and applies **no compose overlays** —
> no SSH, no host Docker socket, no Hermes dashboard, nothing from
> `composeOverrides[]`. Provision with `oh sandbox`, then attach. Details:
> [lifecycle commands](lifecycle-commands.md#vs-code-reopen-in-container-applies-no-overlays).

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

### Option D — Direct SSH (opt-in)

The base container runs no SSH daemon. Enabling the opt-in `sshd` overlay
publishes a loopback SSH port so you can connect straight in:

```bash
ssh -p 2222 sandbox@localhost
```

Auth is public-key by default and the host bind is loopback-only. This is the
foundation for routing multiple tenants' containers behind one nginx proxy on a
single VM. Full setup — enabling the overlay, adding your key, the port-collision
preflight, and the nginx multi-tenant recipe — is in
[Integrations → SSH](/docs/integrations/sshd).

## Why VSCode Attach is the recommended path

Attaching via VSCode is the easiest way to reach container UIs on your laptop browser. The auto-forwarding is session-scoped: ports appear under the **Ports** panel while attached and disappear when you close or detach from the VSCode window.

If you only need a terminal (no browser UI), Option A is fine. Whichever attach path you choose, make `oh tool install herdr` and then `herdr` the first commands in the sandbox.

## What happens when you close VSCode

When you close the VSCode remote window or detach from the container, the port forwards drop. Apps in tmux keep running inside the container — they are unaffected — but `localhost:<port>` on your laptop no longer resolves until you re-attach.

## Default exposure posture

The base sandbox publishes **no application ports** to the host by default.

Container ports (3000, 3773, etc.) are reachable from your laptop only via VSCode's auto-forwarding, a manual `ssh -L` tunnel, or an explicit compose overlay you add yourself.

## Opt-in public exposure

If you need a port reachable beyond your laptop — for example, to share a preview with a teammate — there are two opt-in paths:

**1. Compose overlay binding `0.0.0.0`**

Add a custom compose file that binds the port on all interfaces and merge it in via `composeOverrides[]` in `.oh/config.json` (gitignored):

```yaml
# docker-compose.my-expose.yml
services:
  sandbox:
    ports:
      - "0.0.0.0:3000:3000"
```

This is NOT the default; you opt in explicitly. Be aware that binding to `0.0.0.0` exposes the port on the host's public interface.

**2. External tunnel**

For **public** access, use `cloudflared` (shipped in the image, see the `/cloudflared` skill), `ngrok`, or an nginx/Caddy reverse proxy. Start the tunnel inside the sandbox in a named tmux session (see [tmux conventions](#tmux-session-naming)).

For **private** access from your own devices — including a phone — use Tailscale instead of a public tunnel. See [Mobile access over Tailscale](#mobile-access-over-tailscale). Tailscale Funnel would make a tailnet service public; it is never enabled by default and the harness ships no Funnel command.

**3. Direct SSH + nginx multi-tenant routing**

To SSH straight into the container — and to route several tenants' containers through one nginx reverse proxy on a single VM — enable the opt-in `sshd` overlay. See [Integrations → SSH](/docs/integrations/sshd).

## Mobile access over Tailscale

This is the supported path for reaching T3 Code from a phone, and the supported path for reaching it from a remote sandbox at all without publishing a port. Access stays **private to your tailnet**.

### Where Tailscale runs, and why

`tailscaled` runs **inside the sandbox container**, in userspace-networking mode, as the unprivileged `sandbox` user. The container is the tailnet node.

- No `NET_ADMIN`, no `/dev/net/tun`, no `privileged: true`, no host socket mount. Userspace networking needs none of them, and Tailscale Serve is fully supported in that mode.
- **No host port is published.** T3 Code stays on container loopback `127.0.0.1:3773`. Tailscale Serve inside the container proxies tailnet HTTPS to that loopback address. A device outside the tailnet has nothing to reach.
- **There is no compose change at all.** `oh tool install tailscale` is the only door, and nothing installs Tailscale at boot. Node identity and daemon state live in `/home/sandbox/.tailscale`, inside the single `/home/sandbox` mount, so the node does not re-authenticate on every container recreate without any per-tool volume.
- Because the container is the node, the MagicDNS name your phone saved does not change when you move the workspace to another VM.

Installing the binary does **not** join a tailnet. Nothing runs `tailscaled` or `tailscale up` for you. Joining is an explicit human act.

### Prerequisites

On the remote host:

- The sandbox is running (`oh ps`).
- Node in the sandbox satisfies T3 Code's range `^22.16 || ^23.11 || >=24.10` (`node -v`).
- A provider is authenticated in the sandbox (`claude`, `codex login`, or `opencode auth login`).
- A Tailscale account and a tailnet you control.

On the phone:

- The Tailscale app, signed in to the **same tailnet**.
- The T3 Code mobile app.

The phone and the sandbox must share one tailnet. There is no other reachability path.

### Step 1 — Install Tailscale in the sandbox

```bash
oh tool install tailscale
```

This installs the binary into the running sandbox, from the tool catalog, which is the sole owner of the pinned version and its checksums. It is idempotent, and it needs no image rebuild. The install lands in `~/.local/bin` inside the persistent home volume, so it survives a container recreate.

The command needs a running sandbox. If the sandbox is not running, start it with `oh sandbox`, then re-run the command. Nothing about networking activates until you start the daemon in the next step.

Check the state at any time:

```bash
oh tool status tailscale
```

### Step 2 — Start the daemon

Run it in a named tmux session so it survives a disconnect:

```bash
tmux new-session -d -s agent-tailscaled \
  'tailscaled --tun=userspace-networking \
              --statedir=$HOME/.tailscale'
```

### Step 3 — Join the tailnet

```bash
tailscale up
```

`tailscale up` prints a login URL. Open it in a browser and approve the node. This is the supported setup: an interactive human login. **Never commit a reusable Tailscale auth key**, and never print one into a log or a tracked file.

Confirm the node is up and note its MagicDNS name:

```bash
tailscale status
```

### Step 4 — Start T3 Code in Tailscale mode

```text
/t3 start --tailscale
```

This runs `npx --yes t3 serve --tailscale-serve` in the `agent-t3code` tmux session. T3 Code configures Tailscale Serve on HTTPS 443 and advertises `https://<machine>.<tailnet>.ts.net/`. It prints a pairing URL and a QR code.

Add `--tailscale-port 8443` if HTTPS 443 is already claimed on that node.

Reprint the current pairing URL at any time:

```text
/t3 url
```

### Step 5 — Pair the phone

1. Open the T3 Code mobile app.
2. Scan the QR code printed in the `agent-t3code` session, or paste the `https://<machine>.<tailnet>.ts.net/...` pairing URL.
3. The app binds to the running server.

The pairing token is single-use. The paired session persists, so the phone reconnects later without pairing again — as long as the phone is on the tailnet and the server is running.

### Adding another device

Do not restart the server. Mint a fresh token against the running one:

```text
/t3 pair --tailscale
```

Then scan or paste the new URL on the second device.

### Lifecycle

Two tmux sessions carry this setup:

| Session | Process |
|---------|---------|
| `agent-tailscaled` | the Tailscale daemon |
| `agent-t3code` | `npx t3 serve --tailscale-serve` |

Both survive a shell or SSH disconnect. Inspect them with `tmux ls`, attach with `tmux attach -t <session>`, detach with `Ctrl-b d`. `/t3 status` and `/t3 logs` read the T3 session without attaching.

After a container recreate, the tailnet identity is still in `~/.tailscale` inside the home mount, but the daemon is not running: repeat steps 2 and 4. `tailscale up` is not needed again unless you logged out.

### Revoking access

T3 pairing credentials and Tailscale device access are **separate**. Revoke both.

```bash
t3 auth                          # inspect and revoke T3 sessions and pairing credentials
tailscale serve --https=443 off  # withdraw the Serve mapping (it persists until you do)
tailscale logout                 # sign the sandbox node out of the tailnet
```

Then delete the device in the Tailscale admin console. Revoking a phone's own tailnet access is done there too.

### Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `/t3 start --tailscale` reports Tailscale missing | binary not installed | `oh tool install tailscale`, then `oh sandbox` if the sandbox was down |
| `tailscale status` fails to reach the daemon | `tailscaled` not running | repeat step 2; check `tmux ls` for `agent-tailscaled` |
| Backend state is not `Running` / "logged out" | node never joined, or was logged out | `tailscale up` and complete the browser login |
| No `ts.net` URL in the T3 output | Serve was not configured | confirm `tailscale status` is `Running`, then restart with `/t3 start --tailscale` |
| Serve still answers after T3 Code stops | the Serve mapping persists | `tailscale serve --https=443 off` |
| T3 Code refuses to start with an engine error | Node outside `^22.16 \|\| ^23.11 \|\| >=24.10` | check `node -v`; the sandbox image pins Node 22.x, so upgrade past 22.16 |
| Phone cannot reach the URL at all | phone not on the tailnet | sign the phone's Tailscale app in to the same tailnet and confirm it appears in `tailscale status` |
| Phone is on the tailnet but the URL times out | Serve mapping on a different port, or the server stopped | `tailscale serve status`; `/t3 status` |
| `https://app.t3.codes` cannot connect | mixed content: the hosted page is HTTPS and a plain-HTTP tailnet endpoint is blocked | use `--tailscale-serve` (HTTPS) or the native mobile app |

`/t3 doctor` runs the Tailscale, Node, and tooling checks in one pass and prints an actionable line per failure.

### Operator-owned fallback: Tailscale on the host

If your host policy forbids a daemon inside the container, you can instead run `tailscaled` on the remote host and route the sandbox port through it. This is **not** the supported path and the harness does not manage it:

- It requires publishing `3773` from the container to the host, which widens exposure on any multi-tenant or internet-facing VM.
- `oh tool install tailscale` installs and versions the binary *inside* the sandbox, so `oh tool status tailscale` would not describe the host daemon.
- The tailnet node becomes the host, so the MagicDNS name changes when you move the workspace to another machine.

You own the configuration and the exposure in that layout.

### Tailscale versus Cloudflared

| | Tailscale Serve | Cloudflared |
|---|---|---|
| Audience | your tailnet only | anyone with the URL |
| Auth | tailnet device identity | none — the URL is the bearer credential |
| Use it for | phones, remote laptops, your own devices | a public preview shared with someone off your tailnet |
| Command | `/t3 start --tailscale` | `/cloudflared 3773` |

Cloudflared remains the right tool for public preview sharing. It is not the mobile path. Tailscale **Funnel** — which would make a tailnet service public — is never enabled by default and the harness ships no Funnel command.

## tmux session naming

All long-running processes inside the sandbox run in named tmux sessions. The naming convention is `<category>-<identifier>`:

| Category | Example | Purpose |
|----------|---------|---------|
| `client-` | `client-slack-pi`, `client-discord` | External-surface clients bridging an in-sandbox agent |
| `agent-` | `agent-watcher`, `agent-batch`, `agent-t3code`, `agent-tailscaled` | Headless / long-running agent processes (interactive CLIs are foreground, not tmux) |
| `app-` | `app-api` | Dev servers |

For the full convention see [`.oh/skills/t3/references/sandbox-processes.md`](https://github.com/mifunedev/openharness/blob/development/.oh/skills/t3/references/sandbox-processes.md).

## End-to-end recipe

This recipe assumes the sandbox is already running (`oh ps` confirms the `openharness` container is up). Steps run inside the sandbox unless noted.

### Step 1 — Attach via VSCode

Follow Option B (or C for a remote host). The Ports panel in VSCode shows forwarded ports as you launch apps.

### Step 2 — Configure Slack

Create/update the Slack app from `.pi/install/slack-manifest.json`, set `PI_SLACK_APP_TOKEN` / `PI_SLACK_BOT_TOKEN` in `.devcontainer/.env`, then manage the Pi-side bridge session with `/msg-bridge` from inside `client-slack-pi`. Trust/channel admin is handled by challenge auth plus manifest-backed Slack admin commands, not separate Pi commands. The `client-slack-pi` session starts automatically on container boot; manage it with `gateway pi` (`gateway pi --restart` to pick up token edits, `gateway status` to check). The tracked `.pi/msg-bridge.json` (`autoConnect`, `auth.trustedUsers`) is an optional headless pre-seed. For the full walkthrough see [Integrations → Slack](/docs/integrations/slack).

After the bridge is up, verify it is live:

```bash
tmux capture-pane -t client-slack-pi -p | grep -i 'Bot user ID'
```

### Step 3 — Launch T3 Code

T3 Code is on demand: it is never installed, and the first invocation downloads it via `npx`. If an agent is running, prefer the `/t3` skill:

```text
/t3 start
/t3 url
```

Manual terminal fallback:

```bash
tmux new-session -d -s agent-t3code 'npx --yes t3 serve 2>&1 | tee /tmp/agent-t3code.log'
tmux attach -t agent-t3code
```

Watch the session output — T3 Code prints a pairing URL and a QR code. Open that URL in your browser to complete pairing. After pairing, the UI is available at `localhost:3773` on your laptop (via VSCode auto-forwarding).

To pair a second device later, run `/t3 pair` — do not restart the server.

To reach T3 Code from a phone, follow [Mobile access over Tailscale](#mobile-access-over-tailscale) instead.

Detach from the tmux session without stopping it: `Ctrl-b d`.

For more on T3 Code setup see [Harnesses → T3 Code](/docs/harnesses/t3code).

### Step 4 — Confirm ports in VSCode

Open the **Ports** panel (bottom status bar → Ports, or `Ctrl+Shift+P` → "Focus on Ports"). You should see:

| Port | Forwarded to | App |
|------|-------------|-----|
| 3773 | localhost:3773 | T3 Code UI |

If a port is missing, confirm the tmux session is running (`tmux ls`) and that you are still attached via VSCode.

## Quick-reference: reach `localhost` from your laptop

| App | Container port | Laptop URL (VSCode attached) | Tailnet URL (Tailscale Serve) |
|-----|---------------|------------------------------|-------------------------------|
| T3 Code UI | 3773 (loopback only) | `http://localhost:3773` | `https://<machine>.<tailnet>.ts.net/` |
