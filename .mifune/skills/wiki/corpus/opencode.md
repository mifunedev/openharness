---
title: "OpenCode CLI"
slug: opencode
tags: [agent, cli, opencode, optional, primitive]
created: 2026-05-28
updated: 2026-05-28
sources:
  - https://opencode.ai/docs/
  - https://opencode.ai/docs/cli/
  - https://opencode.ai/docs/providers/
  - https://github.com/sst/opencode
related: [deepagents, hermes-agent]
confidence: provisional
---

# OpenCode CLI

## Summary

OpenCode is a terminal coding agent with interactive and one-shot modes. In Open Harness it is an optional image-level CLI primitive: the default sandbox image ships Claude Code, Codex, and Pi; OpenCode is included only when `INSTALL_OPENCODE=true` is set before rebuilding.

## Install in Open Harness

Enable in `.devcontainer/.env`:

```env
INSTALL_OPENCODE=true
```

Rebuild/restart:

```bash
make stop && make sandbox
```

Open Harness installs the upstream npm package during image build:

```bash
npm install -g opencode-ai
```

Verify inside the sandbox:

```bash
opencode --version
```

## Authentication

Run inside the sandbox:

```bash
opencode auth login
```

For ChatGPT Plus/Pro users, choose OpenAI at the provider prompt to authenticate via OAuth. Credentials live at `~/.local/share/opencode/auth.json`, backed by the `opencode-auth` named volume.

## Default docs

- OpenCode docs: https://opencode.ai/docs/
- CLI: https://opencode.ai/docs/cli/
- Providers: https://opencode.ai/docs/providers/
- GitHub: https://github.com/sst/opencode

## See Also

- `docs/harnesses/opencode.md`
- `docs/harnesses/overview.md`
