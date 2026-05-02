# Repair

Diagnose and remediate a sandbox that came up unhealthy. Replaces the deprecated `/repair` skill — the steps below are plain commands you run from the host or inside the sandbox.

## Detect environment

```bash
[ -f /.dockerenv ] && echo "inside sandbox" || echo "on host"
```

The remediation paths differ slightly: from the host you wrap commands in `docker exec`; inside the sandbox you run them directly.

## Health check

### From inside the sandbox

```bash
node --version                             # expect >= 22
command -v claude && claude --version      # default agent CLI
docker ps >/dev/null 2>&1 && echo OK       # docker socket (if docker overlay enabled)
tmux ls                                    # expect system-cron session
```

### From the host

```bash
docker exec -u sandbox openharness bash -c '
  node --version
  command -v claude && claude --version
  docker ps >/dev/null 2>&1 && echo OK
  tmux ls
'
```

If the container itself is down, `docker exec` returns non-zero. Bring it back with `docker compose -f .devcontainer/docker-compose.yml up -d`.

## Common failures

| Symptom | Fix |
|---|---|
| Container not running | `docker compose -f .devcontainer/docker-compose.yml up -d` |
| Container restart-loops | `docker logs openharness` — usually a missing env var or volume permission issue |
| `claude --version` fails | `docker exec -u sandbox openharness sudo npm install -g @anthropic-ai/claude-code` |
| Node version wrong | Image is stale. Rebuild: `docker compose ... down -v && docker compose ... up -d --build` |
| `docker ps` fails inside sandbox | Add `docker-compose.docker.yml` to `.openharness/config.json` and re-provision |
| `tmux ls` missing `system-cron` | Restart entrypoint: `docker compose ... restart` (the cron runtime launches in tmux from `.devcontainer/entrypoint.sh`) |
| Croner not firing | `docker exec -it -u sandbox openharness tmux attach -t system-cron` to inspect logs |

## Front-to-back URL check (when tunnels are configured)

If the sandbox exposes hostnames via cloudflared or the Caddy gateway, verify them end-to-end so failures are attributed to the right layer.

1. **Enumerate** — Parse `~/.cloudflared/config-*.yml` for `hostname → service` pairs (or read `.openharness/exposures.json` for Caddy routes).
2. **Front check** — Browse each public URL (use `/agent-browser` or `curl -I`) to confirm DNS → edge → tunnel → origin → render works.
3. **Localize** — When the front check fails, run a `curl` pair: public URL vs. local service.

| Public | Local | Diagnosis |
|---|---|---|
| 2xx/3xx | 2xx/3xx | Browser-only issue (DNS/cert/JS) |
| 5xx/000 | 2xx/3xx | Tunnel problem — restart cloudflared |
| any | 5xx/000 | Origin problem — check the app's tmux session log, restart it |

## Last resort

If repair attempts loop, `docker compose -f .devcontainer/docker-compose.yml down -v` and re-[provision](provision.md) from a clean slate.
