# Provision

Bring the sandbox up from scratch. `docker compose` is the canonical substrate; `make sandbox` is the canonical entrypoint and expands `config.json` → `composeOverrides` for you.

## TL;DR

```bash
make sandbox
```

That target runs `docker compose -f .devcontainer/docker-compose.yml [-f <override> …] up -d --build`, where the override list is read from `config.json` (see the [Makefile](https://github.com/ryaneggz/open-harness/blob/development/Makefile)). It builds the image (Node 22, agent CLIs, procps, tmux), starts the sandbox container, and runs `entrypoint.sh`. It is idempotent — re-run after editing `.devcontainer/.env`, `config.json`, or any compose file.

If `config.json` is missing, copy it from `config.example.json` first (or run `scripts/install.sh`).

## Compose overlays

Overlays live in `.devcontainer/docker-compose.*.yml` and are selected through `config.json` (at the repo root, gitignored) → `composeOverrides`. Each entry adds another `-f <file>` to the compose invocation.

| Overlay | Purpose |
|---|---|
| `docker-compose.cloudflared.yml` | Cloudflare tunnel env vars |
| `docker-compose.postgres.yml` | PostgreSQL 16 + devnet |
| `docker-compose.sshd.yml` | sshd as main process, port 2222:22 |
| `docker-compose.claude-host.yml` | Bind-mount host `~/.claude` (trust tradeoff) |
| `docker-compose.codex-host.yml` | Bind-mount host `~/.codex` (trust tradeoff) |
| `docker-compose.opencode-host.yml` | Bind-mount host `~/.local/share/opencode` (trust tradeoff) |
| `docker-compose.pi-host.yml` | Bind-mount host `~/.pi` (trust tradeoff) |
| `docker-compose.deepagents-host.yml` | Bind-mount host `~/.deepagents` — opt-in, wider blast radius (raw provider keys) |
| `docker-compose.ssh.yml` | Mount host `~/.ssh` read-only — git-over-SSH, mutually exclusive with `ssh-generate` |
| `docker-compose.ssh-generate.yml` | Generate persistent ED25519 keypair in named volume |
| `docker-compose.git.yml` | Mount the host's main-repo `.git/` into the sandbox (`GIT_COMMON_DIR` required) |

> The Docker socket is already mounted by the base `.devcontainer/docker-compose.yml` — no separate overlay needed for nested Docker.

> The `claude-host`, `codex-host`, `opencode-host`, `pi-host`, and `deepagents-host` overlays all require host UID = 1000 and pre-existing host directories (`~/.claude` + `~/.claude.json` for claude; `~/.codex` for codex; `~/.local/share/opencode` for OpenCode; `~/.pi` for pi; `~/.deepagents` for deepagents). See the trust tradeoffs in each `.devcontainer/docker-compose.*-host.yml` file. `scripts/install.sh` pre-creates the host directories and strips `*-host.yml` overlays from `composeOverrides` automatically when host UID is not 1000.

To enable an overlay, add its path to `config.json`:

```json
{
  "composeOverrides": [
    ".devcontainer/docker-compose.claude-host.yml",
    ".devcontainer/docker-compose.postgres.yml"
  ]
}
```

Then `make sandbox` again — the new overrides are picked up automatically.

### Without `make`

If you can't or don't want to use `make`, the equivalent invocation is:

```bash
COMPOSE_FILES="-f .devcontainer/docker-compose.yml"
for f in $(jq -r '.composeOverrides[]?' config.json); do
  COMPOSE_FILES="$COMPOSE_FILES -f $f"
done
docker compose --env-file .devcontainer/.env $COMPOSE_FILES up -d --build
```

## Validate the stack came up

```bash
make ps
docker exec -it -u sandbox openharness zsh -c 'tmux ls'
```

`tmux ls` should show at least `system-cron` (the croner runtime started by `entrypoint.sh`). Long-running app sessions live alongside per `.claude/rules/sandbox-processes.md`.

## Rebuild

To force a clean rebuild (image cache flush + fresh volumes), tear down with `-v` first:

```bash
make destroy
make sandbox
```

See [destroy.md](destroy.md) for full teardown semantics, [repair.md](repair.md) for diagnosing a stack that came up unhealthy.
