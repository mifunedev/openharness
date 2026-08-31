---
title: "Quickstart"
---

# Quickstart

This guide takes you from zero to a running sandbox with an interactive shell in under five minutes. Required host dependencies are [Docker](https://docs.docker.com/get-docker/) with the Compose plugin, [Git](https://git-scm.com/), and [Node.js](https://nodejs.org/) ≥ 20 — the full list with install commands is in [Prerequisites](./installation.md#prerequisites).

## Before you start

Install Docker with the Compose plugin ([docs.docker.com/get-docker](https://docs.docker.com/get-docker/)), Git ([git-scm.com](https://git-scm.com/)), and Node.js ≥ 20 ([nodejs.org](https://nodejs.org/)) — Node runs the `oh` CLI, and `get-oh.sh` below installs it for you if you skip it. Python, pnpm, and the agent CLIs run inside the container.

## Install

`oh` is the only front door. Get it, then point it at a repo.

**1. Get `oh`** — from npm if you already have Node ≥ 20:

```bash
npm install -g @mifune/openharness      # or, zero-install: npx @mifune/openharness init
```

…or with the curl bootstrap, which offers to install nvm + Node 22 when Node is
missing:

```bash
curl -fsSL https://oh.mifune.dev/get-oh.sh | bash
```

Review-first, without adding a host dependency:

```bash
curl -fsSL -o get-oh.sh https://oh.mifune.dev/get-oh.sh
# Review get-oh.sh in your editor or pager before running it.
bash get-oh.sh
```

`get-oh.sh` installs the self-contained `oh` binary to `~/.local/bin/oh` — no
repo clone. `source <(curl -fsSL https://oh.mifune.dev/get-oh.sh)` installs *and*
puts `oh` on the current shell's PATH; after the piped form,
`export PATH="$HOME/.local/bin:$PATH"` does the same in an already-open shell.

**2. Equip a repo and bring the sandbox up:**

```bash
cd <your-project>
oh init          # .oh/ control plane + oh.json + a gitignored .env
oh sandbox       # build + start (~10 min cold, ~30s warm)
```

<details><summary>Other install methods (from source · one-line harness installer · fork)</summary>

**From source.** Build the CLI out of a checkout — the audit-first path, and the
one that lets you edit `oh.json` before the ~10-minute first image build:

```bash
git clone https://github.com/mifunedev/openharness.git ~/.openharness
cd ~/.openharness/.oh/cli && npm install && npm run build   # put dist/oh.js on PATH as `oh`
cd ~/.openharness
nano oh.json                              # non-secrets: name, timezone, git identity, install.*
cp .env.example .env && chmod 600 .env    # secrets only; gitignored
oh sandbox
```

**One-line installer for this harness.** Gets `oh`, clones this repo to
`~/.openharness`, configures it, and provisions — in one shot:

```bash
curl -fsSL https://oh.mifune.dev/install.sh | bash
```

Review-first: `curl -fsSL -o openharness-install.sh https://oh.mifune.dev/install.sh`,
read it, then `bash openharness-install.sh`. Run `bash .oh/scripts/install.sh`
from inside an existing clone and it detects the local repo. Set
`OH_GITHUB_REPO=<your-org>/<your-fork>` to install a fork — every override is in
[Installation](./installation.md).

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
oh shell
```
Pass an optional container name to attach to a different running container, e.g. `oh shell portfolio-advisor`. `oh shell` always attaches as the `sandbox` user; if the target container has no such user, use `docker exec -it -u <user> <container> zsh` instead.

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

The sandbox provisions Claude Code, Codex, and Pi — plus the Herdr and cloudflared
tools — into `~/.local` on first boot —
they live in the home mount, not the image, so `oh harness install <id>` upgrades
them in place without a rebuild. A first boot on a fresh home mount therefore needs
network access and takes a minute or two longer; the sandbox still comes up as a
usable shell if the registry is unreachable, and you can retry with
`bash .oh/scripts/provision-defaults.sh`. OpenCode, DeepAgents, Hermes, and Grok
Build are optional installs via `oh harness install <id>`; T3 Code runs on demand via the `/t3` skill
or direct `npx`. Authenticate at least one harness before use.

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
- **[OpenCode](./harnesses/opencode.md)**: `oh harness install opencode`, then run `opencode auth login`
- **[Pi](./harnesses/pi.md)**: configure provider keys via environment variables
- **[DeepAgents](./harnesses/deepagents.md)**: `oh harness install deepagents`, then write provider keys to `~/.deepagents/.env`
- **[Hermes](./harnesses/hermes.md)**: `oh harness install hermes`, then run `hermes setup`
- **[Grok Build](./harnesses/grok-build.md)**: `oh harness install grok-build`, verify `grok --version`, then run `grok login --device-auth` (headless/remote) or `grok login`
- **[T3 Code](./harnesses/t3code.md)**: authenticate one of Claude / Codex / OpenCode, then `/t3` or `npx t3` (browser UI on port 3773)

Claude Code remains the documented default. See
[the harnesses overview](./harnesses/overview.md) for the full list and
per-harness setup.

[Connecting to the Sandbox](/docs/connecting)

If `GH_TOKEN` was set during install, the entrypoint already ran
`gh auth login` and `gh auth setup-git` for you. Otherwise run them once
inside a Herdr pane:

```bash
gh auth login && gh auth setup-git
```

## Configuration

Configuration lives in **two** files at the repository root, split by kind.
Tracked `oh.json` holds every non-secret setting. A gitignored, mode-`0600`
`.env` holds nothing but secrets; the tracked `.env.example` documents every
allow-listed secret key, commented out, so a fresh copy changes nothing.
`.devcontainer/.env` is a symlink to that root `.env`.

Both work on **every** path. `oh ...` renders `oh.json` and passes it plus the
secrets file to compose with `--env-file`; the VS Code "Reopen in Container"
path loads `.devcontainer/docker-compose.yml` directly, and compose auto-loads
the `.devcontainer/.env` symlink sitting beside it — so secrets arrive, every
non-secret falls back to its compose default, and
[no overlay applies](./lifecycle-commands.md#vs-code-reopen-in-container-applies-no-overlays).
(Before 0.4.0 a
`harness.yaml` layer sat in front of the dotenv and was readable on the first
path only, so a key set there silently did nothing under VS Code. It was
removed; any leftover `harness.yaml` is migrated automatically on the next
lifecycle command.)

```json
// oh.json — non-secret settings (example)
{
  "name": "openharness",
  "timezone": "UTC",
  "git": { "userName": "your-name", "userEmail": "you@example.com" },
  "install": {
    "opencode": false,
    "deepagents": false,
    "hermes": false,
    "grokBuild": false,
    "agentBrowser": false
  }
}
```

`oh.json` also carries the SSH, Docker-socket, Hermes-dashboard, cron, build,
and prebuilt-image settings. See [Configuration](./configuration.md) for the
full field reference, and `oh config set <field> <value>` to edit one field.

**Secrets** — keep in the root `.env` only (gitignored, `0600`); set one with
`oh secret set <KEY>`:

| Var | Purpose |
|-----|---------|
| `GH_TOKEN` | GitHub token for non-interactive auth |
| `SANDBOX_PASSWORD` | The `sandbox` user's login and `sudo` password — **override the weak compose default on any network-reachable deployment** |
| `PI_SLACK_APP_TOKEN` | Slack Socket Mode app token (`xapp-`) |
| `PI_SLACK_BOT_TOKEN` | Slack bot token (`xoxb-`) |

**Non-secret settings** — `oh.json` fields:

| Field | Purpose |
|-----|---------|
| `name` | Container/compose project name |
| `timezone` | Container timezone |
| `git.userName` | Commit author name (spaces OK) |
| `git.userEmail` | Commit author email |
| `install.agentBrowser` | Set `true` to install Chromium (~1 GB) |
| `install.opencode` | Set `true` to include OpenCode in the sandbox image |
| `install.deepagents` | Set `true` to include DeepAgents in the sandbox image |
| `install.hermes` | Set `true` to include Hermes in the sandbox image; state defaults to `~/harness/.hermes`, auth lives in `~/.hermes` |
| `install.grokBuild` | Set `true` to include Grok Build in the sandbox image; all Grok user state lives in the persisted `~/.grok` volume |

Set one field with `oh config set <field> <value>` and one secret with
`oh secret set <KEY>`, then apply with `oh stop && oh sandbox`.

For additional services (databases, tunnels, reverse proxies), add overlay
paths to `composeOverrides[]` in `oh.json` (last wins).

## End-to-end setup walkthrough

The full path from a bare Linux host to an authenticated multi-agent sandbox. Each step
inlines the command to run; follow the link for depth/troubleshooting. Steps 5–14 run
**inside the sandbox** (`oh shell`); step 5 enters Herdr before setup. For agent-auth steps (9–12), the simplest
cross-provider method is `/login` → **device mode** inside each agent's interactive session
(see [Set up agents inside Herdr](#set-up-agents-inside-herdr)); the explicit commands shown are equivalents.

1. **Install host prerequisites** — Docker (+ Compose), Git, and Node.js ≥ 20
   ([details](./installation.md#prerequisites)):
   ```bash
   curl -fsSL -o get-oh.sh https://oh.mifune.dev/get-oh.sh   # review it first
   bash get-oh.sh                                            # installs `oh`, and Node if missing
   ```

   To skip the review step: `curl -fsSL https://oh.mifune.dev/get-oh.sh | bash`.
2. **Clone the repo** to `~/.openharness`:
   ```bash
   git clone --recurse-submodules https://github.com/mifunedev/openharness.git ~/.openharness
   cd ~/.openharness
   ```
3. **Edit `oh.json` and create `.env`** — set `name`, `timezone`, `git.userName`,
   `git.userEmail`, and any optional `install.*` fields in the tracked `oh.json`, then
   `cp .env.example .env && chmod 600 .env` for secrets (see
   [Configuration](#configuration) above).
4. **Build and enter the sandbox**:
   ```bash
   oh sandbox        # build + start (~10 min cold)
   oh shell          # attach as the sandbox user
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
7. **Create your own private repo and point the remotes at it** — one command,
   which asks first and defaults to no:
   ```bash
   oh config repo
   ```
   It prompts for owner, repository name, and visibility (default private), then runs
   `gh repo create`, renames the existing `origin` to `openharness`, adds your repo as
   `origin`, and pushes. Nothing is created unless you answer yes in that run —
   `oh init --yes`, `--dry-run`, and piped (non-TTY) runs skip the step entirely.
8. **Or do it by hand** — the same result without `gh`, keeping upstream as `upstream`
   ([clone-and-own](./installation.md#clone-and-own-private-origin-and-upstream-recommended)):
   ```bash
   gh repo create <your-user>/openharness --private
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
oh destroy
```

This stops the container and removes its volumes. To keep auth credentials across rebuilds, stop without removing volumes:

```bash
oh stop
```

Bring it back later with `oh sandbox`.
