---
sidebar_position: 4
title: "Gemini"
unlisted: true
---

# Gemini CLI

Gemini CLI is Google's open-source AI agent for the terminal. It connects to Google's Gemini models and can read files, run commands, and perform multi-step coding tasks from a conversational interface.

## Purpose

Gemini CLI brings Google's Gemini family of models into the Open Harness sandbox alongside Claude Code, Codex, and Pi. It is a good option when you want access to Gemini's large context window, Google-specific integrations, or simply want to compare outputs across model families on the same codebase.

## Install

Gemini CLI is available in the sandbox but is not installed by default. Install it globally via npm or pnpm:

```bash
pnpm add -g @google/gemini-cli
# or
npm install -g @google/gemini-cli
```

Verify the install:

```bash
gemini --version
```

## Authentication

Gemini CLI supports two authentication methods.

**Google account (OAuth) — easiest:**

```bash
gemini
```

On first run, Gemini CLI opens a browser OAuth flow. Complete it and credentials are cached locally.

**API key:**

```bash
export GEMINI_API_KEY=<your-key>
gemini
```

Add the export to `~/.zshrc` or set it in `.devcontainer/.env` before provisioning.

## Common usage

```bash
# Start an interactive session
gemini

# Run a one-shot prompt
gemini -p "Summarize the architecture in docs/architecture/"

# Point at a specific directory
gemini --cwd /home/sandbox/harness/workspace
```

Run inside a dedicated tmux session:

```bash
tmux new-session -d -s agent-gemini 'gemini'
tmux attach -t agent-gemini
```

## Tips

- Gemini CLI has a large context window — useful for whole-repo questions where other agents might truncate context.
- Use worktrees to give Gemini its own branch: `git worktree add -b agent/gemini .worktrees/agent/gemini development`
- Gemini can run alongside Claude Code in separate tmux sessions with no conflicts.

## Upstream documentation

- [gemini-cli on GitHub](https://github.com/google-gemini/gemini-cli)
