# Provision

Bring the sandbox up from scratch. Replaces the deprecated `/provision` skill — `docker compose` is the canonical substrate per SPEC v0.7.

## TL;DR

```bash
docker compose -f .devcontainer/docker-compose.yml up -d --build
```

That single command builds the image (Node 22, agent CLIs, procps, tmux), starts the sandbox container, and runs `entrypoint.sh` + `startup.sh`. It is idempotent — re-run after editing `.devcontainer/.env` or any compose file.

## Compose overlays

Overlays live in `.devcontainer/docker-compose.*.yml` and are opt-in via `.openharness/config.json` → `composeOverrides`. Each entry adds another `-f <file>` to the compose invocation.

| Overlay | Purpose |
|---|---|
| `docker-compose.docker.yml` | Mount the host Docker socket into the sandbox |
| `docker-compose.cloudflared.yml` | Cloudflare tunnel env vars |
| `docker-compose.gateway.yml` | Caddy gateway for `oh expose`-style routing (see `.claude/rules/gateway-routing.md`) |
| `docker-compose.postgres.yml` | PostgreSQL 16 + devnet |
| `docker-compose.sshd.yml` | sshd as main process, port 2222:22 |
| `docker-compose.claude-host.yml` | Bind-mount host `~/.claude` (trust tradeoff) |
| `docker-compose.codex-host.yml` | Bind-mount host `~/.codex` (trust tradeoff) |
| `docker-compose.ssh.yml` | Mount host `~/.ssh` read-only — git-over-SSH, mutually exclusive with `ssh-generate` |
| `docker-compose.ssh-generate.yml` | Generate persistent ED25519 keypair in named volume |

> The `claude-host` overlay requires host UID = 1000 and pre-existing `~/.claude` + `~/.claude.json`. See the trust tradeoffs in `.devcontainer/docker-compose.claude-host.yml`.

To enable an overlay, add its path to `.openharness/config.json`:

```json
{
  "composeOverrides": [
    ".devcontainer/docker-compose.docker.yml",
    ".devcontainer/docker-compose.gateway.yml"
  ]
}
```

Then provision with the overlay list expanded:

```bash
COMPOSE_FILES="-f .devcontainer/docker-compose.yml"
for f in $(jq -r '.composeOverrides[]' .openharness/config.json); do
  COMPOSE_FILES="$COMPOSE_FILES -f $f"
done
docker compose --env-file .devcontainer/.env $COMPOSE_FILES up -d --build
```

## Validate the stack came up

```bash
docker compose -f .devcontainer/docker-compose.yml ps
docker exec -it -u sandbox openharness zsh -c 'tmux ls'
```

`tmux ls` should show at least `system-cron` (the croner runtime started by the entrypoint). Long-running app sessions live alongside per `.claude/rules/sandbox-processes.md`.

## Rebuild

To force a clean rebuild (image cache flush + fresh volumes), tear down with `-v` first:

```bash
docker compose -f .devcontainer/docker-compose.yml down -v
docker compose -f .devcontainer/docker-compose.yml up -d --build
```

See [destroy.md](destroy.md) for full teardown semantics, [repair.md](repair.md) for diagnosing a stack that came up unhealthy.
