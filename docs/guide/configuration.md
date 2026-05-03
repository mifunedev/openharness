---
title: "Configuration"
sidebar_position: 1
---


All sandbox configuration is done through environment variables. Docker Compose and the `openharness` CLI read `.devcontainer/.env` directly.

## Setup

Copy the example env file and edit to taste:

```bash
cp .devcontainer/.example.env .devcontainer/.env
```

The `.example.env` file contains all available variables with comments explaining each one.

## Environment Variables

### Sandbox

| Variable | Default | Description |
|----------|---------|-------------|
| `SANDBOX_NAME` | `openharness` | Name used for the Docker container, compose project, and CLI commands (e.g. `openharness shell $SANDBOX_NAME`) |
| `SANDBOX_PASSWORD` | `changeme` | Password for the `sandbox` Linux user. Only takes effect when the [sshd overlay](./overlays.md#ssh-server-access) is active — used for SSH login. Without the overlay, no password is set. |

### Timezone

| Variable | Default | Description |
|----------|---------|-------------|
| `TZ` | `America/Denver` | Container timezone. Affects cron schedules, log timestamps, and time-aware tools inside the sandbox. |

### Crons

Recurring tasks are `.md` files in `crons/` at the repo root, parsed by the croner runtime (see SPEC v0.7 §"Croner runtime"). Each file's YAML frontmatter sets `id`, `schedule`, `timezone`, `enabled`, `overlap`, `catchup`; the body is passed to the agent CLI when the schedule fires. The runtime launches in the `system-cron` tmux session at container start.

| Variable | Default | Description |
|----------|---------|-------------|
| `CRON_AGENT_BIN` | `claude` | Agent binary the croner runtime invokes when a schedule fires. The body of the `.md` is passed as the prompt. |

### SSH (overlay)

Only applies when an SSH overlay is enabled. See [overlays](./overlays.md#ssh-key-strategy).

| Variable | Default | Description |
|----------|---------|-------------|
| `HOST_SSH_DIR` | _(empty)_ | Path to your host SSH directory, mounted read-only into the container. Lets git inside the sandbox use your existing SSH keys. **Setting this automatically enables the `ssh.yml` overlay** — no need to add it to `config.json` manually. |

### Slack bot (via [`@ryaneggz/mifune`](https://github.com/ryaneggz/mifune) pack)

The Slack bot ships with the `@ryaneggz/mifune` harness pack — install by cloning it into your workspace (`git clone https://github.com/ryaneggz/mifune workspace/mifune`) and following the pack's README. The bot (Mom) connects to a Slack workspace via Socket Mode and responds to messages using an AI agent.

| Variable | Default | Description |
|----------|---------|-------------|
| `SLACK_APP_TOKEN` | _(empty)_ | Slack app-level token for Socket Mode connection (starts with `xapp-`). Required to connect to Slack. |
| `SLACK_BOT_TOKEN` | _(empty)_ | Slack bot OAuth token for posting messages (starts with `xoxb-`). Required to send replies. |

## Precedence

Docker Compose resolves variables in this order:

1. Shell environment (e.g. `SANDBOX_NAME=foo docker compose up`)
2. `.devcontainer/.env` (host-side sandbox configuration)
3. Default values in `docker-compose.yml` (the `:-` fallbacks)

Shell environment always wins, so you can override `.env` values inline on the command line.
