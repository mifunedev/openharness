---
sidebar_position: 3
title: "Quickstart"
---

# Quickstart

This guide takes you from zero to a running sandbox with an interactive shell in under five minutes. The only host dependency is [Docker](https://docs.docker.com/get-docker/).

## Before you start

Install Docker with the Compose plugin: [docs.docker.com/get-docker](https://docs.docker.com/get-docker/). Everything else runs inside the container.

## Install

```bash
curl -fsSL https://oh.mifune.dev/install.sh | bash
```

The installer clones into `~/.openharness`, prompts to share your host
`gh` token, writes `.devcontainer/.env` with safe defaults, and brings
the sandbox up via `docker compose`.

## Enter the sandbox

```bash
cd ~/.openharness
make shell
```

You're now inside the isolated sandbox as the `sandbox` user. Working
directory: `/home/sandbox/harness`.

## Pick your harness

The sandbox ships with Claude Code, Codex, OpenCode, Pi, and DeepAgents
preinstalled, plus T3 Code on demand via `npx`. Authenticate at least one
before use:

- **[Claude Code](./agents/claude-code.md)**: run `claude` and follow the OAuth prompt
- **[Codex](./agents/codex.md)**: run `codex login`
- **[OpenCode](./agents/opencode.md)**: run `opencode auth login`
- **[Pi](./agents/pi.md)**: configure provider keys via environment variables
- **[DeepAgents](./agents/deepagents.md)**: write provider keys to `~/.deepagents/.env`
- **[T3 Code](./agents/t3code.md)**: authenticate one of Claude / Codex / OpenCode, then `npx t3` (browser UI on port 3773)

Claude Code remains the documented default. See
[the harnesses overview](./agents/overview) for the full list and
per-harness setup.

If `GH_TOKEN` was set during install, the entrypoint already ran
`gh auth login` and `gh auth setup-git` for you. Otherwise run them once
inside the shell:

```bash
gh auth login && gh auth setup-git
```

## Configuration

`.devcontainer/.env` is the single customization surface — generated with
safe defaults during install. The most-edited values:

| Var | Purpose |
|-----|---------|
| `SANDBOX_NAME` | Container/compose project name |
| `GH_TOKEN` | GitHub token for non-interactive auth |
| `TZ` | Container timezone |
| `INSTALL_AGENT_BROWSER` | Set `true` to install Chromium (~1 GB) |

Apply changes with `make destroy && make sandbox`.

For Postgres, Cloudflare tunnels, SSH, etc., chain compose overlays from `.devcontainer/`.

## Next steps

With the sandbox running, here's what to wire up next:

- Slack bridge for your sandbox agent → [integrations/slack.md](./integrations/slack.md)
- GitHub auth (only if you skipped `GH_TOKEN` at install) → [integrations/github.md](./integrations/github.md)
- Postgres via Compose overlay → [integrations/postgres.md](./integrations/postgres.md)
- Cloudflare tunnels for external access → [integrations/cloudflare.md](./integrations/cloudflare.md)

## Tear down

When you're finished, exit the shell and clean up from the host:

```bash
make destroy
```

This stops the container and removes its volumes. To keep auth credentials across rebuilds, stop without removing volumes:

```bash
make stop
```

Bring it back later with `make sandbox`.
