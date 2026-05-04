---
sidebar_position: 5
title: "OpenCode"
---

# OpenCode

OpenCode is a terminal coding agent that can run interactively or execute one-shot tasks. It ships preinstalled in the sandbox image alongside Claude Code, Codex, and Pi.

## Install

OpenCode is installed by default during sandbox provisioning. The npm package is `opencode-ai`, installed globally with npm in the sandbox image:

```bash
npm install -g opencode-ai
```

Verify the install:

```bash
opencode --version
```

## Authentication

For ChatGPT Plus and Pro users, the recommended default is OpenAI OAuth through OpenCode:

```bash
opencode
/connect
```

Choose **OpenAI** in the `/connect` flow. OpenCode stores auth at `~/.local/share/opencode/auth.json` inside the sandbox.

API key and provider environment variables are secondary. Use them when you need a non-OAuth provider or service-account style setup.

## Common usage

```bash
# Start an interactive session
opencode

# Run a one-shot task
opencode run "Add input validation to the signup form"
```

Run inside a dedicated tmux session to keep the agent alive across disconnects:

```bash
tmux new-session -d -s agent-opencode 'opencode'
tmux attach -t agent-opencode
```

## Host auth overlay

The `opencode-host` overlay bind-mounts your host OpenCode state from `~/.local/share/opencode` into the sandbox. Enable it only for trusted workflows, because any code running in the sandbox can read those credentials.

## Upstream documentation

- [OpenCode CLI](https://opencode.ai/docs/cli/)
- [OpenCode providers](https://opencode.ai/docs/providers/)
