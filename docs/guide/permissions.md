---
title: "Permissions & Security"
sidebar_position: 3
---


Sandboxes are designed as trusted, isolated environments where AI agents operate with full permissions. Docker provides the isolation boundary — everything inside the container is disposable and self-contained.

## The sandbox user

The container runs as a non-root user named `sandbox` with:
- **Passwordless sudo** — the agent can install packages, modify system config, etc.
- **Docker group membership** — access to the Docker socket when the `docker` overlay is enabled
- **Home directory** at `/home/sandbox/`

The user is created by the Dockerfile:
```
useradd -m -s /bin/bash sandbox
echo "sandbox ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/sandbox
```

## Agent permission modes

AI coding agents normally prompt for permission before running commands or editing files. Inside the sandbox, these prompts are disabled because the container is the isolation boundary:

| Agent | Flag | Alias |
|-------|------|-------|
| Claude Code | `--dangerously-skip-permissions` | `claude` (aliased in .bashrc) |
| OpenAI Codex | `--dangerously-bypass-approvals-and-sandbox` | `codex` (aliased in .bashrc) |
| DeepAgents | `-y --shell-allow-list recommended` (Ralph default) | none — call `deepagents` directly |

The env var `CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS=true` is also set in the base compose file so Claude Code operates without prompts even when invoked by heartbeats or the Slack bot.

### DeepAgents shell allow list

DeepAgents **disables shell execution in non-interactive (`-n`) mode unless a shell allow list is configured** via `-S`/`--shell-allow-list` or the `DEEPAGENTS_CLI_SHELL_ALLOW_LIST` env var. Open Harness defaults to `recommended` (a curated safe set), never `all`.

The Ralph harness (`scripts/ralph.sh --harness=deepagents`) exposes two overrides:

- `RALPH_DEEPAGENTS_FLAGS` — override the flag string (default `-y --shell-allow-list recommended -q --no-stream`). Operators can opt into `--shell-allow-list all` here when they accept unrestricted shell execution. **Do not include `--max-turns` in this string** — the cap is appended separately.
- `RALPH_DEEPAGENTS_MAX_TURNS` — per-call turn cap (default `25`), always appended as `--max-turns "$RALPH_DEEPAGENTS_MAX_TURNS"` so a single DeepAgents call cannot hang the iteration.

> **`--shell-allow-list all` warning.** Combined with the mounted Docker socket (enabled by default in the base compose file), unrestricted shell execution can affect sibling containers or the host Docker daemon. Combined with the `deepagents-host` overlay, it can also reach raw host provider keys. Only use `all` for trusted tasks where you have accepted that risk.

## Docker socket access

The `docker` compose overlay mounts `/var/run/docker.sock` into the container, allowing agents to:
- Build and run Docker containers (Docker-in-Docker pattern)
- Manage sibling containers on the same host
- Access `host.docker.internal` for host networking

This is enabled by default. If your agent doesn't need Docker access, remove the docker overlay from `.openharness/config.json`.

## Isolation model

| Boundary | What it protects |
|----------|-----------------|
| Docker container | Host filesystem, host processes, host network (by default) |
| Named volumes | Agent auth tokens (claude-auth, codex-auth, pi-auth, deepagents-auth, gh-config, cloudflared-auth) survive rebuilds but are container-scoped |
| Bind mount | workspace/ is shared between host and container — the only intentional bridge |
| Network | Containers are on the default Docker bridge. Overlays like postgres create dedicated networks. |

## What agents CAN do inside the sandbox

- Install system packages (apt, etc.)
- Run arbitrary shell commands
- Create/delete files anywhere in the container
- Access the internet (curl, wget, git clone, npm install)
- Run Docker containers (with docker overlay)
- Schedule cron jobs (heartbeats)
- Start long-running processes in tmux sessions

## What agents CANNOT do (without additional config)

- Access the host filesystem outside the bind mount
- Access other containers' volumes
- Listen on host ports (unless port mapping is configured, e.g., sshd overlay)
- Survive container removal (volumes persist, but container state doesn't)

## SSH access security

When the `sshd` overlay is enabled:
- Password auth uses `SANDBOX_PASSWORD` from `.env` (default: `changeme`)
- **Change the default password** for any internet-facing or shared server
- SSH keys from the host can be forwarded via `ForwardAgent yes` in `~/.ssh/config`
- See [Multi-Sandbox SSH](./multi-sandbox-ssh.md) for port allocation

## Recommendations

- **Local development**: defaults are fine — the container is your isolation boundary
- **Shared server**: change `SANDBOX_PASSWORD`, restrict Docker socket access if agents don't need it
- **Internet-facing**: use Cloudflare Tunnel (cloudflared overlay) instead of exposing ports directly. If SSH must be exposed, use key-based auth instead of passwords.
