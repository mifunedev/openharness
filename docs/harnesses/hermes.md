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

Review-first equivalent for manual inspection:

```bash
curl -fsSL -o hermes-install.sh https://hermes-agent.nousresearch.com/install.sh
# Review hermes-install.sh in your editor or pager before running it.
bash hermes-install.sh --skip-setup --skip-browser
```

If you already use [`vet`](https://github.com/vet-run/vet), `vet https://hermes-agent.nousresearch.com/install.sh --skip-setup --skip-browser` gives the installer a fetch/review/approve gate. `vet` is optional and is not required by Open Harness.

That keeps `make sandbox` non-interactive. User setup remains explicit
inside the running sandbox.

## Authentication

Inside the sandbox:

```bash
hermes setup            # interactive setup wizard
hermes setup --portal   # Nous Portal OAuth integration
hermes doctor           # health check
```

Config, memory, runtime skills, and sessions write to `~/harness/.hermes/`
through `HERMES_HOME=/home/sandbox/harness/.hermes`. On boot with
Hermes enabled, the entrypoint links `.hermes/skills/openharness` to the
tracked shared skills directory (`.mifune/skills/`), making the same harness
skills used by Claude, Codex, and Pi visible to Hermes by default.

Auth lives directly inside `HERMES_HOME` (`~/harness/.hermes/auth.json`).
No symlink or named volume is involved: an earlier design symlinked
`auth.json` into a home-scoped `hermes-auth` Docker volume, but that
volume sits on a different filesystem from the bind-mounted checkout and
caused Hermes' atomic-replace writes to fail with `EXDEV`. Keeping auth
on the same bind-mount device fixes this; the entrypoint heals any
leftover symlink on startup by removing it and copying credentials to
the real path. The sandbox banner mirrors the Claude Code pattern: it
reports Hermes as authenticated only when `~/harness/.hermes/auth.json`
exists and is non-empty; generated config files alone do not count as
authentication.

## State persistence

`~/harness/.hermes/` is part of the bind-mounted checkout, so Hermes
configuration, credentials, generated skills, memory, and sessions
survive container rebuilds and follow the project directory. The
project-local runtime contents are ignored by git; do not commit
secrets from this directory.

`make destroy` stops containers and removes volumes but does not delete
the bind-mounted `.hermes/` directory from the checkout. Remove that
directory manually if you want a full Hermes project-state reset.

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

## Web dashboard

Hermes ships a local web UI (`hermes dashboard`) that provides config and
`.env` editing, session browsing, cron job management, and an embedded TUI.
It is **disabled by default** and opt-in per sandbox.

### Enabling

In `harness.yaml`, set alongside `install.hermes: true`:

```yaml
hermes:
  dashboard: true
  dashboard_port: 9119   # optional; 9119 is the default
```

Then rebuild:

```bash
make stop && make sandbox
```

The legacy `.devcontainer/.env` vars `HERMES_DASHBOARD=true` /
`HERMES_DASHBOARD_PORT=9119` still work as a fallback (migrated to
`harness.yaml`). Both paths require `install.hermes: true` (or
`INSTALL_HERMES=true`) to take effect.

### What auto-launches

When both `install.hermes: true` and `hermes.dashboard: true` are set (or
the equivalent legacy env vars), the entrypoint starts the dashboard in a
named tmux session:

- **tmux session**: `app-hermes-dashboard`
- **Container bind**: `0.0.0.0:<port>` (all container interfaces — required so Docker's published port can reach the process; set via `HERMES_DASHBOARD_HOST=0.0.0.0` and `HERMES_DASHBOARD_INSECURE=true` in the compose overlay)
- **Host publish**: `127.0.0.1:9119 → container:9119` (loopback-only on the host)
- **URL** (from the host browser): `http://127.0.0.1:9119`

### Inspect and restart

```bash
# Attach to live output
tmux attach -t app-hermes-dashboard

# Tail the log
tail -f /tmp/app-hermes-dashboard.log

# Restart (kill session, then relaunch manually or rebuild sandbox)
tmux kill-session -t app-hermes-dashboard
tmux new-session -d -s app-hermes-dashboard \
  "hermes dashboard --port ${HERMES_DASHBOARD_PORT:-9119} --host 0.0.0.0 --insecure --no-open 2>&1 | tee /tmp/app-hermes-dashboard.log"
```

### Security

The dashboard reads and writes `.env` secrets and `config.yaml`. The
compose overlay intentionally binds the **in-container** process to
`0.0.0.0` (via `HERMES_DASHBOARD_HOST=0.0.0.0` and
`HERMES_DASHBOARD_INSECURE=true`) — this non-loopback container bind is
required for Docker's port publishing mechanism to forward traffic from
the host into the container. The **host-side** publish is loopback-only
(`127.0.0.1:9119`), so the port is never reachable from the LAN.

Because only processes on the local machine can reach `127.0.0.1:9119`,
**no additional authentication is required** — access is equivalent to
existing host-shell access and does not widen the attack surface.

Do **not** change the host bind to `0.0.0.0` — that would expose the
dashboard (and the `.env` secrets it reads) to the LAN without auth.

### Remote access

To reach the dashboard from another machine, use `/cloudflared 9119` to
start a Cloudflared tunnel for the loopback bind. The tunnel handles TLS;
the dashboard itself stays on loopback.

For sensitive dashboards, add Cloudflare Access or another authentication
gate before sharing the URL. If you intentionally change Hermes to a
non-loopback bind with `--host 0.0.0.0`, the upstream fail-closed auth gate
requires credentials. Set at minimum:

```env
HERMES_DASHBOARD_BASIC_AUTH_USERNAME=admin
HERMES_DASHBOARD_BASIC_AUTH_PASSWORD=change-me   # plain-text, or use _HASH
HERMES_DASHBOARD_SECRET=a-random-32-char-string   # session signing key
```

OAuth is also supported via `HERMES_DASHBOARD_OAUTH_CLIENT_ID` and related
vars — see upstream Hermes documentation for the full list.


## Banner status

The sandbox onboarding banner reports Hermes as:

- `❌ not installed` — set `install.hermes: true` in `harness.yaml` (or `INSTALL_HERMES=true` in `.devcontainer/.env`) and rebuild — when the binary is absent from PATH.
- `✅ installed — run: hermes setup` — when the binary is on PATH but
  `~/.hermes/auth.json` is absent or empty.
- `✅ authenticated` — when `~/.hermes/auth.json` exists and is
  non-empty.

Set `OH_BANNER_STATUS_STYLE=legacy` to force the old `[✗]` / `[✓]` markers when emoji rendering is unavailable.

## Upstream documentation

- [Hermes landing page](https://hermes-agent.nousresearch.com/)
- [Hermes documentation](https://hermes-agent.nousresearch.com/docs/)
- [`NousResearch/hermes-agent` on GitHub](https://github.com/NousResearch/hermes-agent)
