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

Either way you're inside the isolated sandbox as the `sandbox` user. Working
directory: `/home/sandbox/harness`.

## Pick your harness

The sandbox ships with Claude Code, Codex, OpenCode, Pi, and DeepAgents
preinstalled, plus T3 Code on demand via `npx`. Authenticate at least one
before use:

- **[Claude Code](./harnesses/claude-code.md)**: run `claude` and follow the OAuth prompt
- **[Codex](./harnesses/codex.md)**: run `codex login`
- **[OpenCode](./harnesses/opencode.md)**: run `opencode auth login`
- **[Pi](./harnesses/pi.md)**: configure provider keys via environment variables
- **[DeepAgents](./harnesses/deepagents.md)**: write provider keys to `~/.deepagents/.env`
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

`.devcontainer/.env` is the single customization surface — generated with
safe defaults during install. The most-edited values:

| Var | Purpose |
|-----|---------|
| `SANDBOX_NAME` | Container/compose project name |
| `GH_TOKEN` | GitHub token for non-interactive auth |
| `TZ` | Container timezone |
| `INSTALL_AGENT_BROWSER` | Set `true` to install Chromium (~1 GB) |

Apply changes with `make destroy && make sandbox`.

For additional services, the base ships with an opt-in Postgres overlay
at `.devcontainer/docker-compose.postgres.yml`; for anything else
(tunnels, reverse proxies), register your own compose overlay by
appending it to `composeOverrides[]` in `config.json`.

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
