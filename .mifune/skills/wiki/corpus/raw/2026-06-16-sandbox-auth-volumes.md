# Sandbox auth volume ownership source snapshot — 2026-06-16

This snapshot records the local source evidence for the `sandbox-auth-volumes` wiki entry.

## `.devcontainer/docker-compose.yml`

The sandbox mounts the repo at `/home/sandbox/harness` and persists agent/GitHub auth state in Docker named volumes under `/home/sandbox`:

- `..:/home/sandbox/harness`
- `claude-auth:/home/sandbox/.claude`
- `codex-auth:/home/sandbox/.codex`
- `pi-auth:/home/sandbox/.pi`
- `opencode-auth:/home/sandbox/.local/share/opencode`
- `grok-auth:/home/sandbox/.grok`
- `deepagents-auth:/home/sandbox/.deepagents`
- `cloudflared-auth:/home/sandbox/.cloudflared`
- `gh-config:/home/sandbox/.config/gh`

## `.devcontainer/entrypoint.sh`

The entrypoint computes the current sandbox user's numeric `uid:gid`, repairs auth/config mounts, reconciles the sandbox UID/GID to the bind-mounted checkout owner, then repeats the repair so auth mounts match the final identity. It deliberately avoids recursing into the bind-mounted checkout or `$HERMES_HOME` before UID sync.
