# Workspace

Agent working area. Bind-mounted into sandbox at `/home/sandbox/harness/workspace`. State persists across container restarts.

Template ships intentionally minimal — agent identity, memory, skills, and routines come from a harness pack you install (e.g. `@ryaneggz/mifune`), not from this directory.

## What lives here

- `.claude/rules/` — coding rules auto-loaded by Claude Code (`code-quality.md`, `git.md`, `token-conservation.md`).
- `.claude/settings.json` — tracked project settings; currently enables Claude Code's experimental agent-teams feature for in-sandbox sessions (see below).
- `.claude/.example.env.claude` — template for credentials your agent runtime needs.
- `.claude/settings.local.json` — Claude Code project-local settings (permissions, hooks).
- `startup.sh` — dev-server bootstrap, called from container entrypoint.

## Where things go that aren't here

- Scheduled tasks → `crons/*.md` at repo root, executed by `scripts/cron-runtime.ts`.
- Memory → `memory/YYYY-MM-DD/` directories at repo root, created on demand.
- Pack-supplied identity, skills, and sub-agents → wherever your pack's README specifies.

## Parallel work: agent teams vs sub-agents

`workspace/.claude/settings.json` enables Claude Code's experimental
agent-teams feature (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`,
`teammateMode: "in-process"`) for sessions invoked from this directory.
The orchestrator at the harness root does NOT have it enabled — and the
cron runtime explicitly disables it for non-interactive automation.

| Use | When |
|-----|------|
| Sub-agents (`Agent` tool, `/delegate`) | Fire-and-forget workers that report back to the caller. No peer messaging, no shared task list. Right for parallel research, audits, and any task where only the final result matters. |
| Agent teams | Peers that message each other directly through a shared mailbox + task list. Right for cross-layer implementation (frontend + backend + tests owned by different teammates), adversarial debate over competing hypotheses, and review work where reviewers should challenge each other's findings. |

Start with sub-agents. Reach for an agent team only when teammates would
actually need to talk to each other or claim work from a shared queue —
otherwise the coordination overhead and token cost (each teammate is a
full Claude instance) exceed the parallel benefit. Agent teams require
Claude Code ≥ 2.1.32; the sandbox Dockerfile documents this floor.

## Operating rules

- Branch off `development`; never push `main` or `development` directly.
- Pre-commit hooks run lint + test; never use `--no-verify`.
- After `git push`, run `/ci-status` (orchestrator skill) — work is not done until CI is green.
