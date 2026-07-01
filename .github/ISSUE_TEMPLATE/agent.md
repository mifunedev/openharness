---
name: Agent
about: Provision a new agent workspace
title: "[AGENT] "
labels: agent
assignees: ""
---

## Identity

- **Name**: <!-- e.g. researcher, builder, alice -->
- **Role**: <!-- What is this agent responsible for? -->

## Context

<!-- What should this agent know? What projects, docs, or repos should it have access to? -->

---

## Workspace Setup

> An agent is a persistent, isolated workspace with its own branch, memory, and context. Agents are long-lived — they accumulate knowledge and work on multiple issues across their lifetime.

### Metadata

> **IMPORTANT**: The very first step should _ALWAYS_ be validating this metadata section to maintain a **CLEAN** development workflow.

```yml
agent: "<agent-name>"
branch: "agent/<agent-name>"
worktree_path: ".worktrees/<agent-name>"
```

### 1. Provision the agent

```bash
make sandbox
```

This will:

- Build the Docker image and start the sandbox container (`docker compose up -d --build`)
- Mount the workspace and run the setup script

`make sandbox` does **not** create the per-agent branch or worktree. The `branch` (`agent/<agent-name>`) and `worktree_path` (`.worktrees/<agent-name>`) fields from the Metadata block above are real conventions you create manually with `git worktree add` per the `/git` skill (`.mifune/skills/git/SKILL.md`) §Worktrees:

```bash
git worktree add -b agent/<agent-name> .worktrees/<agent-name> development
```

### 2. Enter the sandbox

```bash
make shell <agent-name>
claude
```

The positional argument to `make shell` is the **container name** (defaults to `openharness`, or `sandbox.name` from `harness.yaml`). Append `SHELL_USER=<user>` to connect as a non-default user, e.g. `make shell <agent-name> SHELL_USER=postgres`.

### 3. Verify

Run from the **host** (orchestrator side):

- [ ] Container is running (`make ps`)

Run **inside the sandbox** (after `make shell <agent-name>`):

- [ ] Workspace is accessible (`ls ~/harness/workspace`)
- [ ] `workspace/AGENTS.md` is present (the workspace also holds `.claude/`, among others — non-exhaustive)
- [ ] Harness identity and memory live at the repo root, **not** under `workspace/`: `.oh/context/SOUL.md` and `.oh/memory/MEMORY.md` are present
