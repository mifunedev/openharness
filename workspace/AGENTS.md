# Workspace

Agent working area. Bind-mounted into sandbox at `/home/sandbox/harness/workspace`. State persists across container restarts.

Template ships intentionally minimal. The tracked seed contains only:

- `AGENTS.md` — workspace-local operating notes for the agent.
- `CLAUDE.md` — compatibility symlink to `AGENTS.md` for Claude Code.

Agent identity, memory, skills, settings, and routines are pack/runtime state. They are created by the harness pack or running agent after provisioning, not by the base workspace template.

## Where things go that aren't here

- Scheduled tasks → `crons/*.md` at repo root, executed by `scripts/cron-runtime.ts`.
- Long-term orchestrator memory → `memory/` at repo root.
- Pack-supplied identity, skills, sub-agents, settings, and credentials → wherever that pack's README specifies, often under workspace-local runtime directories created after install.

## Operating rules

- Branch off `development`; never push `main` or `development` directly.
- Pre-commit hooks run lint + test; never use `--no-verify`.
- After `git push`, run `/ci-status` (orchestrator skill) — work is not done until CI is green.
