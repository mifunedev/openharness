---
title: "OpenCode"
---

# OpenCode

OpenCode is a terminal coding agent that can run interactively or execute one-shot tasks. Like every other harness it installs into `~/.local` rather than the image, and only when you run `oh harness install opencode`.

## Install

`oh harness install <id>` is the only door. It installs OpenCode into the
already-running sandbox without a rebuild:

```bash
oh harness install opencode
```

Nothing installs OpenCode at boot, and no configuration key selects it. See
[Harnesses Overview](./overview.md#installing-a-harness) for what the verb does
and what happens when the sandbox is not running.

### What the door runs

Open Harness installs the upstream npm package into the home mount as the `sandbox` user:

```bash
npm --prefix /home/sandbox/.local install -g opencode-ai
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
