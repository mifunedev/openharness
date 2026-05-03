---
sidebar_position: 3
title: "Cloudflare"
---

# Cloudflare

Open Harness exposes sandbox apps to the public internet via **Cloudflare named tunnels**. Use the `/cloudflared-tunnel` skill (or run `install/cloudflared-tunnel.sh` directly) to create a tunnel, write its ingress config, and route DNS — all in one idempotent step.

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

For persistent public URLs tied to a Cloudflare-managed domain, use `install/cloudflared-tunnel.sh`. This script creates a named tunnel, writes the ingress config, and routes DNS — all idempotently. The `/cloudflared-tunnel` skill drives this same script with the canonical onboarding flow (prereq checks, multi-ingress YAML, DNS routing, optional `--run`, post-start verification).

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

### Driving the flow with the skill

Prefer the `/cloudflared-tunnel` skill when working interactively — it parses arguments, checks prerequisites, creates or reuses the tunnel, writes `~/.cloudflared/config-<tunnel-name>.yml`, routes DNS for every hostname, and (with `--run`) starts the tunnel and verifies each hostname end-to-end. See `.claude/skills/cloudflared-tunnel/SKILL.md` for the canonical step-by-step.
