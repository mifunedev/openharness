---
title: "Quickstart"
---

# Quickstart

This guide takes you from zero to a running sandbox with an interactive shell in under five minutes. Required host dependencies are [Docker](https://docs.docker.com/get-docker/) with the Compose plugin, [Git](https://git-scm.com/), and `make` (build-essential) — the full list with install commands is in [Prerequisites](./installation.md#prerequisites).

## Before you start

Install Docker with the Compose plugin ([docs.docker.com/get-docker](https://docs.docker.com/get-docker/)), Git ([git-scm.com](https://git-scm.com/)), and `make` (build-essential — `sudo apt-get install build-essential` on Debian/Ubuntu, Xcode Command Line Tools on macOS). Node, Python, pnpm, and agent CLIs run inside the container.

## Install

The recommended path is **clone-and-own** — clone upstream, materialize local
`harness.yaml` from `harness.yaml.example`, edit it, then build (same as the
[README](https://github.com/mifunedev/openharness#-install)). To then make the
sandbox *yours* with a private repo + upstream, continue with the
[end-to-end walkthrough](#end-to-end-setup-walkthrough) below.

```bash
# 1. Clone upstream:
git clone https://github.com/mifunedev/openharness.git ~/.openharness && cd ~/.openharness

# 2. Materialize and edit local harness.yaml BEFORE building — set sandbox.name,
#    sandbox.timezone, git.user_name, git.user_email, optional installs:
make harness-config
nano harness.yaml

# 3. Build the image (~10 min cold, ~30s warm). make sandbox also creates
#    harness.yaml from harness.yaml.example if you skipped step 2.
make sandbox
```

<details><summary>Other install methods (one-line installer · fork-and-clone)</summary>

```bash
curl -fsSL https://oh.mifune.dev/install.sh | bash
```

Review-first alternative, without adding a host dependency:

```bash
curl -fsSL -o openharness-install.sh https://oh.mifune.dev/install.sh
# Review openharness-install.sh in your editor or pager before running it.
bash openharness-install.sh
```

The installer clones into `~/.openharness`, prompts to share your host `gh` token, writes `.devcontainer/.env` with safe defaults, creates `harness.yaml` from the template when missing, and brings the sandbox up via `docker compose`.

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

## Pick your harness

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
- **[OpenCode](./harnesses/opencode.md)**: set `install.opencode: true` in `harness.yaml` (or `INSTALL_OPENCODE=true` in `.devcontainer/.env`), rebuild, then run `opencode auth login`
- **[Pi](./harnesses/pi.md)**: configure provider keys via environment variables
- **[DeepAgents](./harnesses/deepagents.md)**: set `install.deepagents: true` in `harness.yaml` (or `INSTALL_DEEPAGENTS=true` in `.devcontainer/.env`), rebuild, then write provider keys to `~/.deepagents/.env`
- **[Hermes](./harnesses/hermes.md)**: set `install.hermes: true` in `harness.yaml` (or `INSTALL_HERMES=true` in `.devcontainer/.env`), rebuild, then run `hermes setup`
- **[Grok Build](./harnesses/grok-build.md)**: set `install.grok_build: true` in `harness.yaml` (or `INSTALL_GROK_BUILD=true` in `.devcontainer/.env`), rebuild, verify `grok --version`, then run `grok login --device-auth` (headless/remote) or `grok login`
- **[T3 Code](./harnesses/t3code.md)**: authenticate one of Claude / Codex / OpenCode, then `/t3` or `npx t3` (browser UI on port 3773)

Claude Code remains the documented default. See
[the harnesses overview](./harnesses/overview) for the full list and
per-harness setup.

[Connecting to the Sandbox](/docs/connecting)

If `GH_TOKEN` was set during install, the entrypoint already ran
`gh auth login` and `gh auth setup-git` for you. Otherwise run them once
inside the shell:

```bash
gh auth login && gh auth setup-git
```

## Configuration

`harness.yaml` at the repo root is local gitignored config for shared non-secret settings. It is generated from tracked `harness.yaml.example` by `make harness-config` (and automatically by `make sandbox` when missing). `.devcontainer/.env` is gitignored and holds host-local defaults generated by the installer (`SANDBOX_NAME`, `TZ`, git identity) plus secrets. Every key in the shipped template is commented out (defaults shown) — uncomment a key in `harness.yaml` to activate it; an active key overrides the same setting in `.devcontainer/.env`.

```yaml
# harness.yaml — non-secret settings (example)
sandbox:
  name: openharness
  timezone: UTC
git:
  user_name: your-name           # GIT_USER_NAME (spaces OK)
  user_email: you@example.com    # GIT_USER_EMAIL
install:
  opencode: false
  deepagents: false
  hermes: false
  grok_build: false
  agent_browser: false
paths:
  worktrees: .oh/worktrees     # WORKTREES_DIR
```

The file also has `paths:`, `crons:`, `autopilot:`, `slack:`, and `compose:` sections (all commented out by default) — uncomment the keys you need. See tracked `harness.yaml.example` for every available key and its default.

**Secrets** — keep in `.devcontainer/.env` only (gitignored):

| Var | Purpose |
|-----|---------|
| `GH_TOKEN` | GitHub token for non-interactive auth |
| `PI_SLACK_APP_TOKEN` | Slack Socket Mode app token (`xapp-`) |
| `PI_SLACK_BOT_TOKEN` | Slack bot token (`xoxb-`) |

**Non-secret settings** — set in `harness.yaml` (`harness.yaml` takes precedence over `.devcontainer/.env`):

| `harness.yaml` key | Purpose |
|--------------------|---------|
| `sandbox.name` | Container/compose project name |
| `sandbox.timezone` | Container timezone |
| `git.user_name` | Commit author name → `GIT_USER_NAME` (spaces OK) |
| `git.user_email` | Commit author email → `GIT_USER_EMAIL` |
| `install.agent_browser` | Set `true` to install Chromium (~1 GB) |
| `install.opencode` | Set `true` to include OpenCode in the sandbox image |
| `install.deepagents` | Set `true` to include DeepAgents in the sandbox image |
| `install.hermes` | Set `true` to include Hermes in the sandbox image; state defaults to `~/harness/.hermes`, auth lives in `~/.hermes` |
| `install.grok_build` | Set `true` to include Grok Build in the sandbox image; all Grok user state lives in the persisted `~/.grok` volume |
| `paths.worktrees` | Worktree/project-clone root → `WORKTREES_DIR` (default `.oh/worktrees`) |

Apply changes with `make destroy && make sandbox`.

For additional services (databases, tunnels, reverse proxies), add tracked
overlays under `compose.overrides:` in `harness.yaml`, or add user-local
overlays to `composeOverrides[]` in `config.json` (gitignored, last wins).

## End-to-end setup walkthrough

The full path from a bare Linux host to an authenticated multi-agent sandbox. Each step
inlines the command to run; follow the link for depth/troubleshooting. Steps 5–13 run
**inside the sandbox** (`make shell`). For the agent-auth steps (8–11), the simplest
cross-provider method is `/login` → **device mode** inside each agent's interactive session
(see [Pick your harness](#pick-your-harness)); the explicit commands shown are equivalents.

1. **Install host prerequisites** — Docker (+ Compose), Git, and `make`
   ([details](./installation.md#prerequisites)):
   ```bash
   sudo apt-get install -y build-essential   # provides make (Debian/Ubuntu)
   ```
2. **Clone the repo** to `~/.openharness`:
   ```bash
   git clone --recurse-submodules https://github.com/mifunedev/openharness.git ~/.openharness
   cd ~/.openharness
   ```
3. **Create/edit `harness.yaml`** — run `make harness-config`, then set `sandbox.name`,
   `sandbox.timezone`, `git.user_name`, `git.user_email`, and any optional installs
   (see [Configuration](#configuration) above).
4. **Build and enter the sandbox**:
   ```bash
   make sandbox        # build + start (~10 min cold)
   make shell          # attach as the sandbox user
   ```
5. **Authenticate GitHub over SSH** — choose SSH, generate a key, paste a token
   ([GitHub auth](./integrations/github.md)):
   ```bash
   gh auth login && gh auth setup-git
   ```
6. **Create your own private repo**:
   ```bash
   gh repo create <your-user>/openharness --private
   ```
7. **Point remotes at your repo + upstream** (SSH, so the step-5 key is used;
   [clone-and-own](./installation.md#clone-and-own-private-origin-and-upstream-recommended)):
   ```bash
   git remote set-url origin git@github.com:<your-user>/openharness.git
   git remote add upstream git@github.com:mifunedev/openharness.git
   git push -u origin HEAD
   ```
8. **Authenticate Claude Code** ([Claude Code](./harnesses/claude-code.md)):
   ```bash
   claude auth login && claude auth status
   ```
9. **Authenticate Codex** ([Codex](./harnesses/codex.md)):
   ```bash
   codex login --device-auth
   ```
   > Optional: DebugMCP (cross-harness debugging over MCP) is available if you attached via
   > VS Code — see [Enter the sandbox](#enter-the-sandbox) above, not this step.
10. **Authenticate Pi** — configure provider keys / OAuth ([Pi](./harnesses/pi.md)):
    ```bash
    pi        # first run walks provider auth
    ```
11. **Authenticate Hermes** (optional; needs `install.hermes: true`) ([Hermes](./harnesses/hermes.md)):
    ```bash
    hermes setup
    ```
12. **Configure Slack** for Pi (and Hermes) — create the Slack app, add tokens, set trust
    ([Slack](./integrations/slack.md); Hermes uses `hermes gateway setup`).
13. **Run and verify the gateways** (sandbox-only; watch read-only so you can't kill them —
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
