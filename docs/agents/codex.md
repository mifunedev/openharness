---
sidebar_position: 3
title: "Codex"
---

# Codex

Codex is OpenAI's CLI coding agent. It takes a natural-language task description and autonomously writes code, edits files, runs tests, and commits changes — with no interactive back-and-forth required.

## Purpose

Codex is designed for fully autonomous operation. Give it a task and it works through it end-to-end, making it a good fit for well-scoped tickets, automated refactors, and batch code generation. Its `--full-auto` mode (the sandbox default) requires no confirmation prompts.

## Install

Codex is installed by default during sandbox provisioning. The package is `@openai/codex`, installed globally via pnpm:

```bash
pnpm add -g @openai/codex
```

Verify the install:

```bash
codex --version
```

## Authentication

Codex reads your OpenAI API key from the environment. Set it in the sandbox before running:

```bash
export OPENAI_API_KEY=<your-key>
```

Add the export to `~/.zshrc` or `~/.bashrc` to persist it across sessions. You can also set it in `.devcontainer/.env` before provisioning so it is injected automatically.

## Common usage

The sandbox alias runs Codex in fully autonomous mode by default:

```bash
# Run a task autonomously (alias: --full-auto)
codex "Add input validation to the user registration endpoint"

# Explicit full-auto flag
codex --full-auto "Write unit tests for scripts/cron-runtime.ts"

# Approval mode: Codex proposes each change and waits for confirmation
codex --approval-mode "Refactor scripts/install.sh to use a single prompt helper"
```

Run inside a dedicated tmux session:

```bash
tmux new-session -d -s agent-codex 'codex --full-auto "your task here"'
tmux attach -t agent-codex
```

## Tips

- Codex works best with a clearly scoped task description passed as the first argument.
- Use worktrees to isolate Codex's changes on its own branch before merging.
- For long-running autonomous tasks, pair with a heartbeat that re-invokes Codex on a schedule.

## Upstream documentation

- [Introducing Codex](https://openai.com/index/introducing-codex/)
- [openai/codex on GitHub](https://github.com/openai/codex)
