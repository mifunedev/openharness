---
sidebar_position: 5
title: "DeepAgents"
---

# DeepAgents

DeepAgents is LangChain's terminal coding agent. It runs interactive
conversational sessions and one-shot non-interactive tasks against multiple
LLM providers, with optional shell tool use gated by an explicit allow list.

DeepAgents is an **optional supported runtime** in Open Harness. The default
agent set is Claude Code, Codex, and Pi; enable DeepAgents when its provider
mix or non-interactive shell-allow-list model is the right fit for a task.

## Purpose

- Multi-provider agent (Anthropic, OpenAI, etc.) configurable from a single
  `~/.deepagents/.env` file.
- Non-interactive mode (`-n "$task"`) with explicit shell-allow-list gating,
  suitable for Ralph harness loops with a constrained default tool surface.
- Project-aware: optionally reads memory and skills from a repo-local
  `.deepagents/` directory at the workspace root.

## Install (optional)

Enable DeepAgents in `harness.yaml`:

```yaml
install:
  deepagents: true
```

Or set `INSTALL_DEEPAGENTS=true` in `.devcontainer/.env` (legacy).

Then rebuild/restart the sandbox:

```bash
make stop && make sandbox
```

Open Harness installs the upstream CLI during image build via `uv tool
install` into image-level paths:

```bash
uv tool install deepagents-cli
```

The `deepagents` shim lands on `/usr/local/bin` so it is on PATH for the
`sandbox` user when the flag is enabled.

Verify the install inside the sandbox:

```bash
deepagents -v
```

If the command is not found, confirm `install.deepagents: true` is set in
`harness.yaml` (or `INSTALL_DEEPAGENTS=true` in `.devcontainer/.env`), then rebuild with `make stop && make sandbox`.

## Authentication and provider keys

DeepAgents reads provider API keys from `~/.deepagents/.env` and CLI
defaults from `~/.deepagents/config.toml`. The directory is persisted by
the `deepagents-auth` named volume by default, so credentials survive
container rebuilds.

Create the env file on first use:

```bash
mkdir -p ~/.deepagents
cat > ~/.deepagents/.env <<'EOF'
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
EOF
chmod 600 ~/.deepagents/.env
```

The sandbox banner reports DeepAgents as **installed** when `deepagents` is
on PATH and **configured** only when `~/.deepagents/.env` or
`~/.deepagents/config.toml` is non-empty — an empty mounted directory is
not treated as authenticated.

## State persistence and repo-local `.deepagents/`

Two separate directories carry DeepAgents state, with very different
durability and review semantics:

| Path | Scope | Persistence | Notes |
|---|---|---|---|
| `~/.deepagents/` | Per-sandbox user state | Survives rebuilds via the `deepagents-auth` volume | Provider keys, model defaults, memory, skills, sessions live here. **Only place secrets here.** |
| `<repo>/.deepagents/` | Per-project | Whatever git decides | Project memory and skills the agent may load from the workspace root. **Treat as project data — follows normal `.gitignore` and code-review rules.** |

A repo-local `.deepagents/` directory may be read by the agent and may be
committed to the repository — keep secrets and provider keys **only** in
`~/.deepagents/` or in ignored local files. Never commit a `.env` to the
repo-local `.deepagents/`.

v1 of Open Harness persists only `/home/sandbox/.deepagents`; the
repo-local `.deepagents/` is project data subject to your repository's
ordinary git rules.

## Common usage

### Interactive

Launch a conversational session:

```bash
deepagents
```

Run inside a dedicated tmux session so the conversation survives shell
disconnects (per `.claude/rules/sandbox-processes.md`):

```bash
tmux new-session -d -s agent-deepagents 'deepagents'
tmux attach -t agent-deepagents
```

### Non-interactive

Pass a task with `-n` for a single execution. By default DeepAgents
**disables shell execution in non-interactive mode** unless an allow list
is configured via `-S`/`--shell-allow-list` or
`DEEPAGENTS_CLI_SHELL_ALLOW_LIST`. Open Harness defaults pick the
`recommended` allow list, never `all`:

```bash
deepagents -y --shell-allow-list recommended -n "Summarize the changes on this branch" -q --no-stream
```

Flags:

- `-y` — assume "yes" to confirmation prompts (the sandbox is the trust
  boundary).
- `--shell-allow-list recommended` — allow only the curated safe shell
  command set. **Do not default to `all`** — see the warning below.
- `-n "$task"` — non-interactive single task.
- `-q --no-stream` — quiet, buffered output for clean log capture.

### Ralph usage

`scripts/ralph.sh` accepts `deepagents` as an explicit harness:

```bash
scripts/ralph.sh --harness=deepagents <task-name>
# or
RALPH_HARNESS=deepagents scripts/ralph.sh <task-name>
```

DeepAgents is never auto-selected by Ralph fallback — it must be chosen
explicitly. The default invocation is:

```bash
deepagents -y --shell-allow-list recommended -q --no-stream --max-turns 25 -n "$task"
```

Two environment overrides apply:

| Variable | Default | Purpose |
|---|---|---|
| `RALPH_DEEPAGENTS_FLAGS` | `-y --shell-allow-list recommended -q --no-stream` | Override the flag string before the task. **Do not include `--max-turns` here** — the cap is appended separately. |
| `RALPH_DEEPAGENTS_MAX_TURNS` | `25` | Per-call turn cap, always appended as `--max-turns "$RALPH_DEEPAGENTS_MAX_TURNS"` so a single DeepAgents call cannot hang the iteration. |

> **`--shell-allow-list all` warning.** Choosing `--shell-allow-list all`
> via `RALPH_DEEPAGENTS_FLAGS` grants unrestricted non-interactive shell
> execution. Combined with the mounted Docker socket (enabled by default
> in the base compose file), this can affect sibling containers or the
> host Docker daemon. Only use `all` for trusted tasks where
> you have accepted that risk explicitly.

## Tips

- Keep provider keys in `~/.deepagents/.env`. Never commit a repo-local
  `.deepagents/.env`.
- Pair DeepAgents with a git worktree so its branch is isolated.
- Inspect non-interactive runs with `tmux attach -t agent-deepagents` (or
  the Ralph-launched session) to see live progress.

## Upstream documentation

- [DeepAgents documentation](https://docs.langchain.com/oss/python/deepagents/overview)
- [DeepAgents CLI overview](https://docs.langchain.com/oss/python/deepagents/cli/overview)
- [DeepAgents CLI configuration](https://docs.langchain.com/oss/python/deepagents/cli/configuration)
- [`langchain-ai/deepagents` on GitHub](https://github.com/langchain-ai/deepagents/tree/main/libs/cli)
