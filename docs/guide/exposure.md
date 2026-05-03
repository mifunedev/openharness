---
title: "Exposing apps"
sidebar_position: 6
---

# Exposing apps

There is no first-class exposure tool right now. The CLI command and reverse-proxy sidecar that previously routed sandbox apps through HTTPS hostnames were removed in v0.7 and have not been replaced.

For external access, you have two options:

1. **Cloudflare Tunnel.** Enable the `cloudflared` compose overlay (see [Cloudflare integration](../integrations/cloudflare.md) and the [`/cloudflared-tunnel`](../architecture/overview.md) skill). This is the documented path for a persistent public URL.
2. **Bring your own reverse proxy.** Run nginx, Caddy, or Traefik in front of the sandbox yourself — `docker exec` into the sandbox container or bind-publish a port from the compose file, then route to it.

For local development, dev servers running inside the sandbox are reachable on the host at `localhost:<port>` if you publish the port in `.devcontainer/docker-compose.yml`.

## Related: app lifecycle

Every long-running process inside the sandbox should run inside a named tmux session. See [sandbox processes rule](https://github.com/ryaneggz/open-harness/blob/main/.claude/rules/sandbox-processes.md) for the convention.
