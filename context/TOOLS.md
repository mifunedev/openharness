# Orchestrator — environment inventory

What's available in the orchestrator's runtime. Read at session start to skip rediscovery cycles. Regenerate when `.oh/devcontainer/Dockerfile` or `.oh/install/*.sh` changes.

## CLI binaries on PATH

| Tool | Version (last seen) | Use |
|---|---|---|
| `claude` | 2.1.126 | Primary agent runtime — also the orchestrator itself |
| `codex` | 0.128.0 | Fallback agent for `.oh/scripts/ralph.sh --harness=codex` |
| `pi` | 0.72.0 | Fallback agent for `.oh/scripts/ralph.sh --harness=pi` |
| `gh` | 2.92.0 | GitHub CLI — issues, PRs, releases, gists |
| `git` | 2.39.5 | Source control |
| `docker` | 29.4.2 | Sandbox engine; `docker compose` is the canonical substrate per SPEC v0.7 |
| `tmux` | 3.x | Long-running process container — every cron, ralph loop, and dev server |
| `node` | 22.22.2 | Required by `.oh/scripts/cron-runtime.ts` (uses `--experimental-strip-types`) |
| `pnpm` | 10.33.0 | Package manager (pinned in `package.json#packageManager`) |
| `npm` | 10.9.7 | Available; pnpm preferred |
| `jq` | 1.6 | JSON parsing in hooks and shell scripts |
| `cloudflared` | 2026.3.0 | Tunnel for remote-mode exposure |
| `rg` | 13.0.0 | Fast grep |
| `curl` | 7.88.1 | HTTP client |
| `bash` | 5.2 | Default for hooks and `.oh/install/*.sh` |
| `zsh` | 5.9 | Interactive default in the sandbox |

## Hooks wired in `.claude/settings.json`

- `PreToolUse:Bash` → `.claude/hooks/deny-env-dump.sh` (secret-exposure guard)
- `PreToolUse:Read|Write|Edit|NotebookEdit` → `.claude/hooks/deny-secret-paths.sh`
- `Stop`, `Notification`, `permission_prompt`, `idle_prompt` → `.claude/hooks/notify_slack.sh` (if configured)

## Long-running processes (tmux convention)

Per `.mifune/skills/t3/references/sandbox-processes.md`:
- `cron-watchdog` — `.oh/devcontainer/entrypoint.sh` supervisor that restarts `cron-system` if the runtime tmux session dies
- `cron-system` — `.oh/scripts/cron-runtime.ts`, started and supervised by `cron-watchdog`
- `app-*` — user dev servers
- `agent-*` — AI agent processes
- `expose-public-*` — Cloudflare quick tunnels
- Task names from `tasks/<name>/` become tmux session names directly (e.g., `architecture-cleanup-pass-1`)

## Notable env vars

- `RALPH_HARNESS`, `RALPH_CLAUDE_FLAGS`, `RALPH_PI_FLAGS`, `RALPH_MAX_ITERATIONS`, `RALPH_SLEEP` — `.oh/scripts/ralph.sh` configuration
- `CRONS_DIR`, `CRON_AGENT_BIN` — `.oh/scripts/cron-runtime.ts` overrides
- `PUBLIC_DOMAIN` (in `.devcontainer/.env`) — switches Caddy gateway to remote mode

## Social tooling

- Post Bridge API key for social scheduling lives in `.codex/skills/post-bridge/.env` when configured. Treat it as secret material: never print it, never echo secret-named variables, and only output sanitized account IDs, usernames, post IDs, statuses, and scheduled times.
- Current Post Bridge account mapping seen 2026-05-05: LinkedIn personal `Ryan Eggleston` = `41731`; X personal `@JohnEggz` = `41738`; LinkedIn brand `Ruska AI` = `41732`; X brand `@ruska_ai` = `41735`; Instagram `ruska.ai` = `41737`.
- For X validation, use X's weighted character model. `twitter-text@3.1.0` is the official library and can be installed in a temp prefix (e.g. `/tmp/x-charcheck`) for one-off checks; URLs count as 23 weighted characters.

## What's NOT available

- No Cursor, Gemini CLI, or other agents in the sandbox by default — install via harness pack (e.g., `@ryaneggz/mifune`)
- No live MCP servers configured at the orchestrator level — workspace agent supplies them per-session

Regenerate this file when env changes. If a future session runs `command -v` more than three times to check for the same tools, this file is out of date.
