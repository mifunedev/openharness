---
sidebar_position: 7
title: "Hermes"
---

# Hermes

Hermes is [Nous Research](https://nousresearch.com)'s Python-based agent CLI
with a self-improving learning loop — persistent memory, auto-generated
skills from experience, scheduled task automation, sub-agent delegation,
container sandboxing across multiple backends, and bridges to chat
platforms (Telegram, Discord, Slack, WhatsApp, Signal, Email).

Hermes is an **optional, opt-in runtime** in Open Harness. It sits
alongside `claude`, `codex`, `pi`, `opencode`, and `deepagents` as a
sandbox-image-layer CLI primitive; it is not installed in the default
sandbox image. Canonical facts about Hermes live in the wiki entry
`wiki/hermes-agent.md`.

## Purpose

- Multi-platform agent runtime with persistent memory and an
  auto-skill-generation loop (skills written from real interactions
  rather than handed in up-front).
- Container-sandboxed task execution across multiple backends (local,
  Docker, SSH, Singularity, Modal).
- Messaging gateway for bridging the same in-sandbox agent into
  Telegram, Discord, Slack, WhatsApp, Signal, Email, and other
  surfaces — though Open Harness recommends running Hermes in CLI mode
  unless you have a specific reason to enable a bridge.
- MIT-licensed; current upstream release is v0.14.0.

## Install (opt-in)

Hermes is **disabled by default**. To enable, set the runtime flag in
`.devcontainer/.env`:

```env
INSTALL_HERMES=true
```

Then restart the container:

```bash
make stop && make sandbox
```

On first boot with `INSTALL_HERMES=true`, the entrypoint runs the
official curl-piped installer as the `sandbox` user:

```bash
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
```

The flag mirrors the existing `INSTALL_AGENT_BROWSER` precedent — flipping
it does not require a Dockerfile rebuild. A subsequent restart with the
binary already present skips the install via a `command -v hermes` guard.

If the install fails, you'll see `WARN: hermes install failed` in
`docker logs openharness`; the rest of the entrypoint continues to boot
unaffected.

## Authentication

Inside the sandbox:

```bash
hermes setup            # interactive setup wizard
hermes setup --portal   # Nous Portal OAuth integration
hermes doctor           # health check
```

Credentials and config write to `~/.hermes/`. The exact sentinel files
inside that directory are not documented upstream; the sandbox banner
uses an "any non-empty contents" heuristic to distinguish `installed`
from `configured`.

## State persistence

`~/.hermes/` is mounted from the `hermes-auth` named Docker volume, so
authentication, generated skills, and accumulated memory survive
`make stop` and `make sandbox` rebuilds. `make destroy` removes the
volume — re-running setup is required after a destroy.

The Hermes binary itself is installed by the curl-piped script as the
`sandbox` user on first boot; depending on the installer's choice
(`~/.local/bin`, a `~/.hermes/bin/` shim, etc.), it may or may not
survive `make destroy`. The entrypoint's idempotent re-install handles
the worst case — a fresh sandbox with `INSTALL_HERMES=true` will
re-install on next boot.

## Common usage

### Interactive

```bash
hermes
```

For long-running interactive sessions, wrap in a tmux session per
[`context/rules/sandbox-processes.md`](https://github.com/ryaneggz/open-harness/blob/development/context/rules/sandbox-processes.md):

```bash
tmux new-session -d -s agent-hermes 'hermes'
tmux attach -t agent-hermes
```

### Model and gateway

```bash
hermes model            # pick LLM provider
hermes gateway setup    # configure messaging bridge (optional)
hermes gateway          # start the messaging gateway
```

Open Harness does not currently wire Hermes into the in-tree Pi Slack
extension — they are independent surfaces. If you enable a Hermes
messaging gateway, the bridge runs entirely under Hermes' own
configuration.

## Banner status

The sandbox onboarding banner reports Hermes as:

- `[✗] not installed — set INSTALL_HERMES=true and restart` — when the
  binary is absent from PATH (default state).
- `[✓] installed — run: hermes setup` — when the binary is on PATH but
  `~/.hermes/` is empty.
- `[✓] configured` — when `~/.hermes/` has non-empty contents.

## Upstream documentation

- [Hermes landing page](https://hermes-agent.nousresearch.com/)
- [Hermes documentation](https://hermes-agent.nousresearch.com/docs/)
- [`NousResearch/hermes-agent` on GitHub](https://github.com/NousResearch/hermes-agent)
- Open Harness wiki: `wiki/hermes-agent.md`
