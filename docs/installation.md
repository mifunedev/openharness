---
title: "Installation"
---

# Installation

Open Harness is a portable harness that boots an isolated Docker sandbox. The `oh` CLI is the only front door: it creates a sandbox (`oh sandbox install docker`), equips a checkout with the control plane (`oh update`), and drives the rest of the lifecycle. Two shapes exist — a sandbox on its own, running the published image, or a sandbox with a checkout bind-mounted into it (`--repo`) — and both use the same commands. See [lifecycle commands](lifecycle-commands.md) for the verb reference.

The CLI writes only what you ask it to: a registry entry under `~/.oh/sandboxes/<name>/`, and — when you run `oh update` — `.oh/` and `crons/` inside a checkout. It writes no `AGENTS.md`, no provider configuration, and no `.gitignore` line beyond the `.env` line `oh secret set` adds inside a git checkout. Those files are yours.

## Prerequisites

| Dependency | Required for | Install |
|---|---|---|
| Docker (with Compose plugin) | Sandbox image | [docs.docker.com/get-docker](https://docs.docker.com/get-docker/) |
| git | Cloning a repo, and `oh update --from-remote` | [git-scm.com](https://git-scm.com/) |
| Node.js ≥ 20 (22 recommended) | Running the `oh` CLI itself | [nodejs.org](https://nodejs.org/) — or let [`get-oh.sh`](#standalone-cli-oh-equip-an-existing-repo) install nvm + Node 22 for you |

That is the entire host requirement. Node runs `oh` and nothing else: pnpm, Python, and every AI CLI live inside the sandbox.

## Self-hosting: I already have a clone

If you've already cloned your fork — or cloned upstream and re-pointed the remote — run the installer from inside the directory. It auto-detects the local repo and skips any network clone:

```bash
cd <your-clone>
bash .oh/scripts/install.sh
```

The installer prompts for sandbox name, timezone, and git identity, writes the non-secrets to the tracked `oh.json` and any secrets to the gitignored root `.env`, and starts the sandbox. No `OH_GITHUB_REPO` environment variable required.

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

1. Clone upstream, create a sandbox against that checkout, and open a shell (`oh` from npm or `get-oh.sh` — see [Standalone CLI](#standalone-cli-oh-equip-an-existing-repo)):
   ```bash
   git clone --recurse-submodules https://github.com/mifunedev/openharness.git ~/.openharness
   cd ~/.openharness
   oh sandbox install docker --repo "$PWD" --name openharness
                          # wizard: name, timezone, git identity, SSH, Docker socket
   oh shell openharness   # attach as the sandbox user
   oh tool install herdr  # a fresh sandbox has no herdr
   herdr                  # first inside-sandbox command
   ```
   The answers are written to `~/.oh/sandboxes/openharness/oh.json`, not into the
   checkout. Secrets go to that entry's `.env` with
   `oh secret set --sandbox openharness <KEY>`.
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
   at yours, and pushes. It never runs unless you answer yes in that run: any
   non-interactive shell skips it. If `gh` is missing or
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
> `bash .oh/scripts/install.sh` instead of `oh sandbox install docker` — the
> installer detects the local clone automatically.

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
3. Prompts for sandbox name, timezone, and git identity, then writes the non-secrets to the tracked `oh.json`.
4. Creates the gitignored, mode-`0600` root `.env` from the tracked `.env.example` when missing (all keys commented — inert until you edit), and links `.devcontainer/.env` to it so VS Code "Reopen in Container" reads the same file. Non-secret settings stay in the tracked `oh.json`.
5. Provisions the sandbox (`oh sandbox install docker --repo <clone>`).
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

### 2. Create the sandbox

```bash
oh sandbox install docker --repo "$PWD" --name openharness
```

The wizard asks for the sandbox name, timezone, git identity, SSH (and its host port), and the host Docker socket, then writes `~/.oh/sandboxes/openharness/oh.json`. `--yes` keeps every default and asks nothing. Edit one field later with `oh config set --sandbox openharness <field> <value>`, and set a secret with `oh secret set --sandbox openharness <KEY>`. See [Configuration](./configuration.md) for the field reference, and the comments in `.env.example` for every allow-listed secret.

### 3. What the sandbox runs

`oh sandbox install docker` materialises the compose files and the wrapper into the entry, then runs `.oh/scripts/docker-compose.sh up -d`, which resolves the compose overlays your `oh.json` selects. Running `docker compose -f .devcontainer/docker-compose.yml up -d --build` by hand skips that resolution and applies **no** overlays.

With `--repo` and `image.mode` set to `build`, a cold Docker cache takes around ten minutes; subsequent starts are a few seconds. The default is to pull the published release image instead — see [`oh sandbox install docker`](deployment-prebuilt-image.md) for the image-mode recipe and the `--image` / `--no-build` flags.

Check the sandbox health before attaching:

```bash
docker ps --filter "name=openharness" --format "{{.Names}} {{.Status}}"
docker inspect --format '{{json .State.Health}}' openharness
```

A healthy sandbox reports the tmux-managed runtime sessions (`cron-watchdog` and `cron-system`) as available; optional Slack and Hermes dashboard sessions are checked only when configured. To debug a failure from inside the container, run `bash /home/sandbox/harness/.oh/scripts/sandbox-healthcheck.sh` for the exact missing session. For a temporary local escape hatch, add a Compose override with `services.sandbox.healthcheck.disable: true`; do not commit that override unless you are deliberately changing the harness health policy.

### 4. Open a shell

```bash
oh shell openharness
```

Omit the name when exactly one sandbox is registered, or when you are standing in the checkout it was created for. `oh sandbox list` prints every registered name.

## Standalone CLI (`oh`): equip an existing repo

Every path above clones the harness repo itself. The standalone `oh` CLI path is different: it equips **your existing project repo** with the control plane and drives the sandbox without keeping an OpenHarness checkout around. The host requirements are the same [Prerequisites](#prerequisites) as every other path — Docker, git, and Node ≥ 20.

**Get the `oh` command from npm (recommended if you have Node):** the CLI is published as [`@mifune/openharness`](https://www.npmjs.com/package/@mifune/openharness). If Node.js ≥ 20 is already on your host, install it globally or run it zero-install:

```bash
npm install -g @mifune/openharness   # puts `oh` on your PATH
# ...or, without a global install:
npx @mifune/openharness sandbox install docker
```

The published package is the same single self-contained bundle: it carries the compose files and the wrapper a sandbox needs, and `oh update` carries the `.oh/` payload (falling back to an on-demand fetch, no repo clone). npm does **not** install Node; Node ≥ 20 must already be on your PATH (that is exactly what `get-oh.sh` bootstraps below).

**No npm, or no Node yet?** Bootstrap with `get-oh.sh` instead. It installs the single self-contained `oh` binary to `~/.local/bin/oh` — **no repo clone**, and it does not touch an existing `~/.openharness` sandbox. It prefers a prebuilt bundle (`oh.mifune.dev/oh.js`) and falls back to building from source in a temp dir. If Node.js ≥ 20 is missing, it offers to install nvm + Node 22 and sources it so `oh` works in the same shell.

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
oh sandbox install docker              # create a sandbox from the published image
oh sandbox install docker --repo <dir> # ...or bind a checkout at /home/sandbox/harness
oh sandbox list                        # name, runtime, status, repo
oh shell <name>                        # zsh in the running container
oh tool install herdr                  # install the terminal workspace — nothing installs at boot
oh harness install pi                  # install an agent CLI the same way
oh gateway status                      # manage messaging client sessions (pi|hermes)
```

To equip your own checkout with the control plane, run `oh update` inside it:

```bash
cd <your-project>
oh update                            # vendors .oh/ + crons/ from the CLI's bundled payload
oh update --from-remote --ref v0.6.0 # ...or shallow-clone a pinned payload instead
oh update --from <local-checkout>    # ...or vendor from a built checkout, offline
```

`oh update` equips an empty directory and upgrades an equipped one with the same command; a second run reports it is already up to date. It writes only `.oh/` and `crons/` — never `oh.json`, `.env`, `AGENTS.md`, `.gitignore`, `.devcontainer/`, or a provider directory. It never prompts. Payload precedence is `--from` > `--from-remote` > the CLI's bundled payload > a remote fetch announced on one line. `--from-remote` fetches over public HTTPS only — private or credential-prompting remotes fail fast (`GIT_TERMINAL_PROMPT=0`).

A checkout bound with `--repo` mounts at `/home/sandbox/harness`. Without `--repo` the sandbox runs `ghcr.io/mifunedev/openharness:latest` and seeds its workspace from the image — see [`oh sandbox install docker`](deployment-prebuilt-image.md) for that recipe and the `--image` / `--no-build` flags.

## Next step

Once installed, proceed to the [Quickstart](./quickstart.md) to authenticate inside the sandbox and start an agent.

## What's Installed

The sandbox image ships a complete development environment. The required host dependencies are Docker with the Compose plugin, Git, and Node.js ≥ 20 (see [Prerequisites](#prerequisites)).

Project-local Pi packages are loaded from `.pi/settings.json`; the defaults include `@tintinweb/pi-subagents`, `@tintinweb/pi-tasks`, `@narumitw/pi-goal`, `@narumitw/pi-plan-mode`, `@narumitw/pi-codex-usage@0.6.2` for `/codex-status` plus fixed statusline usage timers, `@tifan/pi-recap` for `/recap` plus automatic idle/resume session summaries, `@trevonistrevon/pi-loop` for Monitor/Loop tools, `@guwidoe/pi-prompt-suggester` for next-prompt suggestions, and `pi-dynamic-workflows` for workflow-script fan-out through isolated Pi subagents.

### Base image

Debian Trixie (slim), the current Debian stable. The `sandbox` user has passwordless sudo.

Docker's apt repository tracks the `trixie` suite, and it is now the only third-party apt source in the image. cloudflared used to force a `bookworm` suite here because Cloudflare publishes no Trixie suite (`pkg.cloudflare.com/cloudflared/dists/trixie` returns HTTP 404); moving it to a pinned, checksum-verified binary in the tool catalog removed that exception.

### AI agent CLIs

No agent CLI is baked into the image, and nothing installs one at boot. A
harness enters the sandbox only when you run `oh harness install <id>`, which
installs into `~/.local` — inside the home mount — as the `sandbox` user. That
placement is what makes an in-place upgrade possible: a copy in a root-owned
system path is unwritable from a running sandbox. Consequences worth knowing:

- A **fresh sandbox has no agent CLI and no Herdr**. `oh shell` lands you in a
  plain shell, and `tmux` is the fallback multiplexer until you run
  `oh tool install herdr`.
- Every install needs network. Run the verb when you have a link.
- An existing install is never replaced. The verb reports `already installed`
  and exits 0.
- Every download is pinned and `sha256sum`-verified before it is installed.
- npm's cache lives in the home mount at `~/.npm` and grows across upgrades.
  `npm cache clean --force` reclaims it.
- The install persists because the home volume persists. `oh destroy` removes
  the volume, and every install with it.

| Tool | Command | Source | Install |
|------|---------|--------|--------|
| Claude Code | `claude` | Anthropic's coding agent (aliased to `claude --dangerously-skip-permissions`) | `oh harness install claude-code` |
| OpenAI Codex | `codex` | OpenAI's coding agent (aliased to `codex --dangerously-bypass-approvals-and-sandbox`) | `oh harness install codex` |
| Pi | `pi` | `@earendil-works/pi-coding-agent` — local-first coding agent (was `@mariozechner/pi-coding-agent`, now deprecated) | `oh harness install pi` |
| OpenCode | `opencode` | `opencode-ai` — terminal coding agent with OpenAI OAuth support | `oh harness install opencode` |
| Hermes | `hermes` | Nous Research's self-improving agent CLI | `oh harness install hermes` |
| Grok Build | `grok` | xAI's proprietary Grok Build CLI (`@xai-official/grok@0.2.39`, Node >=20) | `oh harness install grok-build` |
| T3 Code | `npx t3` | Browser UI over Claude/Codex/OpenCode | on demand, no install |

Tools follow the same rule. `herdr`, `cloudflared`, `agent-browser`, and
`tailscale` are `kind: "installable"` and enter the sandbox only through
`oh tool install <name>`. `gh` and the Docker CLI are `kind: "baked-in"`: they
are in the image, and `oh tool install` refuses them. Every install is
idempotent, and none needs an image rebuild. `oh tool install agent-browser`
downloads about 1 GB, so it asks for confirmation first; `--yes` accepts that
download in a non-interactive run and changes nothing else.

Installing `tailscale` places the `tailscale` and `tailscaled` binaries in
`~/.local/bin` and nothing more. It starts no daemon and joins no tailnet.
Networking activates only when a human starts `tailscaled` in
userspace-networking mode and runs `tailscale up` interactively — see
[Connecting → Mobile access over Tailscale](connecting.md#mobile-access-over-tailscale).
Its node identity and daemon state live in `~/.tailscale`, inside the single
`/home/sandbox` mount, so the node does not re-authenticate on every container
recreate.

### Runtimes & package managers

| Tool | Version |
|------|---------|
| Node.js | 22.x |
| pnpm | latest (via corepack) |
| Bun | latest |
| uv | latest (Python package manager) |

### DevOps & infrastructure

`oh tool list` reports which of these are present, and `oh tool status <name>`
adds a version where the tool has a verified version flag. Herdr and cloudflared
are `kind: "installable"` — `oh tool install <name>` puts a pinned,
checksum-verified binary into `~/.local/bin`, and upgrades it in place. The rest
are baked into the image, so there is nothing to install.

| Tool | Purpose |
|------|---------|
| Herdr (`herdr`) | Multi-agent terminal workspace; run `oh tool install herdr`, after which state and binary both persist in the home mount |
| Docker CLI + Compose | Container management from inside the sandbox (host docker socket bind-mounted by the base compose) |
| GitHub CLI (`gh`) | PRs, issues, releases from the terminal |
| cloudflared | Cloudflare Tunnel client, for exposing a sandbox port (see the `/cloudflared` skill); run `oh tool install cloudflared` |
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

### Persistent storage

Everything under the sandbox user's home directory — every agent login, the
GitHub CLI token, the SSH keys, shell history, and any state a tool writes
anywhere in `~` — persists through a **single mount at `/home/sandbox`**.

By default Docker manages it as the named volume `<sandbox-name>_workspace`.
Set `storage.homePath` in `oh.json` to an absolute **host** path and the same
mount becomes a bind, so you can back the sandbox home up, inspect it, or move
it between machines:

```bash
oh config set --sandbox <name> storage.homePath /srv/openharness-home
```

Leave `storage.homePath` unset to keep the Docker-managed volume. Use a
**dedicated, empty** directory — the sandbox takes ownership of everything in
it, so never point it at your own host `$HOME`.

The repository checkout is bind-mounted at `/home/sandbox/harness`, nested
inside that mount. Its location is fixed, not configurable.

The image ships its baked home at `/opt/home-seed`. On every boot the entrypoint
copies in each **top-level** entry the mount does not already have, and never
touches one it does — not even its permissions. A fresh mount comes up complete;
an image upgrade adds whatever new top-level entries it introduced (a new agent
CLI's `~/.newtool`, say) and leaves everything you already have alone. It does
not merge new files into a directory the mount already has, which is what the
per-tool volumes did before.

Hermes is split: when the `hermes` binary is present (after
`oh harness install hermes`), `HERMES_HOME` is the project-local
bind-mounted `~/harness/.hermes/` directory. The entrypoint links `.hermes/skills/openharness` to the tracked
shared skill directory (`.oh/skills/`) so Hermes sees the same harness skills as
Claude, Codex, and Pi without copying them into runtime state. Project-local
runtime contents are gitignored except `.hermes/README.md`.

`oh destroy` and `docker compose down -v` delete the named volume and everything
in it — provider credentials included; use `oh stop` when you want them to
survive. When `storage.homePath` points at a host bind, `down -v` cannot remove
it, and `oh destroy` says so.

#### Migrating from the per-tool volumes

Releases before this change kept eleven separate volumes (`claude-auth`,
`config-dir`, `ssh-config`, and so on). They are not migrated automatically.
**Before** upgrading, copy the old home out of the still-running container:

```bash
mkdir -p /srv/openharness-home
docker cp <sandbox-name>:/home/sandbox/. /srv/openharness-home
rm -rf /srv/openharness-home/harness
oh config set --sandbox <sandbox-name> storage.homePath /srv/openharness-home
```

The trailing `/.` matters: without it `docker cp` places the copy at
`/srv/openharness-home/sandbox/` instead of unpacking its contents, and the
sandbox comes up freshly seeded as though nothing was migrated. The `rm -rf`
drops the copy of the repository checkout — `docker cp` reads through the bind
mount, so the archive includes `harness/` with its `.git` and `node_modules`,
which can be several GB and is shadowed by the checkout bind at runtime anyway.

Then rebuild. To stay on a Docker-managed volume instead, copy that directory
into the new volume once:

```bash
docker run --rm -v <sandbox-name>_workspace:/to -v /srv/openharness-home:/from \
  alpine cp -a /from/. /to/
```

Skipping this loses every agent login and the SSH keys; nothing else breaks, and
you simply sign in again.

Downstream harness packs and Pi extensions can introduce additional volumes or bind-mount overlays by adding paths to `composeOverrides[]` in the tracked `oh.json`. That list is the one place overlay paths live, and only `oh` applies it: VS Code "Reopen in Container" reads `.devcontainer/docker-compose.yml` alone and applies [no overlays at all](lifecycle-commands.md#vs-code-reopen-in-container-applies-no-overlays).
