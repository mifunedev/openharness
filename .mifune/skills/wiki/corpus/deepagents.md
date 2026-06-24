---
title: "DeepAgents CLI"
slug: deepagents
tags: [agent, cli, langchain, deepagents, optional, primitive]
created: 2026-05-28
updated: 2026-05-28
sources:
  - https://docs.langchain.com/oss/python/deepagents/overview
  - https://docs.langchain.com/oss/python/deepagents/cli/overview
  - https://docs.langchain.com/oss/python/deepagents/cli/configuration
  - https://github.com/langchain-ai/deepagents/tree/main/libs/cli
related: [opencode, hermes-agent]
confidence: provisional
---

# DeepAgents CLI

## Summary

DeepAgents is LangChain's terminal coding agent. It supports interactive sessions and one-shot non-interactive tasks across multiple providers, with shell tool use controlled by an explicit allow list. In Open Harness it is optional: the default sandbox image ships Claude Code, Codex, and Pi; DeepAgents is included only when `INSTALL_DEEPAGENTS=true` is set before rebuilding.

## Install in Open Harness

Enable in `.devcontainer/.env`:

```env
INSTALL_DEEPAGENTS=true
```

Rebuild/restart:

```bash
make stop && make sandbox
```

Open Harness installs the upstream CLI during image build:

```bash
uv tool install deepagents-cli
```

Verify inside the sandbox:

```bash
deepagents -v
```

## Authentication / provider keys

DeepAgents reads provider keys from `~/.deepagents/.env` and CLI defaults from `~/.deepagents/config.toml`. Open Harness persists that directory with the `deepagents-auth` named volume.

Create `~/.deepagents/.env`, add your provider keys, then restrict permissions:

```bash
mkdir -p ~/.deepagents
$EDITOR ~/.deepagents/.env
chmod 600 ~/.deepagents/.env
```

## Default docs

- DeepAgents docs: https://docs.langchain.com/oss/python/deepagents/overview
- CLI overview: https://docs.langchain.com/oss/python/deepagents/cli/overview
- CLI configuration: https://docs.langchain.com/oss/python/deepagents/cli/configuration
- GitHub: https://github.com/langchain-ai/deepagents/tree/main/libs/cli

## See Also

- `docs/harnesses/deepagents.md`
- `docs/harnesses/overview.md`
