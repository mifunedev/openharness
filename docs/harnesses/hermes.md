---
title: "Hermes"
---

# Hermes

Hermes is [Nous Research](https://nousresearch.com)'s Python-based agent CLI
with a self-improving learning loop — persistent memory, auto-generated
skills from experience, scheduled task automation, sub-agent delegation,
container sandboxing across multiple backends, and bridges to chat
platforms (Telegram, Discord, Slack, WhatsApp, Signal, Email).

Install Hermes with `oh harness install hermes`. It then sits alongside `claude`, `codex`,
`pi`, and `opencode` as a sandbox CLI primitive. See the
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

## Install

`oh harness install <id>` is the only door. It installs Hermes into the
already-running sandbox without a rebuild:

```bash
oh harness install hermes
```

Nothing installs Hermes at boot, and no configuration key selects it. See
[Harnesses Overview](./overview.md#installing-a-harness) for what the verb does
and what happens when the sandbox is not running.

The install lands in the persistent home volume, so later boots find it on PATH
immediately:

```bash
hermes --version
```

### What the door runs

Open Harness runs the official installer as the `sandbox` user with setup and
browser installation disabled, directing it into the home mount:

```bash
curl -fsSL https://hermes-agent.nousresearch.com/install.sh \
  | HERMES_INSTALL_DIR="$HOME/.local/lib/hermes-agent" bash -s -- --skip-setup --skip-browser
```

Review-first equivalent for manual inspection:

```bash
curl -fsSL -o hermes-install.sh https://hermes-agent.nousresearch.com/install.sh
# Review hermes-install.sh in your editor or pager before running it.
bash hermes-install.sh --skip-setup --skip-browser
```

If you already use [`vet`](https://github.com/vet-run/vet), `vet https://hermes-agent.nousresearch.com/install.sh --skip-setup --skip-browser` gives the installer a fetch, review, and approve gate. `vet` is optional and is not required by Open Harness.

That keeps `oh sandbox install docker` non-interactive. User setup remains explicit
inside the running sandbox.

## Authentication

Inside the sandbox:

```bash
hermes setup            # interactive setup wizard
hermes setup --portal   # Nous Portal OAuth integration
hermes doctor           # health check
```

Config, memory, runtime skills, and sessions write to `~/harness/.hermes/`,
which the entrypoint sets as `HERMES_HOME`. On every boot where the `hermes`
binary is present — the wiring keys off the binary, so it runs identically in
both sandbox flavors — the entrypoint links
`.hermes/skills/openharness` to the tracked shared skills directory
(`.oh/skills/`), making the same harness skills used by Claude, Codex, and Pi
visible to Hermes by default.

Auth lives directly inside `HERMES_HOME` (`~/harness/.hermes/auth.json`).
No symlink or named volume is involved: an earlier design symlinked
`auth.json` into a home-scoped Docker volume of its own, but that
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

`oh destroy` stops containers and removes volumes but does not delete
the bind-mounted `.hermes/` directory from the checkout. Remove that
directory manually if you want a full Hermes project-state reset.

`oh harness install hermes` installs the binary into the home volume, at
`~/.local/lib/hermes-agent` with a `~/.local/bin/hermes` launcher. Nothing about
it lives in the image, and nothing reinstalls it at boot. `oh destroy` removes
the home volume and the binary with it; project-local state remains in
`.hermes/` until removed.

## Common usage

### Interactive

```bash
hermes
```

For long-running interactive sessions, wrap in a tmux session per
[`.oh/skills/t3/references/sandbox-processes.md`](https://github.com/mifunedev/openharness/blob/development/.oh/skills/t3/references/sandbox-processes.md):

```bash
tmux new-session -d -s agent-hermes 'hermes'
tmux attach -t agent-hermes
```

### Model and gateway

```bash
hermes model            # pick LLM provider
hermes gateway setup    # configure the messaging gateway (Slack app, trust) — optional
```

Hermes' Slack/messaging gateway is managed by the **same** harness lifecycle script as
Pi's — `.oh/scripts/gateway.sh` — in a sibling tmux session. Pi and Hermes each hold their
**own** Slack app and config, so the two never compete for one socket: Pi's `client-slack-pi`
runs the pi-messenger-bridge, while Hermes' `client-slack-hermes` runs Hermes' native
`hermes gateway run`. `gateway.sh` owns only the session *lifecycle*; configuration is
separate (`hermes gateway setup` for Hermes, the in-session `/msg-bridge` for Pi). See
[Slack](../integrations/slack.md) for the Pi side.

#### Run and verify (read-only)

Run the Hermes gateway **from inside the sandbox** — both `gateway hermes` and
`oh gateway hermes` require `hermes` on `PATH`, so they only work in the container
(`gateway.sh` errors otherwise). The launcher pins `HERMES_HOME` to
`~/harness/.hermes`, persists Hermes `terminal.cwd` to `~/harness` (override with
`HERMES_GATEWAY_HOME` / `HERMES_GATEWAY_CWD`), and self-installs Teams webhook deps
when Teams credentials are configured:

```bash
gateway hermes            # start the client-slack-hermes session (wraps `hermes gateway run`)
gateway status            # both gateways + state, e.g.
                          #   · client-slack-pi        stopped   (gateway pi)
                          #   · client-slack-hermes    stopped   (gateway hermes)
```

To **watch** a running gateway without any risk of stopping it, attach **read-only** with
`-r`, then detach with `Ctrl-b d` — never `Ctrl-C` or `exit` (those kill the process):

```bash
tmux attach -r -t client-slack-hermes    # read-only view; detach: Ctrl-b d
tail -f /tmp/client-slack-hermes.log     # or just tail the log (no attach needed)
```

## Web dashboard

Hermes ships a local web UI (`hermes dashboard`) that provides config and
`.env` editing, session browsing, cron job management, and an embedded TUI.
It is **disabled by default** and opt-in per sandbox.

### Enabling

Set the fields in the tracked `oh.json`:

```bash
oh config set hermesDashboard.enabled true
oh config set hermesDashboard.port 9119   # optional; 9119 is the default
```

Then restart:

```bash
oh stop && oh sandbox
```

The dashboard needs the `hermes` binary; without it there is nothing to serve and
the entrypoint skips the launch.

### What auto-launches

When `hermesDashboard.enabled` is true and `hermes` is installed, the entrypoint
starts the dashboard in a named tmux session:

- **tmux session**: `app-hermes-dashboard`
- **Container bind**: `127.0.0.1:<port>` — container loopback only
- **Host publish**: none. The dashboard is no longer published to the host.
- **URL** (from inside the sandbox): `http://127.0.0.1:9119`

### Inspect and restart

```bash
# Attach to live output
tmux attach -t app-hermes-dashboard

# Tail the log
tail -f /tmp/app-hermes-dashboard.log

# Restart (kill session, then relaunch manually or rebuild sandbox)
tmux kill-session -t app-hermes-dashboard
tmux new-session -d -s app-hermes-dashboard \
  "hermes dashboard --port 9119 --host 127.0.0.1 --no-open 2>&1 | tee /tmp/app-hermes-dashboard.log"
```

### Security

The dashboard reads and writes `.env` secrets and `config.yaml`, and it binds to
**container loopback** only. Nothing publishes it to the host, so it is reachable
from inside the sandbox and from an explicit tunnel — never from the LAN, and not
from the host browser without one.

Because only processes inside the container can reach `127.0.0.1:9119`,
**no additional authentication is required** by default.

Do **not** change the bind to `0.0.0.0` — that would expose the dashboard (and
the `.env` secrets it reads) to anything that can route to the container.

### Remote access

To reach the dashboard from another machine, use `/cloudflared 9119` to
start a Cloudflared tunnel for the loopback bind, or reach it over the tailnet
with `oh tool install tailscale`. The tunnel handles TLS; the dashboard itself
stays on loopback.

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

- `❌ not installed` — run `oh harness install hermes` — when the binary is absent from PATH.
- `✅ installed — run: hermes setup` — when the binary is on PATH but
  `~/.hermes/auth.json` is absent or empty.
- `✅ authenticated` — when `~/.hermes/auth.json` exists and is
  non-empty.

Set `OH_BANNER_STATUS_STYLE=legacy` to force the old `[✗]` / `[✓]` markers when emoji rendering is unavailable.

## Upstream documentation

- [Hermes landing page](https://hermes-agent.nousresearch.com/)
- [Hermes documentation](https://hermes-agent.nousresearch.com/docs/)
- [`NousResearch/hermes-agent` on GitHub](https://github.com/NousResearch/hermes-agent)
