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

The installer clones into `~/openharness`, prompts to share your host
`gh` token, writes `.devcontainer/.env` with safe defaults, and brings
the sandbox up via `docker compose`.

## Enter the sandbox

```bash
cd ~/openharness
make shell
```

You're now inside the isolated sandbox as the `sandbox` user. Working
directory: `/home/sandbox/harness`.

## Pick your agent

The sandbox ships with several agent CLIs preinstalled. Launch whichever
you prefer:

```bash
claude        # Claude Code
codex         # OpenAI Codex CLI
pi            # Pi Coding Agent
```

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

For Postgres, Slack, SSH, the Caddy gateway, etc., chain compose overlays
— see [Compose overlays](./guide/overlays).

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

## Next steps

- [Onboarding](./onboarding) — detailed walkthrough of each auth step.
- [Sandbox Lifecycle](./sandbox-lifecycle) — full reference for `docker compose` lifecycle commands.
- [Connecting](./connecting) — VS Code and SSH alternatives to `docker exec`.
