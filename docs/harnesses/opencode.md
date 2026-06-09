---
sidebar_position: 5
title: "OpenCode"
---

# OpenCode

OpenCode is a terminal coding agent that can run interactively or execute one-shot tasks. It is an optional image-level runtime in Open Harness; the default sandbox image ships Claude Code, Codex, and Pi only.

## Install (optional)

Enable OpenCode in `harness.yaml`:

```yaml
install:
  opencode: true
```

Or set `INSTALL_OPENCODE=true` in `.devcontainer/.env` (legacy).

Then rebuild/restart the sandbox:

```bash
make stop && make sandbox
```

Open Harness installs the upstream npm package globally during image build:

```bash
npm install -g opencode-ai
```

Verify the install inside the sandbox:

```bash
opencode --version
```

## Authentication

Run `opencode auth login` once and follow the prompts:

```bash
opencode auth login
```

For ChatGPT Plus and Pro users, choose **OpenAI** at the provider prompt to authenticate via OAuth. OpenCode stores credentials at `~/.local/share/opencode/auth.json` inside the sandbox. The same flow is reachable from inside an interactive `opencode` session via the `/connect` slash command.

Provider API key environment variables are secondary. Use them when you need a non-OAuth provider or a service-account style setup.

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

## Upstream documentation

- [OpenCode documentation](https://opencode.ai/docs/)
- [OpenCode CLI](https://opencode.ai/docs/cli/)
- [OpenCode providers](https://opencode.ai/docs/providers/)
- [`sst/opencode` on GitHub](https://github.com/sst/opencode)
