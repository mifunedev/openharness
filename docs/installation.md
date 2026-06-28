---
sidebar_position: 2
title: "Installation"
---

# Installation

Open Harness is a portable harness — a single repo that boots an isolated Docker sandbox for your project. Installation clones the repo and runs `docker compose` against `.devcontainer/docker-compose.yml` — there is no host CLI, agent, or Node toolchain required on the host.

## Prerequisites

| Dependency | Required for | Install |
|---|---|---|
| Docker (with Compose plugin) | Sandbox image | [docs.docker.com/get-docker](https://docs.docker.com/get-docker/) |
| git | Cloning the repo | [git-scm.com](https://git-scm.com/) |

That is the entire host requirement. Node.js, pnpm, and any AI CLI live inside the sandbox.

## Self-hosting: I already have a clone

If you've already cloned your fork — or cloned upstream and re-pointed the remote — run the installer from inside the directory. It auto-detects the local repo and skips any network clone:

```bash
cd <your-clone>
bash .oh/scripts/install.sh
```

The installer prompts for `SANDBOX_NAME`, writes `.devcontainer/.env`, and starts the sandbox. No `OH_GITHUB_REPO` environment variable required.

### Fork-and-clone

1. Fork `mifunedev/openharness` on GitHub.
2. Clone your fork:
   ```bash
   git clone https://github.com/<your-org>/<your-fork>.git && cd <your-fork>
   ```
3. Run the installer — it detects the local clone automatically:
   ```bash
   bash .oh/scripts/install.sh
   ```

### Clone-and-own (re-point)

1. Clone upstream:
   ```bash
   git clone https://github.com/mifunedev/openharness.git my-harness && cd my-harness
   ```
2. Re-point origin to your repo:
   ```bash
   git remote set-url origin https://github.com/<your-org>/<your-repo>.git
   ```
3. Run the installer:
   ```bash
   bash .oh/scripts/install.sh
   ```

## One-line installer (upstream only)

```bash
curl -fsSL https://oh.mifune.dev/install.sh | bash
```

### Review-first install

Keep the one-liner for fast setup, but use this dependency-free flow when you want to inspect the remote installer first:

```bash
curl -fsSL -o openharness-install.sh https://oh.mifune.dev/install.sh
# Review openharness-install.sh in your editor or pager before running it.
bash openharness-install.sh
```

If you already use [`vet`](https://github.com/vet-run/vet), `vet https://oh.mifune.dev/install.sh` provides a fetch/diff/ShellCheck/preview/approve wrapper for the same installer. `vet` is optional; Open Harness itself requires Docker with Compose and Git.

The installer:

1. Verifies Docker and git are present.
2. Clones the repo into `~/.openharness` (or pulls latest if the directory already exists).
3. Prompts for `SANDBOX_NAME`, then writes `.devcontainer/.env`.
4. Runs `docker compose -f .devcontainer/docker-compose.yml up -d --build`.
5. Prints the next-step commands (open a shell, stop, tear down).

### Environment overrides

| Variable | Effect |
|---|---|
| `OH_GITHUB_REPO=<owner>/<repo>` | GitHub repository to clone (default: `mifunedev/openharness`). Set to your fork's slug to install your fork's code. |
| `OH_GITHUB_REF=<git-ref>` | Pin the cloned repo to a specific tag, branch, or SHA instead of `main`. |
| `OH_INSTALL_REF=<git-ref>` | Back-compat alias for `OH_GITHUB_REF`. Both names work; `OH_GITHUB_REF` takes precedence when both are set. |
| `OH_ASSUME_YES=1` | Accept defaults at every prompt. |
| `SANDBOX_NAME=<name>` | Skip the "Container name" prompt. |

`SANDBOX_NAME` falls back to the default (`openharness`) when no TTY is available.

### Forking this harness

To install your fork instead of the upstream repo, run the installer directly from your fork's raw URL and set `OH_GITHUB_REPO` to your fork's slug:

```bash
OH_GITHUB_REPO=<your-org>/<your-fork> curl -fsSL \
  https://raw.githubusercontent.com/<your-org>/<your-fork>/main/scripts/install.sh | bash
```

Review-first fork install:

```bash
curl -fsSL -o openharness-install.sh \
  https://raw.githubusercontent.com/<your-org>/<your-fork>/main/scripts/install.sh
# Review openharness-install.sh, then run it against your fork.
OH_GITHUB_REPO=<your-org>/<your-fork> bash openharness-install.sh
```

If your fork uses a default branch other than `main`, set `OH_GITHUB_REF=<branch>` and replace `main` in the URL. Forks restructuring `.devcontainer/` should also patch the local-run detection in `scripts/install.sh` (the `-f .devcontainer/docker-compose.yml` check near line 173) to match the new layout.

## Manual installation

Use this path when you want more control or are setting up a CI environment.

### 1. Clone the repository

```bash
# Forkers: substitute your fork URL here.
git clone https://github.com/mifunedev/openharness.git
cd openharness
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

Check the sandbox health before attaching:

```bash
docker ps --filter "name=openharness" --format "{{.Names}} {{.Status}}"
docker inspect --format '{{json .State.Health}}' openharness
```

A healthy sandbox reports the tmux-managed runtime sessions (`cron-watchdog` and `cron-system`) as available; optional Slack and Hermes dashboard sessions are checked only when configured. To debug a failure from inside the container, run `bash /home/sandbox/harness/.oh/scripts/sandbox-healthcheck.sh` for the exact missing session. For a temporary local escape hatch, add a Compose override with `services.sandbox.healthcheck.disable: true`; do not commit that override unless you are deliberately changing the harness health policy.

### 4. Open a shell

```bash
docker exec -it -u sandbox openharness zsh
```

Replace `openharness` with whatever you set as `SANDBOX_NAME`.

## Next step

Once installed, proceed to the [Quickstart](./quickstart) to authenticate inside the sandbox and start an agent.

## What's Installed

The sandbox image ships a complete development environment. The required host dependencies are Docker with the Compose plugin and Git.

Project-local Pi packages are loaded from `.pi/settings.json`; the defaults include `@tintinweb/pi-subagents`, `@tintinweb/pi-tasks`, `@narumitw/pi-goal`, `@narumitw/pi-plan-mode`, `@narumitw/pi-codex-usage@0.6.2` for `/codex-status` plus fixed statusline usage timers, `@tifan/pi-recap` for `/recap` plus automatic idle/resume session summaries, `@trevonistrevon/pi-loop` for Monitor/Loop tools, `@guwidoe/pi-prompt-suggester` for next-prompt suggestions, `pi-autoresearch` for autonomous metric-optimization loops, and `pi-dynamic-workflows` for workflow-script fan-out through isolated Pi subagents.

### Base image

Debian Bookworm (slim). The `sandbox` user has passwordless sudo.

### AI agent CLIs

Default CLIs are always present. Optional CLIs are excluded from the default image and installed at image build time when their `harness.yaml` install key (or legacy `.devcontainer/.env` flag) is enabled.

| Tool | Command | Source | Status |
|------|---------|--------|--------|
| Claude Code | `claude` | Anthropic's coding agent (aliased to `claude --dangerously-skip-permissions`) | default |
| OpenAI Codex | `codex` | OpenAI's coding agent (aliased to `codex --dangerously-bypass-approvals-and-sandbox`) | default |
| Pi | `pi` | `@earendil-works/pi-coding-agent` — local-first coding agent (was `@mariozechner/pi-coding-agent`, now deprecated) | default |
| OpenCode | `opencode` | `opencode-ai` — terminal coding agent with OpenAI OAuth support | optional: set `install.opencode: true` in `harness.yaml` (or `INSTALL_OPENCODE=true` in `.devcontainer/.env`) |
| DeepAgents | `deepagents` | LangChain's multi-provider terminal agent (`deepagents-cli` via `uv tool install`) | optional: set `install.deepagents: true` in `harness.yaml` (or `INSTALL_DEEPAGENTS=true` in `.devcontainer/.env`) |
| Hermes | `hermes` | Nous Research's self-improving agent CLI | optional: set `install.hermes: true` in `harness.yaml` (or `INSTALL_HERMES=true` in `.devcontainer/.env`) |
| Grok Build | `grok` | xAI's proprietary Grok Build CLI (`@xai-official/grok@0.2.39`, Node >=20) | optional: set `install.grok_build: true` in `harness.yaml` (or `INSTALL_GROK_BUILD=true` in `.devcontainer/.env`) |
| agent-browser | `agent-browser` | Headless Chromium for web-capable agents | optional: set `install.agent_browser: true` in `harness.yaml` (or `INSTALL_AGENT_BROWSER=true` in `.devcontainer/.env`) |

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
| Docker CLI + Compose | Container management from inside the sandbox (host docker socket bind-mounted by the base compose) |
| GitHub CLI (`gh`) | PRs, issues, releases from the terminal |
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
| openssh-client | `ssh-keygen` for GitHub auth flows |
| bash-completion | Tab completion |

### Shell aliases

The sandbox user's `.bashrc` includes convenience aliases:

```
claude  → claude --dangerously-skip-permissions
codex   → codex --dangerously-bypass-approvals-and-sandbox
```

### Persistent volumes

Auth credentials survive container rebuilds via named Docker volumes:

- `claude-auth` → `~/.claude` (Claude Code OAuth)
- `codex-auth` → `~/.codex` (Codex OAuth)
- `opencode-auth` → `~/.local/share/opencode` (OpenCode OAuth; `auth.json`)
- `pi-auth` → `~/.pi` (Pi Agent OAuth)
- `deepagents-auth` → `~/.deepagents` (DeepAgents provider keys, memory, skills, sessions; used when DeepAgents is enabled (`install.deepagents: true` in `harness.yaml`)). Repo-local `.deepagents/` is **project data** and follows normal `.gitignore` and code-review rules — never put secrets there.
- `hermes-auth` → `~/.hermes` (Hermes auth only; non-auth runtime state defaults to project-local `~/harness/.hermes` when Hermes is enabled (`install.hermes: true` in `harness.yaml`))
- `grok-auth` → `~/.grok` (all Grok Build user state: auth, config, sessions, memory, skills/plugins, logs; mounted alongside the other agent auth volumes and used by Grok Build when `install.grok_build: true` in `harness.yaml`). Cached OAuth/session state in `~/.grok/auth.json` takes precedence over `XAI_API_KEY`; if an API key seems ignored, run `grok logout` or reset the volume.
- `cloudflared-auth` → `~/.cloudflared` (Cloudflare tunnel credentials, when used)
- `gh-config` → `~/.config/gh` (GitHub CLI tokens)

Hermes is split: when Hermes is enabled (`install.hermes: true` in `harness.yaml`), `HERMES_HOME` defaults to the project-local bind-mounted `~/harness/.hermes/` directory, while auth remains in the `~/.hermes` named volume and is linked into the project-local home as `auth.json`. The entrypoint links `.hermes/skills/openharness` to the tracked shared skill directory (`.mifune/skills/`) so Hermes sees the same harness skills as Claude, Codex, and Pi without copying them into runtime state. Project-local runtime contents are gitignored except `.hermes/README.md`; `make destroy` removes the auth volume but not the bind-mounted project runtime directory.

`make destroy` and `docker compose down -v` remove named volumes, including `grok-auth`; use `make stop` when you want Grok Build credentials and state to survive.

Downstream harness packs and Pi extensions can introduce additional volumes or bind-mount overlays by listing tracked compose files under `compose.overrides:` in `harness.yaml`, or by adding user-local files to `composeOverrides[]` in `config.json` (gitignored).
