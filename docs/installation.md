---
title: "Installation"
---

# Installation

Open Harness is a portable harness that boots an isolated Docker sandbox for your project. The `oh` CLI is the only front door: it equips a repo (`oh init`), provisions the sandbox (`oh sandbox`), and drives the rest of the lifecycle. Two shapes exist — clone **this** repo and own it, or equip a project repo you already have — and both use the same commands. See [lifecycle commands](lifecycle-commands.md) for the verb reference.

## Prerequisites

| Dependency | Required for | Install |
|---|---|---|
| Docker (with Compose plugin) | Sandbox image | [docs.docker.com/get-docker](https://docs.docker.com/get-docker/) |
| git | Cloning a repo, and `oh init --from-remote` | [git-scm.com](https://git-scm.com/) |
| Node.js ≥ 20 (22 recommended) | Running the `oh` CLI itself | [nodejs.org](https://nodejs.org/) — or let [`get-oh.sh`](#standalone-cli-oh-equip-an-existing-repo) install nvm + Node 22 for you |

That is the entire host requirement. Node runs `oh` and nothing else: pnpm, Python, and every AI CLI live inside the sandbox.

## Self-hosting: I already have a clone

If you've already cloned your fork — or cloned upstream and re-pointed the remote — run the installer from inside the directory. It auto-detects the local repo and skips any network clone:

```bash
cd <your-clone>
bash .oh/scripts/install.sh
```

The installer prompts for sandbox name, timezone, git identity and optional installs, writes the non-secrets to the tracked `oh.json` and any secrets to the gitignored root `.env`, and starts the sandbox. No `OH_GITHUB_REPO` environment variable required.

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
   The installer requires Node.js ≥ 20 and installs `oh`, bootstrapping Node via
   nvm if it is missing, so it no longer leaves you with a Node-free host. Your
   answers are written to `oh.json` (see [Configuration](./configuration.md)); the
   gitignored `.env` receives only secrets.

### Clone-and-own: private origin and upstream (recommended)

The validated path for running your own long-lived harness: clone upstream, make
**your** repo the `origin`, and keep `mifunedev/openharness` as `upstream` so you can
pull framework updates and open PRs back. Creating the private repo and setting the
remotes happens **inside the sandbox**, after GitHub auth, so the SSH key generated
there is the one used for pushes.

1. Clone upstream, edit `oh.json` and the local `.env`, then bring the sandbox up and open a shell (`oh` from npm or `get-oh.sh` — see [Standalone CLI](#standalone-cli-oh-equip-an-existing-repo)):
   ```bash
   git clone --recurse-submodules https://github.com/mifunedev/openharness.git ~/.openharness
   cd ~/.openharness
   nano oh.json        # non-secrets: name, timezone, git identity, install.* —
                       # see Configuration. Do this BEFORE building.
   cp .env.example .env && chmod 600 .env   # secrets only; gitignored
   nano .env           # GH_TOKEN, SANDBOX_PASSWORD, … (or use `oh secret set`)
   oh sandbox        # build + start the container (~10 min cold)
   oh shell          # attach as the sandbox user
   herdr              # first inside-sandbox command
   ```
2. **Inside the initial Herdr pane**, authenticate GitHub over SSH — choose SSH as the protocol
   and let `gh` generate a key (details: [GitHub auth](./integrations/github.md)):
   ```bash
   gh auth login       # GitHub.com → SSH → generate a new SSH key → paste a token
   gh auth setup-git
   ```
3. Still inside the sandbox, create your own **private** repo, make it `origin`, and
   keep the upstream you cloned from — all over SSH so the key from step 2 is used:
   ```bash
   oh config repo
   ```
   `oh config repo` asks for the owner, name, and visibility (default private), then
   creates the repo, renames the existing `origin` to `openharness`, points `origin`
   at yours, and pushes. It never runs unless you answer yes in that run: `oh init
   --yes`, `--dry-run`, and any non-interactive shell skip it. If `gh` is missing or
   unauthenticated it prints these commands instead of running them — the manual
   fallback, which names the preserved upstream remote `upstream`:
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
> `bash .oh/scripts/install.sh` instead of `oh sandbox` — the installer detects the
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

Open Harness requires Docker with Compose, Git, and Node.js ≥ 20 (see [Prerequisites](#prerequisites)). The installer bootstraps Node itself when it is missing.

The installer:

1. Verifies Docker and git are present, and installs Node ≥ 20 and the `oh` CLI when they are missing.
2. Clones the repo into `~/.openharness` (or pulls latest if the directory already exists).
3. Prompts for sandbox name, timezone, git identity and optional installs, then writes the non-secrets to the tracked `oh.json`.
4. Creates the gitignored, mode-`0600` root `.env` from the tracked `.env.example` when missing (all keys commented — inert until you edit), and links `.devcontainer/.env` to it so VS Code "Reopen in Container" reads the same file. Non-secret settings stay in the tracked `oh.json`.
5. Provisions the sandbox (`oh sandbox`, i.e. `docker compose … up -d --build`).
6. Prints the next-step `oh` commands (open a shell, stop, tear down).

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
cp .env.example .env && chmod 600 .env
```

Edit `oh.json` for non-secret settings — `name`, `timezone`, `git`, `install.*`, `access.*` — and `.env` for secrets such as `GH_TOKEN`. See [Configuration](./configuration.md) for the field reference, and the comments in `.env.example` for every allow-listed secret.

### 3. Build and start the sandbox

```bash
oh sandbox
```

`oh sandbox` runs `.oh/scripts/docker-compose.sh up -d --build`, which resolves the compose overlays your `oh.json` selects. Running `docker compose -f .devcontainer/docker-compose.yml up -d --build` by hand skips that resolution and applies **no** overlays.

On a cold Docker cache the build takes around ten minutes; subsequent starts are a few seconds. To skip the build entirely and pull the prebuilt release image instead, see [Prebuilt-image deployment](deployment-prebuilt-image.md) (`docker compose … up -d --no-build` with `OH_SANDBOX_IMAGE` set, or `oh sandbox --image`).

Check the sandbox health before attaching:

```bash
docker ps --filter "name=openharness" --format "{{.Names}} {{.Status}}"
docker inspect --format '{{json .State.Health}}' openharness
```

A healthy sandbox reports the tmux-managed runtime sessions (`cron-watchdog` and `cron-system`) as available; optional Slack and Hermes dashboard sessions are checked only when configured. To debug a failure from inside the container, run `bash /home/sandbox/harness/.oh/scripts/sandbox-healthcheck.sh` for the exact missing session. For a temporary local escape hatch, add a Compose override with `services.sandbox.healthcheck.disable: true`; do not commit that override unless you are deliberately changing the harness health policy.

### 4. Open a shell

```bash
oh shell
```

Pass a container name to attach to a different one, e.g. `oh shell portfolio-advisor`.

## Standalone CLI (`oh`): equip an existing repo

Every path above clones the harness repo itself. The standalone `oh` CLI path is different: it equips **your existing project repo** with the harness and drives the sandbox without keeping an OpenHarness checkout around. The host requirements are the same [Prerequisites](#prerequisites) as every other path — Docker, git, and Node ≥ 20.

**Get the `oh` command from npm (recommended if you have Node):** the CLI is published as [`@mifune/openharness`](https://www.npmjs.com/package/@mifune/openharness). If Node.js ≥ 20 is already on your host, install it globally or run it zero-install:

```bash
npm install -g @mifune/openharness   # puts `oh` on your PATH
# ...or, without a global install:
npx @mifune/openharness init
```

The published package is the same single self-contained bundle — `oh init`/`oh update` fetch their scaffold payload on demand (no repo clone). npm does **not** install Node; Node ≥ 20 must already be on your PATH (that is exactly what `get-oh.sh` bootstraps below).

**No npm, or no Node yet?** Bootstrap with `get-oh.sh` instead. It installs the single self-contained `oh` binary to `~/.local/bin/oh` — **no repo clone**, and it does not touch an existing `~/.openharness` sandbox. It prefers a prebuilt bundle (`oh.mifune.dev/oh.js`) and falls back to building from source in a temp dir. If Node.js ≥ 20 is missing, it offers to install nvm + Node 22 and sources it so `oh` works in the same shell. `oh init` fetches its scaffold payload on demand.

For a review-first install, download and inspect the script before you run it.
The review-first alternative appears below.

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

`oh sandbox --image` (and the `OH_SANDBOX_IMAGE` key in `.devcontainer/.env`) run the
published `ghcr.io/mifunedev/openharness` image instead of building locally — see
[Prebuilt-image deployment](deployment-prebuilt-image.md).

`--from-remote` fetches over public HTTPS only — private or credential-prompting remotes fail fast (`GIT_TERMINAL_PROMPT=0`); offline, use `oh init --from <local-checkout>` instead. Repos equipped this way mount your project at `/home/sandbox/project` inside the sandbox (the clone paths above use `/home/sandbox/harness`). Upgrade the vendored `.oh/` later with `oh update --from-remote [--ref <ref>]`.

## Next step

Once installed, proceed to the [Quickstart](./quickstart.md) to authenticate inside the sandbox and start an agent.

## What's Installed

The sandbox image ships a complete development environment. The required host dependencies are Docker with the Compose plugin, Git, and Node.js ≥ 20 (see [Prerequisites](#prerequisites)).

Project-local Pi packages are loaded from `.pi/settings.json`; the defaults include `@tintinweb/pi-subagents`, `@tintinweb/pi-tasks`, `@narumitw/pi-goal`, `@narumitw/pi-plan-mode`, `@narumitw/pi-codex-usage@0.6.2` for `/codex-status` plus fixed statusline usage timers, `@tifan/pi-recap` for `/recap` plus automatic idle/resume session summaries, `@trevonistrevon/pi-loop` for Monitor/Loop tools, `@guwidoe/pi-prompt-suggester` for next-prompt suggestions, and `pi-dynamic-workflows` for workflow-script fan-out through isolated Pi subagents.

### Base image

Debian Trixie (slim), the current Debian stable. The `sandbox` user has passwordless sudo.

Docker's apt repository tracks the `trixie` suite. Cloudflare's stays on `bookworm`: Cloudflare publishes no Trixie suite (`pkg.cloudflare.com/cloudflared/dists/trixie` returns HTTP 404) and its Bookworm `cloudflared` package runs on Trixie.

### AI agent CLIs

Default CLIs are always present. Optional CLIs are excluded from the default image; `oh harness install <name>` flips the matching `install.*` field in `oh.json` and installs it.

| Tool | Command | Source | Status |
|------|---------|--------|--------|
| Claude Code | `claude` | Anthropic's coding agent (aliased to `claude --dangerously-skip-permissions`) | default |
| OpenAI Codex | `codex` | OpenAI's coding agent (aliased to `codex --dangerously-bypass-approvals-and-sandbox`) | default |
| Pi | `pi` | `@earendil-works/pi-coding-agent` — local-first coding agent (was `@mariozechner/pi-coding-agent`, now deprecated) | default |
| OpenCode | `opencode` | `opencode-ai` — terminal coding agent with OpenAI OAuth support | optional: `oh harness install opencode` |
| DeepAgents | `deepagents` | LangChain's multi-provider terminal agent (`deepagents-cli` via `uv tool install`) | optional: `oh harness install deepagents` |
| Hermes | `hermes` | Nous Research's self-improving agent CLI | optional: `oh harness install hermes` |
| Grok Build | `grok` | xAI's proprietary Grok Build CLI (`@xai-official/grok@0.2.39`, Node >=20) | optional: `oh harness install grok-build` |
| agent-browser | `agent-browser` | Headless Chromium for web-capable agents | optional: `oh tool install agent-browser` |

### Runtimes & package managers

| Tool | Version |
|------|---------|
| Node.js | 22.x |
| pnpm | latest (via corepack) |
| Bun | latest |
| uv | latest (Python package manager) |

### DevOps & infrastructure

`oh tool list` reports which of these are present, and `oh tool status <name>`
adds a version where the tool has a verified version flag. They are baked into
the image, so there is nothing to install.

| Tool | Purpose |
|------|---------|
| Herdr (`herdr`) | Default multi-agent terminal workspace; state persists across rebuilds in dedicated volumes |
| Docker CLI + Compose | Container management from inside the sandbox (host docker socket bind-mounted by the base compose) |
| GitHub CLI (`gh`) | PRs, issues, releases from the terminal |
| cloudflared | Cloudflare Tunnel client, for exposing a sandbox port (see the `/cloudflared` skill) |
| tmux | Detachable terminal sessions for long-running agents |
| croner | Markdown-frontmatter cron scheduler for autonomous agent tasks |

### Utilities

| Tool | Purpose |
|------|---------|
| git | Version control |
| jq | JSON processing |
| ripgrep (`rg`) | Fast code search |
| curl, wget | HTTP clients |
| lsof | Inspect open files and the processes using them inside the sandbox |
| htop | Interactive process viewer for the sandbox |
| telnet | Plaintext network diagnostic client supplied by `inetutils-telnet`; not SSH or a secure shell |
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
- `deepagents-auth` → `~/.deepagents` (DeepAgents provider keys, memory, skills, sessions; used when DeepAgents is enabled (`install.deepagents: true` in `oh.json`)). Repo-local `.deepagents/` is **project data** and follows normal `.gitignore` and code-review rules — never put secrets there.
- `hermes-auth` → `~/.hermes` (Hermes auth only; non-auth runtime state defaults to project-local `~/harness/.hermes` when Hermes is enabled (`install.hermes: true` in `oh.json`))
- `grok-auth` → `~/.grok` (all Grok Build user state: auth, config, sessions, memory, skills/plugins, logs; mounted alongside the other agent auth volumes and used by Grok Build when `install.grokBuild: true` in `oh.json`). Cached OAuth/session state in `~/.grok/auth.json` takes precedence over `XAI_API_KEY`; if an API key seems ignored, run `grok logout` or reset the volume.
- `cloudflared-auth` → `~/.cloudflared` (Cloudflare tunnel credentials, when used)
- `ssh-config` → `~/.ssh` (user SSH keys / known_hosts; entrypoint enforces `chmod 700`)
- `config-dir` → `~/.config` (all XDG tool config, including the GitHub CLI tokens under `~/.config/gh` and Herdr settings)
- `herdr-data` → `~/.herdr` (Herdr-created worktrees and related data; session metadata is under `~/.config/herdr`)

Hermes is split: when Hermes is enabled (`install.hermes: true` in `oh.json`), `HERMES_HOME` defaults to the project-local bind-mounted `~/harness/.hermes/` directory, while auth remains in the `~/.hermes` named volume and is linked into the project-local home as `auth.json`. The entrypoint links `.hermes/skills/openharness` to the tracked shared skill directory (`.oh/skills/`) so Hermes sees the same harness skills as Claude, Codex, and Pi without copying them into runtime state. Project-local runtime contents are gitignored except `.hermes/README.md`; `oh destroy` removes the auth volume but not the bind-mounted project runtime directory.

`oh destroy` and `docker compose down -v` remove named volumes, including Herdr state and provider credentials; use `oh stop` when you want them to survive.

Downstream harness packs and Pi extensions can introduce additional volumes or bind-mount overlays by adding paths to `composeOverrides[]` in the tracked `oh.json`. That list is the one place overlay paths live, and only `oh` applies it: VS Code "Reopen in Container" reads `.devcontainer/docker-compose.yml` alone and applies [no overlays at all](lifecycle-commands.md#vs-code-reopen-in-container-applies-no-overlays).
