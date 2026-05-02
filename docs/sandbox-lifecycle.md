---
sidebar_position: 5
title: "Sandbox Lifecycle"
---

# Sandbox Lifecycle

A sandbox is a Docker container built from the Open Harness devcontainer image. This page covers every `docker compose` command for creating, inspecting, connecting to, and tearing down a sandbox. All lifecycle commands run from the host machine, against `.devcontainer/docker-compose.yml`.

To save typing, set an alias once per shell:

```bash
alias dc='docker compose -f .devcontainer/docker-compose.yml'
```

Examples below use the long form so they are copy-pasteable without the alias.

## Create

### Build and start

Build the image (if needed) and start the container:

```bash
docker compose -f .devcontainer/docker-compose.yml up -d --build
```

What happens:

1. Docker reads `.devcontainer/docker-compose.yml` plus any overlays (see `.openharness/config.json` for active overlays).
2. The image is built or rebuilt as needed.
3. The container starts in detached mode.
4. The healthcheck eventually flips status to `healthy`.

The container name is whatever you set as `SANDBOX_NAME` in `.devcontainer/.env` (default `openharness`). On a cold Docker cache the build takes around ten minutes; subsequent starts are a few seconds.

### Restart without rebuilding

If the image already exists and you only want to start the stopped container:

```bash
docker compose -f .devcontainer/docker-compose.yml up -d
```

Without `--build`, Docker reuses the existing image.

## Inspect

### List the sandbox state

```bash
docker compose -f .devcontainer/docker-compose.yml ps
```

Shows the container name, status, and port mappings. Use the broader `docker ps` to see every container on the host (helpful when you have multiple sandboxes from different repos).

### See in-sandbox tmux sessions

The system-cron runtime, dev servers, and agents all live inside named tmux sessions (per `.claude/rules/sandbox-processes.md`). List them from the host:

```bash
docker exec -u sandbox openharness tmux ls
```

Attach interactively from inside the sandbox shell with `tmux attach -t <name>`.

## Connect

```bash
docker exec -it -u sandbox openharness zsh
```

You land in `/home/sandbox/harness` as the `sandbox` user. Replace `openharness` with your `SANDBOX_NAME`.

For VS Code Attach to Container and Remote SSH alternatives, see [Connecting](./connecting).

## Expose

Publishing a sandbox port through the Caddy gateway is handled by the optional gateway overlay. With the overlay enabled, edits to `.openharness/exposures.json` regenerate the Caddyfile and reload Caddy in-process. See `.claude/rules/gateway-routing.md` (rendered in the Architecture section) for the routing contract.

A typical flow once the overlay is enabled:

```bash
# Inside the sandbox: start the dev server in a named tmux session.
tmux new-session -d -s app-docs 'pnpm --filter @openharness/docs dev -p 8080 2>&1 | tee /tmp/app-docs.log'

# Edit .openharness/exposures.json on the host, then reload Caddy.
```

On a laptop (no `PUBLIC_DOMAIN` set), the route is `https://docs.<sandbox>.localhost:8443`. On a remote host with `PUBLIC_DOMAIN` set, it is `https://docs.<sandbox>.<PUBLIC_DOMAIN>`.

## Stop and clean up

### Stop, keep volumes

```bash
docker compose -f .devcontainer/docker-compose.yml stop
```

Auth credentials (Claude Code, GitHub CLI, Cloudflare) survive in their named volumes and are available the next time you `up -d`.

### Stop and remove volumes (full teardown)

```bash
docker compose -f .devcontainer/docker-compose.yml down -v
```

Use `down -v` when you want a completely fresh environment. Use `stop` when you plan to restart soon and want to keep your credentials.

## Summary

| Command | When to use |
|---|---|
| `docker compose -f .devcontainer/docker-compose.yml up -d --build` | First start or after changing the image |
| `docker compose -f .devcontainer/docker-compose.yml up -d` | Restart a stopped container without rebuilding |
| `docker compose -f .devcontainer/docker-compose.yml ps` | See whether the sandbox is running |
| `docker exec -u sandbox openharness tmux ls` | List in-sandbox tmux sessions |
| `docker exec -it -u sandbox openharness zsh` | Open an interactive shell |
| `docker compose -f .devcontainer/docker-compose.yml stop` | Stop, keep volumes |
| `docker compose -f .devcontainer/docker-compose.yml down -v` | Stop and remove everything |

## Next steps

- [Connecting](./connecting) — VS Code Attach and Remote SSH alternatives to `docker exec`.
- [Onboarding](./onboarding) — run after your first `docker compose up` to authenticate services.
