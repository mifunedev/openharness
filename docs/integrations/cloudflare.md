---
sidebar_position: 3
title: "Cloudflare"
---

# Cloudflare

Open Harness supports two Cloudflare exposure methods: the Caddy gateway overlay for local and remote routing, and named Cloudflare Tunnels for persistent public URLs via `install/cloudflared-tunnel.sh`.

## Gateway routing via Caddy

When the gateway overlay is enabled, the sandbox runs a Caddy reverse proxy that exposes in-sandbox dev servers via HTTPS. Routes live in `.openharness/exposures.json`; Caddy reloads in-process when the file changes.

The URL shape depends on your host mode:

| Mode | Condition | URL |
|---|---|---|
| Laptop | No `PUBLIC_DOMAIN` set | `https://<name>.<sandbox>.localhost:8443` |
| Remote | `PUBLIC_DOMAIN` set in `.devcontainer/.env` | `https://<name>.<sandbox>.<PUBLIC_DOMAIN>` |

### Example workflow

Start your app inside the sandbox in a tmux session:

```bash
tmux new-session -d -s app-docs 'pnpm dev -p 3000 2>&1 | tee /tmp/app-docs.log'
```

Then declare the route by editing `.openharness/exposures.json` (one JSON entry per `{ name, port }` pair). Caddy picks up the change and starts serving `https://docs.<sandbox>.localhost:8443` (laptop mode) or `https://docs.<sandbox>.<PUBLIC_DOMAIN>` (remote mode).

To remove a route, delete its entry from `.openharness/exposures.json`.

### Gateway constraints

- Routes are regenerated in `.openharness/Caddyfile` — never hand-edit that file.
- Route names must match `/^[a-z][a-z0-9-]{0,30}$/` and cannot be `admin`, `www`, `gateway`, or `api-internal`.
- Caddy reloads in-process and never restarts the sandbox container.
- Two sandboxes exposing the same route name do not collide because the sandbox name is always included in the hostname.

See `.claude/rules/gateway-routing.md` (rendered in the Architecture section) for the complete routing contract.

## Enabling the cloudflared overlay

To install `cloudflared` inside the sandbox, add the cloudflared overlay at startup:

```bash
docker compose \
  -f .devcontainer/docker-compose.yml \
  -f .devcontainer/docker-compose.cloudflared.yml \
  up -d --build
```

This sets `INSTALL_CLOUDFLARED=true` in the container environment. The entrypoint installs the `cloudflared` binary to `/usr/local/bin/cloudflared` during container startup.

## Named tunnels via cloudflared-tunnel.sh

For persistent public URLs tied to a Cloudflare-managed domain, use `install/cloudflared-tunnel.sh`. This script creates a named tunnel, writes the ingress config, and routes DNS — all idempotently.

### Prerequisites

1. `cloudflared` installed (provided by the cloudflared overlay above).
2. Authenticated with Cloudflare: `cloudflared login` (opens browser, saves `~/.cloudflared/cert.pem`).
3. A domain managed in your Cloudflare account.

### Usage

Single ingress:

```bash
install/cloudflared-tunnel.sh <tunnel-name> <hostname> <local-port>
```

Multiple ingress routes:

```bash
install/cloudflared-tunnel.sh <tunnel-name> <hostname>:<port> [<hostname>:<port> ...]
```

Start the tunnel immediately after configuration:

```bash
install/cloudflared-tunnel.sh myproject app.example.com:3000 api.example.com:3001 --run
```

Replace `example.com` with your own Cloudflare-managed domain.

### Running the tunnel in tmux

For a long-lived tunnel, run it in a named tmux session:

```bash
tmux new-session -d -s expose-public-3000 \
  'cloudflared tunnel run myproject 2>&1 | tee /tmp/expose-public-3000.log'
```

Attach to inspect logs:

```bash
tmux attach -t expose-public-3000
```
