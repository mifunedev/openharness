# Workspace

The agent's working area, bind-mounted into the sandbox at `/home/sandbox/harness/workspace`. State persists across container restarts.

This template ships intentionally minimal — agent identity, memory, skills, and routines are supplied by a harness pack you install (e.g. `@ryaneggz/mifune`), not by this directory.

## What lives here

- `.claude/rules/` — coding rules auto-loaded by Claude Code (`code-quality.md`, `git.md`, `token-conservation.md`).
- `.claude/.example.env.claude` — template for credentials the agent runtime needs.
- `.claude/settings.local.json` — Claude Code project-local settings (permissions, hooks).
- `startup.sh` — dev-server bootstrap, called from the container entrypoint.

## Where things go that aren't here

- Scheduled tasks → `crons/*.md` at the repo root, executed by `scripts/cron-runtime.ts`.
- Memory → `memory/YYYY-MM-DD/` directories at the repo root, created on demand.
- Pack-supplied identity, skills, and sub-agents → wherever the pack's README specifies.

## Operating rules

- Branch: feature branches off `development`; never push `main` or `development` directly.
- Pre-commit hooks run lint + test; never use `--no-verify`.
- After `git push`, run `/ci-status` (orchestrator skill) — work is not done until CI is green.
