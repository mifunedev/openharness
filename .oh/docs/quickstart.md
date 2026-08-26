---
title: "Quickstart"
---

# Quickstart

This guide takes you from zero to a running sandbox with an interactive shell in under five minutes. Required host dependencies are [Docker](https://docs.docker.com/get-docker/) with the Compose plugin, [Git](https://git-scm.com/), and `make` (build-essential) — the full list with install commands is in [Prerequisites](./installation.md#prerequisites-clone-path).

## Before you start

Install Docker with the Compose plugin ([docs.docker.com/get-docker](https://docs.docker.com/get-docker/)), Git ([git-scm.com](https://git-scm.com/)), and `make` (build-essential — `sudo apt-get install build-essential` on Debian/Ubuntu, Xcode Command Line Tools on macOS). Node, Python, pnpm, and agent CLIs run inside the container.

## Install

Two doors, solving different problems — pick by what you have (same as the
[README](https://github.com/mifunedev/openharness#-install), and see
[Which door am I?](./lifecycle-commands.md) for the split).

**A. I want an Open Harness sandbox of my own** — Docker + Git, no Node:

```bash
curl -fsSL https://oh.mifune.dev/install.sh | bash
```

The installer clones into `~/.openharness`, prompts for your sandbox name,
timezone, git identity and optional installs, prompts to share your host `gh`
token, and brings the sandbox up via `docker compose` (~10 min cold, ~30s warm).

**B. I already have a project and want to equip it** — needs Node ≥ 20 on the host:

```bash
npm install -g @mifune/openharness
cd <your-project> && oh init && oh sandbox
```

To then make the sandbox *yours* with a private repo + upstream, continue with
the [end-to-end walkthrough](#end-to-end-setup-walkthrough) below.

<details><summary>Other install methods (manual setup · review-first · fork-and-clone)</summary>

**Manual setup — clone and configure before the first build.**

> Not covered by CI; the scripted installers above are. If a step here has
> drifted, prefer `install.sh`.

Kept because it is the only path that lets you edit `.devcontainer/.env` **before** the
~10-minute first image build, and because audit-first operators want to read
every command before running any of them.

```bash
# 1. Clone upstream:
git clone https://github.com/mifunedev/openharness.git ~/.openharness && cd ~/.openharness

# 2. Materialize and edit local .devcontainer/.env BEFORE building — set
#    SANDBOX_NAME, TZ, GIT_USER_NAME, GIT_USER_EMAIL, optional INSTALL_* keys:
cp .devcontainer/.example.env .devcontainer/.env
nano .devcontainer/.env

# 3. Build the image (~10 min cold, ~30s warm). oh sandbox also creates
#    .devcontainer/.env from the template if you skipped step 2.
make sandbox
```

Review-first one-line install, without adding a host dependency:

```bash
curl -fsSL -o openharness-install.sh https://oh.mifune.dev/install.sh
# Review openharness-install.sh in your editor or pager before running it.
bash openharness-install.sh
```

**Self-hosting from an existing clone:** run `bash .oh/scripts/install.sh` from inside the directory — it detects the local clone automatically.

**Standalone `oh` CLI (equip an existing project repo):** if you already have Node.js ≥ 20, install the `oh` command from npm — `npm install -g @mifune/openharness` (or zero-install `npx @mifune/openharness init`). Otherwise bootstrap it onto your host with `curl -fsSL https://oh.mifune.dev/get-oh.sh | bash` (or `source <(curl -fsSL https://oh.mifune.dev/get-oh.sh)` to install *and* put `oh` on your PATH in the current shell — no re-login; if you used the plain `curl … | bash` form, `export PATH="$HOME/.local/bin:$PATH"` in an already-open shell) (review-first: `curl -fsSL -o get-oh.sh https://oh.mifune.dev/get-oh.sh` then read it and `bash get-oh.sh`), then `cd <your-project> && oh init` → `oh sandbox` / `oh shell` / `oh gateway` — see [Installation → Standalone CLI](./installation.md#standalone-cli-oh-equip-an-existing-repo). It installs the `oh` binary to `~/.local/bin/oh` (no repo clone) and needs Node.js ≥ 20 (it offers to install nvm + Node 22 if missing); Docker only for `oh sandbox`.

</details>

## Enter the sandbox

**Recommended: attach with VS Code's Dev Containers extension.** Works identically whether the sandbox is on your laptop or on a remote host you're SSH'd into (with VS Code's Remote-SSH extension). One window, your normal editor, integrated terminal, file tree — the most consistent and productive setup across environments.

1. Install the [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers).
2. Open the Command Palette with `Ctrl+Shift+P` (`Cmd+Shift+P` on macOS) → **Dev Containers: Attach to Running Container...** → select `openharness`.
3. When the new VS Code window opens, set the workspace folder to `/home/sandbox/harness`.

> **Optional — DebugMCP (cross-harness debugging).** If you take the VS Code attach route
> above, you can install the `microsoft/DebugMCP` extension to expose a debugging MCP server
> that **any MCP-capable harness** (Claude Code, Codex, …) can drive — breakpoints, stepping,
> variable inspection. It is not tied to one agent and is unnecessary for the terminal path.
> Runbook: [DebugMCP](./integrations/debugmcp.md#confirmed-setup-runbook).

**Terminal fallback** for when VS Code isn't available or you just need a shell:

```bash
cd ~/.openharness
make shell
```
Pass an optional container name to attach to a different running container, e.g. `make shell portfolio-advisor` (add `SHELL_USER=<user>` if the target has no `sandbox` user).

Either way you're inside the isolated sandbox as the `sandbox` user. Working
directory: `/home/sandbox/harness`.

## Start Herdr first

Your first command inside a fresh sandbox should be:

```bash
herdr
```

Herdr creates or reattaches the persistent interactive workspace for this repository.
Complete GitHub and provider authentication, launch agents, and run tests and servers
inside its panes. Detach with `Ctrl-b q`; run `herdr` again to return while the container
keeps running. A container stop/rebuild restores metadata and layout, not terminated
agent or server processes. Raw shells and direct agent commands remain recovery paths. Cron, Slack, and gateway infrastructure
continue to run independently under tmux.

## Set up agents inside Herdr

The default sandbox ships with Claude Code, Codex, and Pi. OpenCode,
DeepAgents, Hermes, and Grok Build are optional image-level installs; T3 Code runs on
demand via the `/t3` skill or direct `npx`. Authenticate at least one harness before use.

> **Simplest cross-provider login — device mode via `/login`.** The most straightforward path
> that works the same across most harnesses: launch the agent in **interactive mode**, run
> **`/login`**, and choose **device mode** (device-auth). You get a short code + a URL to open
> in a browser on *any* device — no local browser on the host required, so it works cleanly on
> a **headless or remote sandbox** (e.g. a cloud VM you SSH into). Browser-redirect OAuth
> assumes a local browser and often fails there; device mode doesn't. The per-harness commands
> below are equivalents for when you prefer a one-liner — several expose an explicit
> `--device-auth` flag (e.g. `codex login --device-auth`, `grok login --device-auth`).

- **[Claude Code](./harnesses/claude-code.md)**: `claude auth login` (or `/login` in an interactive session), then `claude auth status` to verify
- **[Codex](./harnesses/codex.md)**: `codex login --device-auth` (device mode; or `/login` in-session)
- **[OpenCode](./harnesses/opencode.md)**: set `INSTALL_OPENCODE=true` in `.devcontainer/.env`, rebuild, then run `opencode auth login`
- **[Pi](./harnesses/pi.md)**: configure provider keys via environment variables
- **[DeepAgents](./harnesses/deepagents.md)**: set `INSTALL_DEEPAGENTS=true` in `.devcontainer/.env`, rebuild, then write provider keys to `~/.deepagents/.env`
- **[Hermes](./harnesses/hermes.md)**: set `INSTALL_HERMES=true` in `.devcontainer/.env`, rebuild, then run `hermes setup`
- **[Grok Build](./harnesses/grok-build.md)**: set `INSTALL_GROK_BUILD=true` in `.devcontainer/.env`, rebuild, verify `grok --version`, then run `grok login --device-auth` (headless/remote) or `grok login`
- **[T3 Code](./harnesses/t3code.md)**: authenticate one of Claude / Codex / OpenCode, then `/t3` or `npx t3` (browser UI on port 3773)

Claude Code remains the documented default. See
[the harnesses overview](./harnesses/overview) for the full list and
per-harness setup.

[Connecting to the Sandbox](/docs/connecting)

If `GH_TOKEN` was set during install, the entrypoint already ran
`gh auth login` and `gh auth setup-git` for you. Otherwise run them once
inside a Herdr pane:

```bash
gh auth login && gh auth setup-git
```

## Configuration

`.devcontainer/.env` is the **one** configuration file. It is gitignored and
generated from tracked `.devcontainer/.example.env` — by the installer, by
`oh init`, or by hand. Every key in the template ships commented out with its
default shown, so a fresh copy changes nothing; uncomment a key to take it over.

It works on **every** path. `make ...` and `oh ...` pass it to compose with
`--env-file`; the VS Code "Reopen in Container" path loads
`.devcontainer/docker-compose.yml` directly, and compose auto-loads
`.devcontainer/.env` sitting beside it. (Before 0.4.0 a `harness.yaml` layer sat
in front of this file and was readable on the first path only, so a key set
there silently did nothing under VS Code. It was removed; any leftover
`harness.yaml` is migrated into `.env` automatically on the next lifecycle
command.)

```bash
# .devcontainer/.env — non-secret settings (example)
SANDBOX_NAME=openharness
TZ=UTC
GIT_USER_NAME=your-name           # spaces are fine, no quotes needed
GIT_USER_EMAIL=you@example.com
INSTALL_OPENCODE=false
INSTALL_DEEPAGENTS=false
INSTALL_HERMES=false
INSTALL_GROK_BUILD=false
INSTALL_AGENT_BROWSER=false
WORKTREES_DIR=.oh/worktrees
```

The template also documents the SSH, Docker-socket, Hermes-dashboard, cron, and
prebuilt-image keys (all commented out by default). See
`.devcontainer/.example.env` for every available key and its default.

**Secrets** — keep in `.devcontainer/.env` only (gitignored):

| Var | Purpose |
|-----|---------|
| `GH_TOKEN` | GitHub token for non-interactive auth |
| `PI_SLACK_APP_TOKEN` | Slack Socket Mode app token (`xapp-`) |
| `PI_SLACK_BOT_TOKEN` | Slack bot token (`xoxb-`) |

**Non-secret settings** — same file, same format:

| Key | Purpose |
|-----|---------|
| `SANDBOX_NAME` | Container/compose project name |
| `TZ` | Container timezone |
| `GIT_USER_NAME` | Commit author name (spaces OK) |
| `GIT_USER_EMAIL` | Commit author email |
| `INSTALL_AGENT_BROWSER` | Set `true` to install Chromium (~1 GB) |
| `INSTALL_OPENCODE` | Set `true` to include OpenCode in the sandbox image |
| `INSTALL_DEEPAGENTS` | Set `true` to include DeepAgents in the sandbox image |
| `INSTALL_HERMES` | Set `true` to include Hermes in the sandbox image; state defaults to `~/harness/.hermes`, auth lives in `~/.hermes` |
| `INSTALL_GROK_BUILD` | Set `true` to include Grok Build in the sandbox image; all Grok user state lives in the persisted `~/.grok` volume |
| `WORKTREES_DIR` | Worktree/project-clone root (default `.oh/worktrees`) |

Apply changes with `make destroy && make sandbox`.

For additional services (databases, tunnels, reverse proxies), add overlay
paths to `composeOverrides[]` in `.oh/config.json` (gitignored, last wins). A
list is the one thing `.env` cannot hold, which is why that file survived the
collapse of every other configuration surface.

## End-to-end setup walkthrough

The full path from a bare Linux host to an authenticated multi-agent sandbox. Each step
inlines the command to run; follow the link for depth/troubleshooting. Steps 5–14 run
**inside the sandbox** (`make shell`); step 5 enters Herdr before setup. For agent-auth steps (9–12), the simplest
cross-provider method is `/login` → **device mode** inside each agent's interactive session
(see [Set up agents inside Herdr](#set-up-agents-inside-herdr)); the explicit commands shown are equivalents.

1. **Install host prerequisites** — Docker (+ Compose), Git, and `make`
   ([details](./installation.md#prerequisites-clone-path)):
   ```bash
   sudo apt-get install -y build-essential   # provides make (Debian/Ubuntu)
   ```
2. **Clone the repo** to `~/.openharness`:
   ```bash
   git clone --recurse-submodules https://github.com/mifunedev/openharness.git ~/.openharness
   cd ~/.openharness
   ```
3. **Create/edit `.devcontainer/.env`** — copy `.devcontainer/.example.env`, then set
   `SANDBOX_NAME`, `TZ`, `GIT_USER_NAME`, `GIT_USER_EMAIL`, and any optional `INSTALL_*`
   keys (see [Configuration](#configuration) above).
4. **Build and enter the sandbox**:
   ```bash
   make sandbox        # build + start (~10 min cold)
   make shell          # attach as the sandbox user
   ```
5. **Start Herdr** — your first inside-sandbox command; all remaining setup runs in its panes:
   ```bash
   herdr
   ```
6. **Authenticate GitHub over SSH** — choose SSH, generate a key, paste a token
   ([GitHub auth](./integrations/github.md)):
   ```bash
   gh auth login && gh auth setup-git
   ```
7. **Create your own private repo**:
   ```bash
   gh repo create <your-user>/openharness --private
   ```
8. **Point remotes at your repo + upstream** (SSH, so the step-6 key is used;
   [clone-and-own](./installation.md#clone-and-own-private-origin-and-upstream-recommended)):
   ```bash
   git remote set-url origin git@github.com:<your-user>/openharness.git
   git remote add upstream git@github.com:mifunedev/openharness.git
   git push -u origin HEAD
   ```
9. **Authenticate Claude Code** ([Claude Code](./harnesses/claude-code.md)):
   ```bash
   claude auth login && claude auth status
   ```
10. **Authenticate Codex** ([Codex](./harnesses/codex.md)):
   ```bash
   codex login --device-auth
   ```
   > Optional: DebugMCP (cross-harness debugging over MCP) is available if you attached via
   > VS Code — see [Enter the sandbox](#enter-the-sandbox) above, not this step.
11. **Authenticate Pi** — configure provider keys / OAuth ([Pi](./harnesses/pi.md)):
    ```bash
    pi        # first run walks provider auth
    ```
12. **Authenticate Hermes** (optional; needs `install.hermes: true`) ([Hermes](./harnesses/hermes.md)):
    ```bash
    hermes setup
    ```
13. **Configure Slack** for Pi (and Hermes) — create the Slack app, add tokens, set trust
    ([Slack](./integrations/slack.md); Hermes uses `hermes gateway setup`).
14. **Run and verify the gateways** (sandbox-only; watch read-only so you can't kill them —
    [Slack § Run and verify](./integrations/slack.md), [Hermes § Run and verify](./harnesses/hermes.md#run-and-verify-read-only)):
    ```bash
    gateway pi && gateway hermes        # start the client-slack-* sessions
    gateway status                      # both sessions + state
    tmux attach -r -t client-slack-pi   # read-only view; detach with Ctrl-b d
    ```

> Shortcut: if `GH_TOKEN` was set at install, the entrypoint already ran `gh auth login`
> + `gh auth setup-git` and generated/uploaded an SSH key for you (steps 5 partly done).

## Tear down

When you're finished, exit the shell and clean up from the host:

```bash
make destroy
```

This stops the container and removes its volumes. To keep auth credentials across rebuilds, stop without removing volumes:

```bash
make stop
```

Bring it back later with `make sandbox`.
