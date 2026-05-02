---
title: "Workspace Structure"
sidebar_position: 4
---


The `workspace/` directory is bind-mounted into every sandbox at container startup. It contains the agent's identity, operating procedures, memory, scheduled tasks, and application code. Changes made on the host are visible inside the container immediately, and vice versa.

## Directory tree

```
workspace/
  AGENTS.md             # Operating procedures — decision rules, skills, sub-agents
  CLAUDE.md             # Symlink → AGENTS.md (Claude Code reads this automatically)
  SOUL.md               # Agent personality, tone, values, guardrails
  IDENTITY.md           # Name, role, mission, stack, URLs
  USER.md               # Owner preferences, constraints, goals
  TOOLS.md              # Environment, available tools, service endpoints
  HEARTBEAT.md          # Meta-maintenance routines
  MEMORY.md             # Long-term memory (learned decisions, lessons)

  heartbeats/           # Heartbeat task definitions (frontmatter .md files)
  startup.sh            # Runs on container boot after onboarding

  memory/               # Daily activity logs (memory/YYYY-MM-DD/log.md)
  wiki/                 # LLM-maintained knowledge base
    index.md            # Master catalog of all wiki pages
    log.md              # Operations log (append-only)
    sources/            # Raw input documents (immutable)
    pages/              # LLM-generated wiki pages
  projects/             # Application code (e.g., Next.js app)

  .claude/
    rules/              # Coding standards (auto-loaded by Claude Code)
    skills/             # Reusable skill definitions
    agents/             # Sub-agent prompts
  .slack/
    MEMORY.md           # Slack-specific memory
```

## Identity files

| File | Purpose | Created by | Evolved by |
|------|---------|-----------|-----------|
| `IDENTITY.md` | Name, role, mission, tech stack, URLs | Orchestrator | Agent |
| `SOUL.md` | Personality, communication style, values, guardrails | Orchestrator | Agent |
| `USER.md` | Owner's preferences, working style, constraints, goals | User / Orchestrator | User |
| `TOOLS.md` | Available tools, services, environment details, workflows | Orchestrator | Agent |
| `AGENTS.md` | Decision rules, available skills, sub-agents, Slack interface | Orchestrator | Agent |
| `HEARTBEAT.md` | Meta-maintenance routines and self-improvement procedures | Agent | Agent |
| `MEMORY.md` | Learned facts, past decisions, lessons from experience | Agent | Agent |

`CLAUDE.md` is a symlink to `AGENTS.md` so Claude Code automatically loads the agent's operating procedures at session start without requiring a separate file.

## Decision rules for new information

When the agent learns something new, it writes to the appropriate file:

| What was learned | Where it goes |
|-----------------|--------------|
| New personality trait or communication preference | `SOUL.md` |
| User preference or constraint | `USER.md` |
| New tool, service, or environment detail | `TOOLS.md` |
| New operating procedure or skill | `AGENTS.md` |
| Lesson from experience, factual knowledge | `MEMORY.md` |
| Domain knowledge from external documents | `wiki/pages/` |
| Coding standard or file-type convention | `.claude/rules/` |

## Daily activity logs

The `memory/` directory uses one directory per day (`memory/YYYY-MM-DD/`). The day's append-only log is `log.md`; ad-hoc artifacts (decisions, transcripts, archived task folders) live alongside it. Per SPEC v0.7 §"Memory structure" the directory-per-day form is canonical; flat `memory/<date>.md` files are deprecated. Each `log.md` entry follows a structured format:

```markdown
## [Activity] — HH:MM UTC
- **Result**: OP | NO-OP | SKIP
- **Item**: #N or "none"
- **Action**: what was done
- **Duration**: ~Xs
- **Observation**: one sentence takeaway
```

Logs are append-only. Agents distill durable lessons from them into `MEMORY.md` periodically.

## Scheduled work

Recurring tasks live in `crons/` at the repo root, not inside `workspace/`. Each `.md` file has YAML frontmatter (`id`, `schedule`, `timezone`, `enabled`, `overlap`, `catchup`) and a body that is passed to the agent CLI when the schedule fires. The croner runtime starts in the `system-cron` tmux session via `.devcontainer/entrypoint.sh`. See SPEC v0.7 §"Croner runtime" for the full contract.

## Application code

The `projects/` directory is reserved for application code. The harness ships without a default app — bring your own (Next.js, FastAPI, plain Node, anything). The agent inside the sandbox owns whatever lands in `projects/`.

## Ownership model

The orchestrator creates the initial workspace structure during provisioning. Once the agent starts, it owns all files in `workspace/` and evolves them based on its experience. The orchestrator does not modify agent-owned files after initial scaffolding.
