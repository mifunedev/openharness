---
sidebar_position: 2
title: "Container Runtime"
---

# Container Runtime

The sandbox container is the only runtime environment where agent code executes. Everything from the AI agent CLI to git, Node.js, Docker, and tmux is preinstalled in the image. The host only needs Docker.

## Image Base

The Dockerfile at `.devcontainer/Dockerfile` starts from `debian:bookworm-slim`. The following tools are installed in the image build:

| Layer | What is installed |
|-------|-------------------|
| System packages | `git`, `tmux`, `curl`, `jq`, `ripgrep`, `zsh`, `sudo`, `procps`, `iproute2` |
| Node.js 22.x | Via the NodeSource setup script |
| GitHub CLI | `gh` — used for `gh auth login`, `gh auth setup-git`, and PR/issue commands |
| Docker CLI + Compose | `docker-ce-cli`, `docker-compose-plugin` — for nested docker access and compose overlays |
| Cloudflared | Cloudflare tunnel daemon for public URL routing |
| Bun | Fast JS runtime and package manager |
| uv + uvx | Python package management (for Python-based agent tasks) |
| pnpm | Via corepack — package manager for the harness monorepo |
| Agent CLIs | Claude Code, Pi (`oh`/`pi`), and Codex installed globally via npm |

The Dockerfile copies `.devcontainer/entrypoint.sh` into the image as `/usr/local/bin/entrypoint.sh` and sets `ENTRYPOINT ["entrypoint.sh"]`, so container startup runs `.devcontainer/entrypoint.sh` directly. That script initializes git and auth state, reconciles host/container permissions, starts the cron runtime when enabled, and only sources `install/banner.sh` from the sandbox user's shell profile for interactive prompt status.

## Docker Compose Configuration

The primary compose file is `.devcontainer/docker-compose.yml`. It defines a single service named `sandbox` (default container name: `openharness`, overridable via `SANDBOX_NAME`).

Key configuration choices:

- `init: true` — a PID-1 init process ensures signals propagate cleanly to child processes.
- `restart: unless-stopped` — the container survives Docker daemon restarts unless explicitly stopped.
- `command: sleep infinity` — keeps the container alive; actual work happens inside named tmux sessions, not in the foreground process.
- `stdin_open: true` and `tty: true` — required for interactive shells via `docker exec`.

Optional overlays in `.devcontainer/` add services (Postgres, Cloudflare tunnel, SSH daemon, Slack bot) and are activated by listing them in `.openharness/config.json` under `composeOverrides`. The `/provision` skill reads that file and passes the correct `-f` flags to `docker compose up`.

## Bind Mounts

The container mounts the project root and several named volumes:

| Mount | Host path | Container path | Purpose |
|-------|-----------|---------------|---------|
| Project root | `..` (repo root) | `/home/sandbox/harness` | Source code, worktrees, workspace |
| OH config | `../.openharness` | `/home/sandbox/.openharness` | Sandbox config, Caddyfile, exposures |
| Docker socket | `/var/run/docker.sock` | `/var/run/docker.sock` | Nested docker for the `oh` CLI |
| Claude auth | named volume `claude-auth` | `/home/sandbox/.claude` | Claude Code credentials — persists across rebuilds |
| Pi auth | named volume `pi-auth` | `/home/sandbox/.pi` | Pi Agent OAuth tokens |
| Codex auth | named volume `codex-auth` | `/home/sandbox/.codex` | Codex credentials |
| Cloudflared | named volume `cloudflared-auth` | `/home/sandbox/.cloudflared` | Cloudflare tunnel credentials |
| GitHub CLI | named volume `gh-config` | `/home/sandbox/.config/gh` | `gh` auth tokens |

The bind-mount of the repo root at `/home/sandbox/harness` means files written inside the container appear immediately on the host filesystem (and vice versa). This is how git worktrees created with `git worktree add .worktrees/<branch> <branch>` are visible to both the host and all processes inside the container without any copy step.

The Docker socket mount gives the in-sandbox `docker` CLI access to the host Docker daemon, enabling nested container management — starting, stopping, and inspecting sibling containers from inside the sandbox.

## Caddy Gateway Overlay

The gateway overlay (`docker-compose.gateway.yml`, loaded when configured) runs a Caddy reverse proxy that routes HTTPS traffic to listening ports inside the sandbox. Routes are stored in `.openharness/exposures.json` and Caddy reloads its configuration in-process via its admin API on `127.0.0.1:2019` — never recreating the sandbox container.

URL shape depends on mode:

- **Laptop mode** (no `PUBLIC_DOMAIN`): `https://<name>.<sandbox>.localhost:8443` with self-signed TLS (`tls internal`).
- **Remote mode** (`PUBLIC_DOMAIN` set in `.devcontainer/.env`): `https://<name>.<sandbox>.<PUBLIC_DOMAIN>` with ACME or a Cloudflare named tunnel.

The Caddyfile at `.openharness/Caddyfile` is regenerated whenever `.openharness/exposures.json` changes and is gitignored. Do not hand-edit it.

## Environment Variables

Key variables the sandbox reads at runtime (set in `.devcontainer/.env` or passed via `docker compose`):

| Variable | Purpose |
|----------|---------|
| `SANDBOX_NAME` | Container and compose project name (default: `openharness`) |
| `TZ` | Timezone for cron scheduling (default: `America/Denver`) |
| `GH_TOKEN` | Pre-loaded GitHub token for `gh auth` automation |
| `GIT_USER_NAME`, `GIT_USER_EMAIL` | Git commit identity |
| `HEARTBEAT_ACTIVE_START`, `HEARTBEAT_ACTIVE_END` | Active window hours for heartbeat scheduling |
| `HEARTBEAT_AGENT` | Default agent CLI used by heartbeat tasks (default: `claude`) |
| `INSTALL_AGENT_BROWSER` | Set to `true` to install Chromium at startup (opt-in) |

## Repo Layout

```
open-harness/
├── .devcontainer/
│   ├── Dockerfile              # sandbox image: Debian + Node 22 + agent CLIs + pnpm
│   ├── docker-compose.yml      # base compose: SSH + workspace mount
│   ├── docker-compose.*.yml    # overlays: postgres, cloudflared, docker, ssh, git, slack
│   └── entrypoint.sh           # Docker GID matching + cron runtime + banner wiring
├── packages/sandbox/           # @openharness/sandbox (CLI + container lifecycle tools)
│   ├── src/
│   │   ├── cli/
│   │   │   ├── cli.ts          # subcommand routing, arg parsing, help text
│   │   │   └── index.ts        # CLI entry point (argv, exit codes)
│   │   ├── lib/
│   │   │   ├── config.ts       # SandboxConfig: name, compose files, env
│   │   │   ├── docker.ts       # compose command builders
│   │   │   └── exec.ts         # run/runSafe/capture helpers
│   │   └── tools/              # sandbox, run, stop, clean, shell, list, etc.
│   └── extensions/
│       └── sandbox.ts          # Pi Agent extension (tool + command registration)
├── install/
│   ├── .tmux.conf              # default tmux configuration copied into the image
│   ├── .zshrc                  # default shell configuration copied into the image
│   ├── banner.sh               # interactive shell status banner
│   └── cloudflared-tunnel.sh   # Cloudflare named-tunnel setup helper
├── workspace/                  # template workspace copied into each harness's worktree
│   ├── AGENTS.md               # operating procedures — decision rules, skills, sub-agents
│   ├── CLAUDE.md               # symlink → AGENTS.md (Claude Code reads this automatically)
│   ├── SOUL.md                 # agent personality, tone, values, guardrails
│   ├── IDENTITY.md             # name, role, mission, tech stack, URLs
│   ├── USER.md                 # owner preferences, constraints, goals
│   ├── TOOLS.md                # environment, available tools, service endpoints
│   ├── HEARTBEAT.md            # meta-maintenance routines
│   ├── MEMORY.md               # long-term memory (learned decisions, lessons)
│   ├── heartbeats/             # heartbeat task definitions (frontmatter .md files)
│   ├── startup.sh              # runs on container boot after onboarding
│   ├── memory/                 # daily activity logs (memory/YYYY-MM-DD/log.md)
│   ├── .claude/
│   │   ├── rules/              # coding standards (git, code-quality, nextjs, api, etc.)
│   │   ├── skills/             # reusable skill definitions
│   │   └── agents/             # sub-agent prompts (implementer, critic, pm, council)
│   ├── .slack/
│   │   └── MEMORY.md           # Slack-specific memory
│   └── projects/               # bring-your-own application code (gitignored or per-project)
├── docs/                       # plain markdown docs (GitHub-rendered, no build step)
├── .github/
│   ├── workflows/              # CI, Build, Release, Docs
│   └── ISSUE_TEMPLATE/         # agent, audit, bug, feature, skill, task
├── .openharness/
│   └── config.json             # compose overlay selection
└── .claude/skills/             # orchestrator skills (/provision, /repair, /release, etc.)
```

### Workspace identity files

The `workspace/` directory contains markdown files that define the agent's identity, procedures, and memory. The orchestrator scaffolds these during provisioning; the agent owns and evolves them once running.

| File | Purpose | Owner |
|------|---------|-------|
| `IDENTITY.md` | Name, role, mission, tech stack, URLs | Orchestrator → Agent |
| `SOUL.md` | Personality, tone, values, guardrails | Orchestrator → Agent |
| `USER.md` | Owner preferences, constraints, goals | User |
| `TOOLS.md` | Environment, tools, service endpoints | Orchestrator |
| `AGENTS.md` | Decision rules, skills, sub-agents | Orchestrator → Agent |
| `HEARTBEAT.md` | Meta-maintenance routines | Agent |
| `MEMORY.md` | Learned facts, decisions, lessons | Agent |

`CLAUDE.md` is a symlink to `AGENTS.md` so Claude Code loads operating procedures automatically.

See the [Workspace guide](../guide/workspace.md) for full details on each file and the ownership model. For how multiple agents share one sandbox via git worktrees, see [Worktrees](./worktrees.md).
