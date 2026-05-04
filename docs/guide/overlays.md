---
title: "Compose Overlays"
sidebar_position: 2
---


All sandboxes are built from `.devcontainer/Dockerfile` — a Debian Bookworm image with Node.js 22, pnpm, agent CLIs (Claude Code, Codex, OpenCode, Pi), and dev tools pre-installed.

Compose overlays in `.devcontainer/` add optional services or host-state mounts. Enable or disable them in `.openharness/config.json`.

## Available overlays

| Overlay | Purpose |
|---------|---------|
| `docker-compose.postgres.yml` | PostgreSQL 16 + devnet |
| `docker-compose.cloudflared.yml` | Cloudflare tunnel env vars |
| `docker-compose.git.yml` | Git worktree mount (worktrees only) |
| `docker-compose.ssh.yml` | Mount host `~/.ssh` read-only |
| `docker-compose.ssh-generate.yml` | Generate keypair in persistent volume |
| `docker-compose.sshd.yml` | SSH server daemon (port 2222, password auth) |
| `docker-compose.claude-host.yml` | Bind-mount host `~/.claude` (auth, memory, projects) |
| `docker-compose.codex-host.yml` | Bind-mount host `~/.codex` (auth, config) |
| `docker-compose.opencode-host.yml` | Bind-mount host `~/.local/share/opencode` (auth) |
| `docker-compose.pi-host.yml` | Bind-mount host `~/.pi` (auth, config) |
| `docker-compose.gateway.yml` | [Caddy reverse-proxy sidecar](./exposure.md) (auto-activated by first `openharness expose`) |

## Configuration

Edit `.openharness/config.json` to enable or disable overlays:

```json
{
  "composeOverrides": [
    ".devcontainer/docker-compose.postgres.yml",
    ".devcontainer/docker-compose.ssh-generate.yml"
  ]
}
```

Default enabled: `claude-host`, `codex-host`, `opencode-host`, and `pi-host` when the install host UID is 1000. `scripts/install.sh` disables host auth overlays on other UIDs so named Docker volumes take over. Docker socket is mounted in the base compose file.

After editing, run `make sandbox` (or `make destroy && make sandbox` if the container is already up) to apply changes.

## SSH key strategy

The SSH overlays are mutually exclusive — pick one:

| Overlay | When to use |
|---------|------------|
| `docker-compose.ssh.yml` | Mount host `~/.ssh` read-only — no GitHub setup needed inside the container |
| `docker-compose.ssh-generate.yml` | Generate a new keypair in a persistent volume — must add to GitHub |

## SSH server access

The base container does **not** run an SSH server. To enable SSH access, add the sshd overlay:

| Overlay | Purpose |
|---------|---------|
| `docker-compose.sshd.yml` | Run sshd as the main process, map port 2222 → 22 |

The entrypoint auto-configures password auth and generates host keys when this overlay is active.
The password is set from the `SANDBOX_PASSWORD` environment variable (default: `changeme`).

**Note:** The SSH *key* overlays (`ssh.yml`, `ssh-generate.yml`) manage SSH client keys for git authentication. The `sshd.yml` overlay manages the SSH *server* for remote access. They serve different purposes and can be used independently.

## Git worktree overlay

`docker-compose.git.yml` requires `GIT_COMMON_DIR` (only valid when running inside a git worktree). If you're not in a worktree, do **not** include this overlay — it will produce an invalid mount path.

## Adding PostgreSQL

To add PostgreSQL to your sandbox:

1. Add `".devcontainer/docker-compose.postgres.yml"` to `composeOverrides` in `.openharness/config.json`
2. Run `make sandbox`
3. The database is available at `postgresql://sandbox:sandbox@postgres:5432/sandbox`

## Sharing host Claude state (`claude-host`)

By default, each sandbox stores Claude CLI auth, memory, and project state
in the `claude-auth` named Docker volume — scoped to that sandbox only.
The `claude-host` overlay replaces that volume with **two read-write
bind-mounts** of your host state:

- `~/.claude/` (directory) — OAuth credentials, memory, MCP config, projects, sessions
- `~/.claude.json` (file) — theme, `numStartups`, tip history, per-project trust, MCP server list

Both are needed because Claude Code splits its state across the two
paths: credentials and session data live in the directory, but theme
and first-run onboarding state live in the sibling JSON file. With
both mounted, a fresh sandbox inherits full host state — no
re-onboarding, no text-style reselection, no tip re-cycling.

Enable it by adding the overlay path to your existing
`composeOverrides` array (do not overwrite — merge):

```json
{
  "composeOverrides": [
    ".devcontainer/docker-compose.codex-host.yml",
    ".devcontainer/docker-compose.claude-host.yml"
  ]
}
```

Then rebuild: `docker compose -f .devcontainer/docker-compose.yml down -v && docker compose -f .devcontainer/docker-compose.yml up -d --build`. Setting
`HOST_CLAUDE_DIR` alone does nothing — the overlay must be listed in
`composeOverrides`.

Override the defaults via `.devcontainer/.env` if your state lives
elsewhere:

- `HOST_CLAUDE_DIR` — alternate path for the directory (default `~/.claude`)
- `HOST_CLAUDE_JSON` — alternate path for the JSON file (default `~/.claude.json`)

**Pre-flight — both targets must exist on the host before first boot:**
Docker silently auto-creates missing bind-mount sources as
**directories**. If `~/.claude.json` does not exist, Docker will create
it as a directory owned by root, and `claude` will fail to parse it as
JSON. Check before enabling:

```bash
test -d ~/.claude && test -f ~/.claude.json && echo OK
```

**Tradeoffs — only enable for trusted workflows:**

- **Credential blast radius** — OAuth tokens are readable by any code running in the sandbox. Do not enable when running untrusted agent code.
- **`projects/` bleed-through** — Claude Code sessions from non-harness host work are visible inside the sandbox.
- **`.claude.json` bleed-through** — per-project `hasTrustDialogAccepted` entries, your full MCP server list, and tip counters from non-harness host work are visible inside the sandbox.
- **Host writes** — the sandbox writes new memory, projects, marker files, tip counters, and `numStartups` directly to your host state. Sandbox-side cleanup propagates.
- **Pre-existing `claude-auth` volume state is NOT migrated** — when you enable the overlay, anything previously onboarded into the sandbox's named volume is invisible; the host state is the only source of truth.

**UID requirement — host UID must equal 1000 (the sandbox UID):**
`~/.claude/.credentials.json` is mode `0600` (owner-only), so
group-based access reconciliation does not help. The overlay sets
`CLAUDE_HOST_BIND_MOUNT=1` and the entrypoint skips its recursive
`chown` to preserve host file ownership, but if your host UID is not
1000, the sandbox user cannot read `.credentials.json` and `claude`
will prompt for auth anyway. Check with `id -u` on the host before
enabling.

## Sharing host OpenCode state (`opencode-host`)

Without the host overlay, each sandbox stores OpenCode auth in a named Docker volume mounted at `~/.local/share/opencode`. OpenCode writes OpenAI OAuth credentials to `~/.local/share/opencode/auth.json`.

The `opencode-host` overlay replaces that volume with a read-write bind-mount of your host state:

- `~/.local/share/opencode/` — OpenCode auth and provider state

Enable it by adding the overlay path to your existing `composeOverrides` array:

```json
{
  "composeOverrides": [
    ".devcontainer/docker-compose.cloudflared.yml",
    ".devcontainer/docker-compose.opencode-host.yml"
  ]
}
```

Override the default via `.devcontainer/.env` if your state lives elsewhere:

- `HOST_OPENCODE_DIR` — alternate path for the directory (default `~/.local/share/opencode`)

Pre-flight:

```bash
test -d ~/.local/share/opencode && echo OK
```

Only enable host auth overlays for trusted workflows. OAuth tokens are readable by any code running in the sandbox, and sandbox writes propagate to the host directory.
