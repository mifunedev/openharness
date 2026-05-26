---
title: "Hermes Agent CLI"
slug: hermes-agent
tags: [agent, cli, nousresearch, hermes, primitive]
created: 2026-05-26
updated: 2026-05-26
sources:
  - raw/2026-05-26-hermes-agent.md
  - raw/2026-05-26-hermes-agent-2.md
related: []
confidence: provisional
---

# Hermes Agent CLI

## Summary
Hermes is NousResearch's self-improving agent CLI from `NousResearch/hermes-agent` — a single binary (`hermes`) installed via a curl-piped shell script, with persistent memory under `~/.hermes`, an auto-skill loop, and bridges to multiple chat platforms (Telegram, Discord, Slack, WhatsApp, Signal, Email). Open Harness treats it as a sixth CLI primitive alongside `claude`, `codex`, `pi`, `opencode`, and `deepagents`, gated behind an `INSTALL_HERMES` opt-in flag at the sandbox-image layer.

## Detail

**Install** (Linux / macOS / WSL2 / Termux):

```
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
```

The GitHub README also lists `https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh` as the underlying script. Open Harness uses the nousresearch.com URL — it's the stable user-facing entry point.

**Binary**: `hermes` on PATH after install.

**Setup commands**:
- `hermes setup` — full interactive setup wizard
- `hermes setup --portal` — Nous Portal OAuth integration
- `hermes model` — pick LLM provider
- `hermes gateway` / `hermes gateway setup` — start / configure the messaging gateway
- `hermes doctor` — health check

**Config directory** (Linux/macOS/WSL2): `~/.hermes`. (Windows: `%LOCALAPPDATA%\hermes`; OpenClaw migration source: `~/.openclaw`.) Open Harness mounts the Linux path via the `hermes-auth` named Docker volume so credentials survive container rebuilds.

**Runtime requirements**: Python 3.11, Node.js, ripgrep, ffmpeg, Git (the harness base image already ships all five).

**Primary languages**: Python (88.7%), TypeScript (8.3%).

**Supported platforms**: Linux, macOS, WSL2, Termux, Windows (early beta), Android/Termux.

**License / version**: MIT; latest release v0.14.0 (May 16 2026).

**Capabilities advertised**: persistent memory, skill auto-generation from experience, scheduled task automation, sub-agent delegation, container sandboxing across five backends (local, Docker, SSH, Singularity, Modal), web/browser control, multi-model reasoning, and bridges to Telegram, Discord, Slack, WhatsApp, Signal, Email, and CLI.

**Open question** (resolved empirically at first install): the exact binary install path the curl-installer chooses (e.g. `~/.local/bin` vs `/usr/local/bin` vs a `~/.hermes/bin/` shim) — documented in `docs/harnesses/hermes.md` after first observation.

**Docs**: https://hermes-agent.nousresearch.com/docs/

## See Also
