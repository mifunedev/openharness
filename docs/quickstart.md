---
sidebar_position: 3
title: "Quickstart"
---

# Quickstart

This guide takes you from zero to a running sandbox with an interactive shell in under five minutes. The only host dependency is [Docker](https://docs.docker.com/get-docker/).

## Before you start

Install Docker with the Compose plugin: [docs.docker.com/get-docker](https://docs.docker.com/get-docker/). Everything else runs inside the container.

## Option A — One-line install (recommended)

```bash
curl -fsSL https://oh.mifune.dev/install.sh | bash
```

The installer clones the repo into `~/openharness`, prompts for `SANDBOX_NAME` and `SANDBOX_PASSWORD`, writes `.devcontainer/.env`, and brings the sandbox up via `docker compose`. After the installer finishes, skip to [Step 4](#step-4-open-a-shell).

## Option B — Manual setup

### Step 1: Clone and configure

```bash
git clone https://github.com/ryaneggz/open-harness.git
cd open-harness
cp .devcontainer/.example.env .devcontainer/.env
```

Open `.devcontainer/.env` and set at minimum:

```bash
SANDBOX_NAME=openharness   # any name you like; this becomes the container name
GH_TOKEN=ghp_...           # optional but skips one onboarding step
```

### Step 2: Build and start the sandbox

```bash
docker compose -f .devcontainer/docker-compose.yml up -d --build
```

This is the canonical command for bringing the sandbox up. On a cold Docker cache it takes around ten minutes; subsequent starts are a few seconds.

### Step 3: Confirm it's healthy

```bash
docker compose -f .devcontainer/docker-compose.yml ps
```

You should see the sandbox container with status `running` (and `healthy` once the healthcheck passes).

### Step 4: Open a shell

```bash
docker exec -it -u sandbox openharness zsh
```

Replace `openharness` with whatever you set as `SANDBOX_NAME` in `.devcontainer/.env`. You're now inside the sandbox as the `sandbox` user; the working directory is `/home/sandbox/harness`.

### Step 5: One-time setup (inside the sandbox)

Run these once, inside the shell you just opened:

```bash
gh auth login            # GitHub CLI — lets the agent open PRs and issues
gh auth setup-git        # git credential helper (no SSH keys needed)
```

These write credentials into the sandbox home directory, not your host home.

### Step 6: Start the agent

```bash
claude                   # Claude Code — terminal coding agent
```

For Slack-driven Pi+Mom and other multi-agent setups, install the [`@ryaneggz/mifune`](https://github.com/ryaneggz/mifune) harness pack inside the sandbox.

You now have a working sandbox with an active agent session.

## Tear down

When you're finished, exit the shell and clean up from the host:

```bash
docker compose -f .devcontainer/docker-compose.yml down -v
```

This stops the container and removes its volumes. To keep auth credentials across rebuilds, stop without removing volumes:

```bash
docker compose -f .devcontainer/docker-compose.yml stop
```

Bring it back later with `docker compose -f .devcontainer/docker-compose.yml up -d`.

## Next steps

- [Onboarding](./onboarding) — detailed walkthrough of each auth step.
- [Sandbox Lifecycle](./sandbox-lifecycle) — full reference for `docker compose` lifecycle commands.
- [Connecting](./connecting) — VS Code and SSH alternatives to `docker exec`.
