---
title: "Installation"
---

# Installation

Open Harness is a portable harness — a single repo that boots an isolated Docker sandbox for your project. Installation clones the repo and runs `docker compose` against `.devcontainer/docker-compose.yml` — there is no host CLI, agent, or Node toolchain required on the host.

## Prerequisites

| Dependency | Required for | Install |
|---|---|---|
| Docker (with Compose plugin) | Sandbox image | [docs.docker.com/get-docker](https://docs.docker.com/get-docker/) |
| git | Cloning the repo | [git-scm.com](https://git-scm.com/) |
| make (build-essential) | The `make sandbox` / `make shell` / `make destroy` wrappers around `docker compose` | `sudo apt-get install build-essential` (Debian/Ubuntu) · Xcode Command Line Tools (macOS) |

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
   git clone --recurse-submodules https://github.com/<your-org>/<your-fork>.git && cd <your-fork>
   ```
3. Run the installer — it detects the local clone automatically:
   ```bash
   bash .oh/scripts/install.sh
   ```

### Clone-and-own: private origin and upstream (recommended)

The validated path for running your own long-lived harness: clone upstream, make
**your** repo the `origin`, and keep `mifunedev/openharness` as `upstream` so you can
pull framework updates and open PRs back. Creating the private repo and setting the
remotes happens **inside the sandbox**, after GitHub auth, so the SSH key generated
there is the one used for pushes.

1. Clone upstream, materialize/edit local `harness.yaml`, then bring the sandbox up and open a shell:
   ```bash
   git clone --recurse-submodules https://github.com/mifunedev/openharness.git ~/.openharness
   cd ~/.openharness
   make harness-config # copies tracked harness.yaml.example to local gitignored harness.yaml if missing
   nano harness.yaml   # set sandbox.name, sandbox.timezone, git.user_name/user_email,
                       # optional installs — see Quickstart → Configuration. Do this BEFORE building.
   make sandbox        # build + start the container (~10 min cold)
   make shell          # attach as the sandbox user
   herdr              # first inside-sandbox command
   ```
2. **Inside the initial Herdr pane**, authenticate GitHub over SSH — choose SSH as the protocol
   and let `gh` generate a key (details: [GitHub auth](./integrations/github.md)):
   ```bash
   gh auth login       # GitHub.com → SSH → generate a new SSH key → paste a token
   gh auth setup-git
   ```
3. Still inside the sandbox, create your own **private** repo, make it `origin`, and
   add upstream — all over SSH so the key from step 2 is used:
   ```bash
   gh repo create <your-user>/openharness --private
   git remote set-url origin git@github.com:<your-user>/openharness.git
   git remote add upstream git@github.com:mifunedev/openharness.git
   git push -u origin HEAD
   ```
   Pull framework updates later with `git fetch upstream && git merge upstream/development`;
   contribute back by opening PRs from your repo to `mifunedev/openharness`.

> Prefer HTTPS or an installer-driven bring-up? Re-point origin to your repo with
> `git remote set-url origin https://github.com/<your-org>/<your-repo>.git` and run
> `bash .oh/scripts/install.sh` instead of `make sandbox` — the installer detects the
> local clone automatically.

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

Open Harness requires Docker with Compose, Git, and make (see [Prerequisites](#prerequisites)).

The installer:

1. Verifies Docker and git are present (warns if `make`, used by the lifecycle targets, is missing).
2. Clones the repo into `~/.openharness` (or pulls latest if the directory already exists).
3. Prompts for `SANDBOX_NAME`, then writes `.devcontainer/.env`.
4. Creates `harness.yaml` from `harness.yaml.example` when missing (all keys commented — inert until you edit).
5. Runs `docker compose -f .devcontainer/docker-compose.yml up -d --build`.
6. Prints the next-step commands (open a shell, stop, tear down).

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
  https://raw.githubusercontent.com/<your-org>/<your-fork>/main/.oh/scripts/install.sh | bash
```

Review-first fork install:

```bash
curl -fsSL -o openharness-install.sh \
  https://raw.githubusercontent.com/<your-org>/<your-fork>/main/.oh/scripts/install.sh
# Review openharness-install.sh, then run it against your fork.
OH_GITHUB_REPO=<your-org>/<your-fork> bash openharness-install.sh
```

If your fork uses a default branch other than `main`, set `OH_GITHUB_REF=<branch>` and replace `main` in the URL. Forks restructuring the build assets should also patch the local-run detection in `.oh/scripts/install.sh` (the `-f .devcontainer/docker-compose.yml` check) to match the new layout.

## Manual installation

Use this path when you want more control or are setting up a CI environment.

### 1. Clone the repository

```bash
# Forkers: substitute your fork URL here.
git clone --recurse-submodules https://github.com/mifunedev/openharness.git
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

On a cold Docker cache the build takes around ten minutes; subsequent starts are a few seconds. To skip the build entirely and pull the prebuilt release image instead, see [Prebuilt-image deployment](deployment-prebuilt-image.md) (`docker compose … up -d --no-build` with `OH_SANDBOX_IMAGE` set, or `oh sandbox --image`).

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

## Standalone CLI (`oh`): equip an existing repo

Every path above clones the harness repo itself and keeps the host toolchain-free — no Node required. The standalone `oh` CLI path is different: it equips **your existing project repo** with the harness and drives the sandbox without keeping an OpenHarness checkout around. This path — and only this path — requires on the host:

| Dependency | Required for |
|---|---|
| Node.js ≥ 20 (22 recommended) | Running the `oh` binary (`get-oh.sh` offers to install nvm + Node 22 if missing) |
| git | The shallow clone behind `--from-remote` |
| Docker (with Compose plugin) | `oh sandbox` / `oh shell` |

`make` is **not** needed here — the verbs wrap the vendored `.oh/scripts/` directly.

**Get the `oh` command from npm (recommended if you have Node):** the CLI is published as [`@mifune/openharness`](https://www.npmjs.com/package/@mifune/openharness). If Node.js ≥ 20 is already on your host, install it globally or run it zero-install:

```bash
npm install -g @mifune/openharness   # puts `oh` on your PATH
# ...or, without a global install:
npx @mifune/openharness init
```

The published package is the same single self-contained bundle — `oh init`/`oh update` fetch their scaffold payload on demand (no repo clone). npm does **not** install Node; Node ≥ 20 must already be on your PATH (that is exactly what `get-oh.sh` bootstraps below).

**No npm, or no Node yet?** Bootstrap with `get-oh.sh` instead. It installs the single self-contained `oh` binary to `~/.local/bin/oh` — **no repo clone**, and it does not touch an existing `~/.openharness` sandbox. It prefers a prebuilt bundle (`oh.mifune.dev/oh.js`) and falls back to building from source in a temp dir. If Node.js ≥ 20 is missing, it offers to install nvm + Node 22 and sources it so `oh` works in the same shell. `oh init` fetches its scaffold payload on demand.

```bash
curl -fsSL https://oh.mifune.dev/get-oh.sh | bash
```

**Use `oh` immediately in the current shell** — `source` the installer instead of piping to `bash` so it installs *and* puts `oh` on your PATH in the running shell (no new terminal, no re-login):

```bash
source <(curl -fsSL https://oh.mifune.dev/get-oh.sh)
```

If you already used the plain `curl … | bash` form and `oh` isn't found yet, add its install dir to the current shell's PATH: `export PATH="$HOME/.local/bin:$PATH"`.

Review-first alternative (no extra dependency):

```bash
curl -fsSL -o get-oh.sh https://oh.mifune.dev/get-oh.sh
# Review get-oh.sh in your editor or pager before running it.
bash get-oh.sh
```

Environment overrides: `OH_BIN_DIR=<dir>` (install location, default `~/.local/bin`), `OH_JS_URL=<url>` (prebuilt bundle URL), `OH_GITHUB_REPO=<org>/<fork>` / `OH_GITHUB_REF=<ref>` (source for the build fallback), `OH_NVM_VERSION=<tag>` (nvm version for the Node install), `--yes`/`--no` (auto-accept/decline the Node-install prompt).

**From an existing checkout (no bootstrap script):** `cd .oh/cli && npm install && npm run build`, then put `dist/oh.js` on your PATH as `oh`.

Then, in any project:

```bash
cd <your-project>
oh init                 # equip the repo — vendors the .oh/ payload from the local
                        # clone (offline). Use --from-remote to shallow-clone a
                        # fresh payload instead; pin a version with --ref <tag|branch>
oh sandbox              # provision + start the sandbox (docker compose up -d --build)
oh sandbox --image      # ...or pull the prebuilt release image and skip the local build
oh shell                # zsh in the running container (or: oh shell <container>)
oh gateway status       # manage messaging client sessions (pi|hermes)
```

`oh sandbox --image` (and the `sandbox.image` key in `harness.yaml`) run the
published `ghcr.io/mifunedev/openharness` image instead of building locally — see
[Prebuilt-image deployment](deployment-prebuilt-image.md).

`--from-remote` fetches over public HTTPS only — private or credential-prompting remotes fail fast (`GIT_TERMINAL_PROMPT=0`); offline, use `oh init --from <local-checkout>` instead. Repos equipped this way mount your project at `/home/sandbox/project` inside the sandbox (the clone paths above use `/home/sandbox/harness`). Upgrade the vendored `.oh/` later with `oh update --from-remote [--ref <ref>]`.

## Next step

Once installed, proceed to the [Quickstart](./quickstart) to authenticate inside the sandbox and start an agent.

## What's Installed

The sandbox image ships a complete development environment. The required host dependencies are Docker with the Compose plugin, Git, and make (see [Prerequisites](#prerequisites)).

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
| Herdr (`herdr`) | Default multi-agent terminal workspace; state persists across rebuilds in dedicated volumes |
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

Auth credentials and Herdr workspace state survive container rebuilds via named Docker volumes:

- `claude-auth` → `~/.claude` (Claude Code OAuth)
- `codex-auth` → `~/.codex` (Codex OAuth)
- `opencode-auth` → `~/.local/share/opencode` (OpenCode OAuth; `auth.json`)
- `pi-auth` → `~/.pi` (Pi Agent OAuth)
- `deepagents-auth` → `~/.deepagents` (DeepAgents provider keys, memory, skills, sessions; used when DeepAgents is enabled (`install.deepagents: true` in `harness.yaml`)). Repo-local `.deepagents/` is **project data** and follows normal `.gitignore` and code-review rules — never put secrets there.
- `hermes-auth` → `~/.hermes` (Hermes auth only; non-auth runtime state defaults to project-local `~/harness/.hermes` when Hermes is enabled (`install.hermes: true` in `harness.yaml`))
- `grok-auth` → `~/.grok` (all Grok Build user state: auth, config, sessions, memory, skills/plugins, logs; mounted alongside the other agent auth volumes and used by Grok Build when `install.grok_build: true` in `harness.yaml`). Cached OAuth/session state in `~/.grok/auth.json` takes precedence over `XAI_API_KEY`; if an API key seems ignored, run `grok logout` or reset the volume.
- `cloudflared-auth` → `~/.cloudflared` (Cloudflare tunnel credentials, when used)
- `ssh-config` → `~/.ssh` (user SSH keys / known_hosts; entrypoint enforces `chmod 700`)
- `config-dir` → `~/.config` (all XDG tool config, including the GitHub CLI tokens under `~/.config/gh` and Herdr settings)
- `herdr-data` → `~/.herdr` (Herdr-created worktrees and related data; session metadata is under `~/.config/herdr`)

Hermes is split: when Hermes is enabled (`install.hermes: true` in `harness.yaml`), `HERMES_HOME` defaults to the project-local bind-mounted `~/harness/.hermes/` directory, while auth remains in the `~/.hermes` named volume and is linked into the project-local home as `auth.json`. The entrypoint links `.hermes/skills/openharness` to the tracked shared skill directory (`.oh/skills/`) so Hermes sees the same harness skills as Claude, Codex, and Pi without copying them into runtime state. Project-local runtime contents are gitignored except `.hermes/README.md`; `make destroy` removes the auth volume but not the bind-mounted project runtime directory.

`make destroy` and `docker compose down -v` remove named volumes, including Herdr state and provider credentials; use `make stop` when you want them to survive.

Downstream harness packs and Pi extensions can introduce additional volumes or bind-mount overlays by listing tracked compose files under `compose.overrides:` in `harness.yaml`, or by adding user-local files to `composeOverrides[]` in `config.json` (gitignored).
