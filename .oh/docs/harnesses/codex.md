---
sidebar_position: 3
title: "Codex"
---

# Codex

Codex is OpenAI's CLI coding agent. It takes a natural-language task description and autonomously writes code, edits files, runs tests, and commits changes — with no interactive back-and-forth required.

## Purpose

Codex is designed for autonomous operation. Give it a task and it works through it end-to-end, making it a good fit for well-scoped tickets, automated refactors, and batch code generation. The sandbox default uses `--dangerously-bypass-approvals-and-sandbox` because Docker is the isolation boundary.

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

Run `codex login` once and follow the prompts:

```bash
codex login
```

This signs you in with your ChatGPT account (or an OpenAI API key) and writes credentials to `~/.codex/`. They survive container rebuilds when the auth volume is mounted.

On a headless or remote sandbox where the browser callback can't reach the container, use device-code auth instead — it prints a code to enter on another device, no port forwarding needed:

```bash
codex login --device-auth
```

If you'd rather use a raw API key non-interactively (CI, headless agents), export it instead:

```bash
export OPENAI_API_KEY=<your-key>
```

Add the export to `~/.zshrc`, `~/.bashrc`, or `.devcontainer/.env` to persist it across sessions.

## Common usage

The sandbox alias runs Codex with prompts disabled and Codex's own sandbox disabled:

```bash
# Run a task autonomously (alias: --dangerously-bypass-approvals-and-sandbox)
codex "Add input validation to the user registration endpoint"

# Explicit no-prompt/no-Codex-sandbox invocation
codex --dangerously-bypass-approvals-and-sandbox "Write unit tests for scripts/cron-runtime.ts"

# Prompt before higher-risk actions and keep Codex workspace sandboxing enabled
codex --ask-for-approval on-request --sandbox workspace-write "Refactor scripts/install.sh to use a single prompt helper"
```

Run inside a dedicated tmux session:

```bash
tmux new-session -d -s agent-codex 'codex --dangerously-bypass-approvals-and-sandbox "your task here"'
tmux attach -t agent-codex
```

## Tips

- Codex works best with a clearly scoped task description passed as the first argument.
- Use worktrees to isolate Codex's changes on its own branch before merging.
- For long-running autonomous tasks, pair with a heartbeat that re-invokes Codex on a schedule.

## Upstream documentation

- [Introducing Codex](https://openai.com/index/introducing-codex/)
- [openai/codex on GitHub](https://github.com/openai/codex)
