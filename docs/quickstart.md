---
sidebar_position: 3
title: "Quickstart"
---

# Quickstart

This guide takes you from zero to a running sandbox with an interactive shell in under five minutes. The only host dependency is [Docker](https://docs.docker.com/get-docker/).

## Before you start

Install Docker with the Compose plugin: [docs.docker.com/get-docker](https://docs.docker.com/get-docker/). Everything else runs inside the container.

## Install

```bash
curl -fsSL https://oh.mifune.dev/install.sh | bash
```

> **Self-hosting?** If you've already cloned your fork or re-pointed origin, skip the curl command above and run `bash scripts/install.sh` from inside the directory instead — the installer detects the local clone automatically.

The installer clones into `~/.openharness`, prompts to share your host
`gh` token, writes `.devcontainer/.env` with safe defaults, and brings
the sandbox up via `docker compose`.

## Enter the sandbox

**Recommended: attach with VS Code's Dev Containers extension.** Works identically whether the sandbox is on your laptop or on a remote host you're SSH'd into (with VS Code's Remote-SSH extension). One window, your normal editor, integrated terminal, file tree — the most consistent and productive setup across environments.

1. Install the [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers).
2. Open the Command Palette with `Ctrl+Shift+P` (`Cmd+Shift+P` on macOS) → **Dev Containers: Attach to Running Container...** → select `openharness`.
3. When the new VS Code window opens, set the workspace folder to `/home/sandbox/harness`.

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
demand via `npx`. Authenticate at least one harness before use:

- **[Claude Code](./harnesses/claude-code.md)**: run `claude` and follow the OAuth prompt
- **[Codex](./harnesses/codex.md)**: run `codex login`
- **[OpenCode](./harnesses/opencode.md)**: set `install.opencode: true` in `harness.yaml` (or `INSTALL_OPENCODE=true` in `.devcontainer/.env`), rebuild, then run `opencode auth login`
- **[Pi](./harnesses/pi.md)**: configure provider keys via environment variables
- **[DeepAgents](./harnesses/deepagents.md)**: set `install.deepagents: true` in `harness.yaml` (or `INSTALL_DEEPAGENTS=true` in `.devcontainer/.env`), rebuild, then write provider keys to `~/.deepagents/.env`
- **[Hermes](./harnesses/hermes.md)**: set `install.hermes: true` in `harness.yaml` (or `INSTALL_HERMES=true` in `.devcontainer/.env`), rebuild, then run `hermes setup`
- **[Grok Build](./harnesses/grok-build.md)**: set `install.grok_build: true` in `harness.yaml` (or `INSTALL_GROK_BUILD=true` in `.devcontainer/.env`), rebuild, verify `grok --version`, then run `grok login --device-auth` (headless/remote) or `grok login`
- **[T3 Code](./harnesses/t3code.md)**: authenticate one of Claude / Codex / OpenCode, then `npx t3` (browser UI on port 3773)

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

`harness.yaml` at the repo root is the master config for all non-secret settings. `.devcontainer/.env` holds secrets only. Every key in the shipped file is commented out (defaults shown) — uncomment a key to activate it; an active key overrides the same setting in `.devcontainer/.env`.

```yaml
# harness.yaml — non-secret settings (example)
sandbox:
  name: openharness
  timezone: UTC
install:
  opencode: false
  deepagents: false
  hermes: false
  grok_build: false
  agent_browser: false
```

**Secrets** — keep in `.devcontainer/.env` only (gitignored):

| Var | Purpose |
|-----|---------|
| `GH_TOKEN` | GitHub token for non-interactive auth |
| `SLACK_APP_TOKEN` | Slack Socket Mode app token (`xapp-`) |
| `SLACK_BOT_TOKEN` | Slack bot token (`xoxb-`) |

**Non-secret settings** — set in `harness.yaml` (`harness.yaml` takes precedence over `.devcontainer/.env`):

| `harness.yaml` key | Purpose |
|--------------------|---------|
| `sandbox.name` | Container/compose project name |
| `sandbox.timezone` | Container timezone |
| `install.agent_browser` | Set `true` to install Chromium (~1 GB) |
| `install.opencode` | Set `true` to include OpenCode in the sandbox image |
| `install.deepagents` | Set `true` to include DeepAgents in the sandbox image |
| `install.hermes` | Set `true` to include Hermes in the sandbox image; state defaults to `~/harness/.hermes`, auth lives in `~/.hermes` |
| `install.grok_build` | Set `true` to include Grok Build in the sandbox image; all Grok user state lives in the persisted `~/.grok` volume |

Apply changes with `make destroy && make sandbox`.

For additional services, the base ships with an opt-in Postgres overlay
at `.devcontainer/docker-compose.postgres.yml`. For anything else
(tunnels, reverse proxies), add tracked overlays under `compose.overrides:` in
`harness.yaml`, or add user-local overlays to `composeOverrides[]` in
`config.json` (gitignored, last wins).

## Next steps

With the sandbox running, here's what to wire up next:

- Slack bridge for your sandbox agent → [integrations/slack.md](./integrations/slack.md)
- GitHub auth (only if you skipped `GH_TOKEN` at install) → [integrations/github.md](./integrations/github.md)
- Postgres via Compose overlay → [integrations/postgres.md](./integrations/postgres.md)

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
