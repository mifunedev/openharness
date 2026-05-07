---
sidebar_position: 2
title: "Installation"
---

# Installation

Open Harness is a Docker-based sandbox image. Installation is `docker compose` against `.devcontainer/docker-compose.yml` — there is no host CLI, agent, or Node toolchain required on the host.

## Prerequisites

| Dependency | Required for | Install |
|---|---|---|
| Docker (with Compose plugin) | Sandbox image | [docs.docker.com/get-docker](https://docs.docker.com/get-docker/) |
| git | Cloning the repo | [git-scm.com](https://git-scm.com/) |

That is the entire host requirement. Node.js, pnpm, and any AI CLI live inside the sandbox.

## One-line installer (recommended)

```bash
curl -fsSL https://oh.mifune.dev/install.sh | bash
```

The installer:

1. Verifies Docker and git are present.
2. Clones the repo into `~/.openharness` (or pulls latest if the directory already exists).
3. Prompts for `SANDBOX_NAME` and `SANDBOX_PASSWORD`, then writes `.devcontainer/.env`.
4. Runs `docker compose -f .devcontainer/docker-compose.yml up -d --build`.
5. Prints the next-step commands (open a shell, stop, tear down).

### Environment overrides

| Variable | Effect |
|---|---|
| `OH_INSTALL_REF=<git-ref>` | Pin the cloned repo to a specific tag or SHA instead of `main`. |
| `OH_ASSUME_YES=1` | Accept defaults at every prompt. |
| `SANDBOX_NAME=<name>` | Skip the "Container name" prompt. |
| `SANDBOX_PASSWORD=<value>` | Skip the credential prompt (used by the optional `sshd` overlay). |

`SANDBOX_NAME` and `SANDBOX_PASSWORD` resolve independently — set one and the other still prompts. Both fall back to defaults (`openharness` and `changeme`) when no TTY is available.

## Manual installation

Use this path when you want more control or are setting up a CI environment.

### 1. Clone the repository

```bash
git clone https://github.com/ryaneggz/open-harness.git
cd open-harness
```

### 2. Configure the environment

```bash
cp .devcontainer/.example.env .devcontainer/.env
```

Edit `.devcontainer/.env` and set your `SANDBOX_NAME` and any optional tokens. See the comments in `.example.env` for all available variables.

### 3. Build and start the sandbox

```bash
docker compose -f .devcontainer/docker-compose.yml up -d --build
```

On a cold Docker cache the build takes around ten minutes; subsequent starts are a few seconds.

### 4. Open a shell

```bash
docker exec -it -u sandbox openharness zsh
```

Replace `openharness` with whatever you set as `SANDBOX_NAME`.

## Next step

Once installed, proceed to the [Quickstart](./quickstart) to authenticate inside the sandbox and start an agent.

## What's Installed

The sandbox image ships a complete development environment. The only host dependency is Docker.

### Base image

Debian Bookworm (slim). The `sandbox` user has passwordless sudo.

### AI agent CLIs

| Tool | Command | Description |
|------|---------|-------------|
| Claude Code | `claude` | Anthropic's coding agent (aliased to `claude --dangerously-skip-permissions`) — default |
| OpenAI Codex | `codex` | OpenAI's coding agent (aliased to `codex --dangerously-bypass-approvals-and-sandbox`) |
| OpenCode | `opencode` | `opencode-ai` — terminal coding agent with OpenAI OAuth support |
| Pi | `pi` | `@mariozechner/pi-coding-agent` — local-first coding agent |
| DeepAgents | `deepagents` | LangChain's multi-provider terminal agent (`deepagents-cli` via `uv tool install`) — optional supported runtime |
| agent-browser | `agent-browser` | Headless Chromium for web-capable agents |

The Mom Slack bot ships in the [`@ryaneggz/mifune`](https://github.com/ryaneggz/mifune) harness pack. Install by cloning the pack into your sandbox and following its README.

### Runtimes & package managers

| Tool | Version |
|------|---------|
| Node.js | 22.x |
| pnpm | latest (via corepack) |
| Bun | latest |
| uv | latest (Python package manager) |

### DevOps & infrastructure

| Tool | Purpose |
|------|---------|
| Docker CLI + Compose | Container management from inside the sandbox (with docker overlay) |
| GitHub CLI (`gh`) | PRs, issues, releases from the terminal |
| cloudflared | Cloudflare Tunnel for public URLs to dev servers |
| tmux | Detachable terminal sessions for long-running agents |
| croner | Markdown-frontmatter cron scheduler for autonomous agent tasks |

### Utilities

| Tool | Purpose |
|------|---------|
| git | Version control |
| jq | JSON processing |
| ripgrep (`rg`) | Fast code search |
| curl, wget | HTTP clients |
| nano | Text editor |
| openssh-server | SSH server (enabled via sshd overlay) |
| bash-completion | Tab completion |

### Shell aliases

The sandbox user's `.bashrc` includes convenience aliases:

```
claude  → claude --dangerously-skip-permissions
codex   → codex --dangerously-bypass-approvals-and-sandbox
```

### Persistent volumes

Auth credentials survive container rebuilds via named Docker volumes:

- `claude-auth` → `~/.claude` (Claude Code OAuth) — or, with the [`claude-host` overlay](./guide/overlays.md#sharing-host-claude-state-claude-host), a RW bind-mount of your host `~/.claude`.
- `codex-auth` → `~/.codex` (Codex OAuth) — or, with the `codex-host` overlay, a RW bind-mount of your host `~/.codex`.
- `opencode-auth` → `~/.local/share/opencode` (OpenCode OAuth; `auth.json`) — or, with the [`opencode-host` overlay](./guide/overlays.md#sharing-host-opencode-state-opencode-host), a RW bind-mount of your host `~/.local/share/opencode`.
- `pi-auth` → `~/.pi` (Pi Agent OAuth) — or, with the `pi-host` overlay, a RW bind-mount of your host `~/.pi`.
- `deepagents-auth` → `~/.deepagents` (DeepAgents provider keys, memory, skills, sessions) — or, with the [`deepagents-host` overlay](./guide/overlays.md#sharing-host-deepagents-state-deepagents-host), a RW bind-mount of your host `~/.deepagents`. Repo-local `.deepagents/` is **project data** and follows normal `.gitignore` and code-review rules — never put secrets there.
- `cloudflared-auth` → `~/.cloudflared` (Cloudflare credentials)
- `gh-config` → `~/.config/gh` (GitHub CLI tokens)
