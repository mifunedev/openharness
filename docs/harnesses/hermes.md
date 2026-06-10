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

Hermes is an **optional image-level runtime** in Open Harness. When enabled (set `install.hermes: true` in `harness.yaml` or `INSTALL_HERMES=true` in `.devcontainer/.env`), it sits alongside `claude`, `codex`,
`pi`, `opencode`, and `deepagents` as a sandbox CLI primitive. See the
upstream documentation below for canonical facts about Hermes.

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

## Install (optional)

Hermes is disabled by default. To install it into the sandbox image, set
`harness.yaml`:

```yaml
install:
  hermes: true
```

Or set `INSTALL_HERMES=true` in `.devcontainer/.env` (legacy).

Then rebuild/restart the sandbox:

```bash
make stop && make sandbox
```

The executable is installed during image build, not at container boot, so
an enabled sandbox has `hermes` on PATH immediately:

```bash
hermes --version
```

At image build time, Open Harness runs the official installer with setup
and browser installation disabled:

```bash
curl -fsSL https://hermes-agent.nousresearch.com/install.sh \
  | bash -s -- --skip-setup --skip-browser
```

That keeps `make sandbox` non-interactive. User setup remains explicit
inside the running sandbox.

## Authentication

Inside the sandbox:

```bash
hermes setup            # interactive setup wizard
hermes setup --portal   # Nous Portal OAuth integration
hermes doctor           # health check
```

Config, memory, skills, and sessions write to `~/harness/.hermes/`
through `HERMES_HOME=/home/sandbox/harness/.hermes`. On first boot with
Hermes enabled, the entrypoint seeds `config.yaml` so
`skills.external_dirs` includes `/home/sandbox/harness/.claude/skills`,
making the harness' in-repo skills visible to Hermes by default.

Auth remains home-scoped at `~/.hermes/auth.json` via the `hermes-auth`
named volume; the entrypoint creates `~/harness/.hermes/auth.json` as a
symlink into that auth volume so Hermes can keep using one home directory
without committing credentials. The sandbox banner mirrors the Claude
Code pattern: it reports Hermes as authenticated only when
`~/.hermes/auth.json` exists and is non-empty; generated config files
alone do not count as authentication.

## State persistence

`~/harness/.hermes/` is part of the bind-mounted checkout, so Hermes
configuration, generated skills, memory, and sessions survive container
rebuilds and follow the project directory. Credentials stay in the
`~/.hermes` named volume. The project-local runtime contents are ignored
by git; do not commit secrets from this directory.

`make destroy` removes the `hermes-auth` Docker volume and therefore
Hermes credentials, but it does not delete the bind-mounted `.hermes/`
directory from the checkout. Remove that directory manually if you want a
full Hermes project-state reset.

The Hermes binary itself is installed in the image when
`install.hermes: true` is set in `harness.yaml` (or `INSTALL_HERMES=true` in `.devcontainer/.env`), under the installer's root Linux FHS layout
(`/usr/local/lib/hermes-agent` with a `/usr/local/bin/hermes` launcher).
Disabling the flag on a future rebuild omits the executable; project-local
state remains in `.hermes/` until removed.

## Common usage

### Interactive

```bash
hermes
```

For long-running interactive sessions, wrap in a tmux session per
[`context/rules/sandbox-processes.md`](https://github.com/mifunedev/openharness/blob/development/context/rules/sandbox-processes.md):

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

- `[✗] not installed` — set `install.hermes: true` in `harness.yaml` (or `INSTALL_HERMES=true` in `.devcontainer/.env`) and rebuild — when the binary is absent from PATH.
- `[✓] installed — run: hermes setup` — when the binary is on PATH but
  `~/.hermes/auth.json` is absent or empty.
- `[✓] authenticated` — when `~/.hermes/auth.json` exists and is
  non-empty.

## Upstream documentation

- [Hermes landing page](https://hermes-agent.nousresearch.com/)
- [Hermes documentation](https://hermes-agent.nousresearch.com/docs/)
- [`NousResearch/hermes-agent` on GitHub](https://github.com/NousResearch/hermes-agent)
