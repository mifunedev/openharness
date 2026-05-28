---
title: "Hermes Agent CLI"
slug: hermes-agent
tags: [agent, cli, nousresearch, hermes, primitive]
created: 2026-05-26
updated: 2026-05-26
sources:
  - raw/2026-05-26-hermes-agent.md
  - raw/2026-05-26-hermes-agent-2.md
related: [opencode, deepagents]
confidence: provisional
---

# Hermes Agent CLI

## Summary
Hermes is NousResearch's self-improving agent CLI from `NousResearch/hermes-agent` — a single binary (`hermes`) installed via a curl-piped shell script, with persistent memory, an auto-skill loop, and bridges to multiple chat platforms (Telegram, Discord, Slack, WhatsApp, Signal, Email). Open Harness treats it as an optional CLI primitive alongside OpenCode and DeepAgents; the default sandbox image ships Claude Code, Codex, and Pi only. When enabled with `INSTALL_HERMES=true`, Hermes stores runtime state in project-local `~/harness/.hermes` via `HERMES_HOME`.

## Detail

**Open Harness install**: enable Hermes in `.devcontainer/.env`, then rebuild/restart:

```env
INSTALL_HERMES=true
```

```bash
make stop && make sandbox
```

Open Harness installs Hermes during image build with setup/browser installation disabled:

```bash
curl -fsSL https://hermes-agent.nousresearch.com/install.sh \
  | bash -s -- --skip-setup --skip-browser
```

**Binary**: `hermes` on PATH after install.

**Setup commands**:
- `hermes setup` — full interactive setup wizard
- `hermes setup --portal` — Nous Portal OAuth integration
- `hermes model` — pick LLM provider
- `hermes gateway` / `hermes gateway setup` — start / configure the messaging gateway
- `hermes doctor` — health check

**Config directory in Open Harness**: `~/harness/.hermes` (`HERMES_HOME=/home/sandbox/harness/.hermes`). Non-auth runtime contents are gitignored except `.hermes/README.md`, so config, memory, skills, and sessions follow this harness checkout without entering git. The entrypoint seeds `config.yaml` with `skills.external_dirs: ["/home/sandbox/harness/.claude/skills"]` so Hermes sees the harness' in-repo skills by default. Auth lives at `~/.hermes/auth.json` in the `hermes-auth` named volume and is symlinked into `~/harness/.hermes/auth.json`.

**Runtime requirements**: Python 3.11, Node.js, ripgrep, ffmpeg, Git (the harness base image already ships all five).

**Primary languages**: Python (88.7%), TypeScript (8.3%).

**Supported platforms**: Linux, macOS, WSL2, Termux, Windows (early beta), Android/Termux.

**License / version**: MIT; latest release v0.14.0 (May 16 2026).

**Capabilities advertised**: persistent memory, skill auto-generation from experience, scheduled task automation, sub-agent delegation, container sandboxing across five backends (local, Docker, SSH, Singularity, Modal), web/browser control, multi-model reasoning, and bridges to Telegram, Discord, Slack, WhatsApp, Signal, Email, and CLI.

**Open Harness install path**: when `INSTALL_HERMES=true`, the sandbox image installs Hermes at build time with the root Linux FHS layout (`/usr/local/lib/hermes-agent` plus `/usr/local/bin/hermes`) and skips interactive setup/browser installation. Non-auth user state lives under project-local `~/harness/.hermes`; auth lives under `~/.hermes`.

**Default docs**:
- Hermes landing page: https://hermes-agent.nousresearch.com/
- Hermes docs: https://hermes-agent.nousresearch.com/docs/
- GitHub: https://github.com/NousResearch/hermes-agent

## See Also

- `docs/harnesses/hermes.md`
- `docs/harnesses/overview.md`
