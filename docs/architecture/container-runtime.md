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
| Agent CLIs | Claude Code, Pi (`oh`/`pi`), and Codex installed globally via npm; DeepAgents (`deepagents`) installed via `uv tool install deepagents-cli` into `/usr/local/bin` |

The Dockerfile copies `.devcontainer/entrypoint.sh` into the image as `/usr/local/bin/entrypoint.sh` and sets `ENTRYPOINT ["entrypoint.sh"]`, so container startup runs `.devcontainer/entrypoint.sh` directly. That script initializes git and auth state, reconciles host/container permissions, starts the cron runtime when enabled, and only sources `install/banner.sh` from the sandbox user's shell profile for interactive prompt status.

## Docker Compose Configuration

The primary compose file is `.devcontainer/docker-compose.yml`. It defines a single service named `sandbox` (default container name: `openharness`, overridable via `SANDBOX_NAME`).

Key configuration choices:

- `init: true` — a PID-1 init process ensures signals propagate cleanly to child processes.
- `restart: unless-stopped` — the container survives Docker daemon restarts unless explicitly stopped.
- `command: sleep infinity` — keeps the container alive; actual work happens inside named tmux sessions, not in the foreground process.
- `stdin_open: true` and `tty: true` — required for interactive shells via `docker exec`.

Optional overlays in `.devcontainer/` add services (Postgres, Cloudflare tunnel, SSH daemon, Slack bot) and are activated by listing them in `config.json` (at the repo root, gitignored — copy from `config.example.json` if missing) under `composeOverrides`. `make sandbox` and `scripts/install.sh` read that file via `jq` and pass the corresponding `-f` flags to `docker compose up`.

## Bind Mounts

The container mounts the project root and several named volumes:

| Mount | Host path | Container path | Purpose |
|-------|-----------|---------------|---------|
| Project root | `..` (repo root) | `/home/sandbox/harness` | Source code, worktrees, workspace |
| Docker socket | `/var/run/docker.sock` | `/var/run/docker.sock` | Nested docker for the `oh` CLI |
| Claude auth | named volume `claude-auth` | `/home/sandbox/.claude` | Claude Code credentials — persists across rebuilds |
| Pi auth | named volume `pi-auth` | `/home/sandbox/.pi` | Pi Agent OAuth tokens |
| Codex auth | named volume `codex-auth` | `/home/sandbox/.codex` | Codex credentials |
| DeepAgents state | named volume `deepagents-auth` | `/home/sandbox/.deepagents` | DeepAgents provider keys (`.env`), CLI defaults (`config.toml`), memory, skills, sessions. v1 persists only this path; repo-local `.deepagents/` is project data subject to normal git rules. |
| Cloudflared | named volume `cloudflared-auth` | `/home/sandbox/.cloudflared` | Cloudflare tunnel credentials |
| GitHub CLI | named volume `gh-config` | `/home/sandbox/.config/gh` | `gh` auth tokens |

The bind-mount of the repo root at `/home/sandbox/harness` means files written inside the container appear immediately on the host filesystem (and vice versa). This is how git worktrees created with `git worktree add .worktrees/<branch> <branch>` are visible to both the host and all processes inside the container without any copy step.

The Docker socket mount gives the in-sandbox `docker` CLI access to the host Docker daemon, enabling nested container management — starting, stopping, and inspecting sibling containers from inside the sandbox.

## Exposing Ports

There is no first-class exposure mechanism. Use the `cloudflared` overlay or stand up your own reverse proxy.

## Environment Variables

Key variables the sandbox reads at runtime (set in `.devcontainer/.env` or passed via `docker compose`):

| Variable | Purpose |
|----------|---------|
| `SANDBOX_NAME` | Container and compose project name (default: `openharness`) |
| `TZ` | Timezone for cron scheduling (default: `America/Denver`) |
| `GH_TOKEN` | Pre-loaded GitHub token for `gh auth` automation |
| `GIT_USER_NAME`, `GIT_USER_EMAIL` | Git commit identity |
| `CRONS_DIR` | Override directory scanned by `scripts/cron-runtime.ts` (default: `crons`) |
| `CRON_AGENT_BIN` | Agent binary invoked by cron fires (default: `claude`) |
| `INSTALL_AGENT_BROWSER` | Set to `true` to install Chromium at startup (opt-in) |

## Repo Layout {#repo-layout}

```
open-harness/
├── Makefile                    # top-level lifecycle (sandbox, shell, ps, destroy)
├── package.json                # root pnpm workspace + script entry points
├── pnpm-workspace.yaml         # declares apps/docs as the (only) workspace package
├── pnpm-lock.yaml              # pnpm lockfile
├── vitest.config.ts            # tests for scripts/__tests__/**/*.test.ts
├── .nvmrc                      # node version pin
├── CHANGELOG.md                # keep-a-changelog; CalVer at release
├── README.md                   # project intro + quickstart
├── AGENTS.md                   # orchestrator operating procedures (auto-loaded)
├── CLAUDE.md                   # symlink → AGENTS.md
├── LICENSE
├── CNAME                       # docs site DNS alias (Cloudflare Pages)
├── .dockerignore
├── .gitignore
├── .husky/                     # git hooks (pre-commit lint + test gate)
├── .github/
│   ├── workflows/              # CI: lint, test, build, release, docs deploy
│   └── ISSUE_TEMPLATE/         # agent / audit / bug / feature / skill / task
├── config.json                 # composeOverrides[] consumed by Makefile + install.sh (gitignored; copy from config.example.json)
├── .devcontainer/
│   ├── Dockerfile              # Debian + Node 22 + agent CLIs + pnpm
│   ├── docker-compose.yml      # base compose
│   ├── docker-compose.*.yml    # overlays (postgres, cloudflared, ssh, …)
│   ├── entrypoint.sh           # boot: docker GID, cron runtime, banner
│   └── .example.env            # template copied by install.sh on first run
├── .claude/
│   ├── rules/                  # symlink → context/rules/
│   ├── skills/                 # /release, /ci-status, /cloudflared-tunnel, /agent-browser
│   ├── agents/                 # sub-agent definitions (pm, critic, implementer, …)
│   ├── hooks/                  # security hooks (deny-env-dump, etc.)
│   └── specs/                  # architecture decision records
├── .codex/                     # parallel agent harness (mirrors .claude/ shape)
├── .pi/                        # Project-local Pi configuration + extensions
│   ├── extensions/             # Pi extension packages
│   │   ├── slack/              # Slack Socket Mode bridge as a Pi extension
│   │   ├── mifune-banner.ts    # (existing)
│   │   ├── single-line-footer.ts # (existing)
│   │   └── path-guard.ts       # (existing)
│   ├── install/                # Installation assets (Slack manifest, etc.)
│   ├── overlays/               # docker-compose overlay snippets (Slack env wiring, etc.)
│   ├── onboard-steps/          # Interactive onboarding helpers (Slack token setup, etc.)
│   ├── APPEND_SYSTEM.md        # System prompt addendum (agent guidance)
│   └── UPSTREAM.md             # Tracking behavioral source for Slack extension
├── apps/
│   └── docs/                   # Docusaurus documentation site (only workspace pkg)
├── blog/                       # Docusaurus blog source
├── context/                    # session-start identity files + canonical rules
│   ├── SOUL.md                 # voice and disposition
│   ├── IDENTITY.md             # operating principles + lessons learned
│   ├── TOOLS.md                # environment inventory
│   ├── USER.md                 # working-relationship patterns
│   └── rules/                  # auto-loaded coding/process rules — canonical, tool-agnostic
├── crons/                      # markdown-frontmatter cron defs — see crons doc (PR-B)
├── docs/                       # plain markdown (GitHub-rendered + Docusaurus source)
│   ├── architecture/           # runtime, layout, crons reference
│   ├── operations/             # provision, destroy, repair
│   ├── guide/                  # configuration, workspace, exposure, …
│   └── troubleshooting/        # reactive recipes — silent npx install, …
├── memory/                     # Long-term `MEMORY.md` and daily session logs (`YYYY-MM-DD/log.md`); see `context/rules/memory.md`
├── install/                    # files baked into the sandbox image
│   ├── banner.sh               # interactive shell banner
│   ├── cloudflared-tunnel.sh   # named-tunnel setup helper
│   ├── .tmux.conf              # default tmux config
│   └── .zshrc                  # default shell config
├── scripts/                    # orchestrator scripts
│   ├── cron-runtime.ts         # croner runtime — reads crons/*.md, schedules, fires
│   ├── ralph.sh                # Ralph PRD executor
│   ├── install.sh              # curl-piped installer
│   └── __tests__/              # vitest unit tests
├── tasks/                      # Ralph task workdirs (prd.json + progress.txt)
│   └── archive/                # weekly cleanup destination (cleanup-tasks cron)
├── workspace/                  # bind-mounted agent template
│   ├── AGENTS.md               # agent operating procedures
│   ├── CLAUDE.md               # symlink → AGENTS.md
│   ├── startup.sh              # runs on container boot after onboarding
│   └── .claude/                # workspace-scoped rules, skills, settings
└── .worktrees/                 # README only — branch worktrees + project clones gitignored
    └── README.md               # § Worktrees + project/<name>/ convention
```

Claude Code auto-loads `context/rules/` via the `.claude/rules` symlink at the repo root. Codex and Pi have no rules-loading feature; tools that want the conventions read `context/rules/` directly.

Each top-level directory whose intent isn't obvious from its name carries
a `README.md` per `.claude/rules/directory-readme.md` — currently
`apps/`, `crons/`, `scripts/`, `tasks/`, and `.worktrees/`. The
`.worktrees/` README is the only file tracked under that path; everything
else inside is gitignored.

**Excluded from this tree** (gitignored or build artefacts): `node_modules/`, `.pnpm-store/`, transient contents of `.worktrees/` (per-branch worktrees + `.worktrees/project/<name>/` clones).

### Workspace identity files

The `workspace/` directory is a minimal bind-mounted template. It contains the agent's operating procedures and a workspace-scoped `.claude/` directory; the agent owns and evolves these once running.

| File | Purpose | Owner |
|------|---------|-------|
| `AGENTS.md` | Decision rules, skills, sub-agents | Orchestrator → Agent |
| `CLAUDE.md` | Symlink → `AGENTS.md` (Claude Code reads automatically) | Orchestrator |
| `startup.sh` | Runs on container boot after onboarding | Orchestrator |
| `.claude/` | Workspace-scoped rules, skills, settings | Orchestrator → Agent |

Session-start identity files (`SOUL.md`, `IDENTITY.md`, `TOOLS.md`, `USER.md`) live in the top-level `context/` directory, not inside `workspace/`.

See the [Workspace guide](../guide/workspace.md) for full details on each file and the ownership model.
