---
sidebar_position: 2
title: "Claude Code"
---

# Claude Code

Claude Code is Anthropic's terminal-based AI coding agent. It reads your codebase, plans multi-step changes, writes and edits files, runs commands, and iterates until the task is done — all from an interactive terminal session.

## Purpose

Claude Code is the default general-purpose agent in Open Harness. It handles everything from one-off file edits to multi-file refactors, test generation, and debugging. It works best for tasks that benefit from a persistent conversational loop where you can steer the agent mid-task.

## Install

Claude Code is installed by default during sandbox provisioning. The package is `@anthropic-ai/claude-code`, installed globally via pnpm:

```bash
pnpm add -g @anthropic-ai/claude-code
```

Verify the install:

```bash
claude --version
```

## Authentication

Claude Code authenticates via OAuth on first launch. Run it once and follow the browser prompt:

```bash
claude
```

Credentials are stored in `~/.claude/.credentials.json` inside the sandbox. The sandbox banner at login indicates whether credentials are present.

## Common usage

The sandbox alias pre-passes `--dangerously-skip-permissions` so Claude Code can read and write files without prompting on each operation:

```bash
# Start an interactive session (alias: skips permission prompts)
claude

# Ask a one-shot question without entering the interactive loop
claude -p "Explain the structure of the packages/ directory"

# Point at a specific working directory
claude --cwd /home/sandbox/harness/workspace
```

Run inside a dedicated tmux session to keep the agent alive across disconnects:

```bash
tmux new-session -d -s agent-claude 'claude'
tmux attach -t agent-claude
```

## Tips

- Use worktrees to give Claude Code its own branch: `git worktree add -b agent/claude .worktrees/agent/claude development`
- Place a `SOUL.md` in the workspace to set the agent's persona and project context.
- Crons in `crons/` (parsed by `scripts/cron-runtime.ts`) can fire Claude Code on a schedule for autonomous tasks.

## Upstream documentation

- [Claude Code overview](https://docs.claude.com/en/docs/claude-code/overview)
- [Anthropic docs](https://docs.anthropic.com/en/docs/claude-code)
