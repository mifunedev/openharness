# Workspace

Agent working area. Bind-mounted into sandbox at `/home/sandbox/harness/workspace`. State persists across container restarts.

Template ships intentionally minimal — agent identity, memory, skills, and routines come from a harness pack you install (e.g. `@ryaneggz/mifune`), not from this directory.

## What lives here

- `.claude/rules/` — coding rules auto-loaded by Claude Code (`code-quality.md`, `git.md`, `token-conservation.md`).
- `.claude/.example.env.claude` — template for credentials your agent runtime needs.
- `.claude/settings.local.json` — Claude Code project-local settings (permissions, hooks).

## Where things go that aren't here

- Scheduled tasks → `crons/*.md` at repo root, executed by `scripts/cron-runtime.ts`.
- Memory → `memory/YYYY-MM-DD/` directories at repo root, created on demand.
- Pack-supplied identity, skills, and sub-agents → wherever your pack's README specifies.

## Operating rules

- Branch off `development`; never push `main` or `development` directly.
- Pre-commit hooks run lint + test; never use `--no-verify`.
- After `git push`, run `/ci-status` (orchestrator skill) — work is not done until CI is green.
