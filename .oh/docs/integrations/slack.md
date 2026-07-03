---
title: Slack
---

> Slack UI labels accurate as of 2026-05-12.

# Slack

The Slack integration is provided by the npm package
[**pi-messenger-bridge**](https://github.com/tintinweb/pi-messenger-bridge)
(MIT, multi-transport — Slack / Telegram / WhatsApp / Discord / Matrix). The
harness **installs it via npm into a gitignored `.pi/bridge/` directory** and
the **dedicated `client-slack-pi` tmux session loads it via `--extension`** — it
is **not** globally pinned in `.pi/settings.json`, so no other `pi` session
loads the bridge or competes for the Slack connection. You do **not** run
`pi install` yourself. Once your sandbox is up and Slack
tokens are in env, DM the bot or mention it in a channel to start a
conversation. The bridge opens a Socket Mode WebSocket on startup, relays
inbound Slack events into the Pi agent, and posts the agent's response back to
Slack.

> Upstream / standalone users (outside this harness) install the package with
> `pi install npm:pi-messenger-bridge`. Inside the harness the entrypoint's
> `npm install` into `.pi/bridge/` plus the `client-slack-pi` `--extension` load
> handles it.

## 1. Prerequisites

- Sandbox is running (`make ps` shows the `openharness` container).
- `pi --version` works inside the sandbox (`make shell` to verify).
- A Slack workspace where you can create apps (workspace admin or equivalent).
  If you are on a company Slack that restricts app creation, create a free
  personal workspace at [slack.com/get-started](https://slack.com/get-started)
  and use it for testing.

## 2. Create the Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and click
   **Create New App**.
2. Choose **From an app manifest**.
3. Select your workspace and paste the contents of
   `.pi/install/slack-manifest.json` from this repo. The manifest enables
   **Socket Mode** and requests the bot scopes the bridge needs.
4. Click through the confirmation screens and then **Install to Workspace**.
5. Approve the requested OAuth scopes.

## 3. Capture Tokens

After installation, collect two tokens from the Slack app settings. They are
not interchangeable — the wrong token in the wrong variable causes a silent
auth failure.

| Token | Prefix | Where to find it |
|-------|--------|-----------------|
| App-Level Token | `xapp-` | **Basic Information** page → **App-Level Tokens** section → generate one with `connections:write` scope |
| Bot User OAuth Token | `xoxb-` | **OAuth & Permissions** page → **Bot User OAuth Token** |

Keep both values ready for the next step.

## 4. Configure the bridge

Two layers. **Tokens** go in `.devcontainer/.env` (§ 4.1). The **messenger
itself is configured from inside the running session via the bridge's own
`/msg-bridge` command** (§ 4.2) — trusted users, channels, enable/disable — which
is the default method; there is no separate wizard. The tracked
`.pi/msg-bridge.json` is only an optional pre-seed for headless setups (§ 4.2).

### 4.1 Tokens — `.devcontainer/.env`

`.devcontainer/.env` uses Docker Compose `KEY=value` format (no `export`
prefix). It is gitignored, so your tokens are never committed. Add the two
tokens from § 3:

```
PI_SLACK_APP_TOKEN=xapp-...
PI_SLACK_BOT_TOKEN=xoxb-...
```

`PI_SLACK_APP_TOKEN` is the `xapp-` App-Level Token; `PI_SLACK_BOT_TOKEN`
is the `xoxb-` Bot User OAuth Token. Swapping them causes a silent auth
failure — double-check the prefixes.

### 4.2 Configure the messenger — the `/msg-bridge` command

The default way to configure the bridge is its own in-session `/msg-bridge`
command — you do **not** hand-edit config for normal use. Attach to the session
and run it:

```bash
gateway pi --attach     # start (if needed) + attach to client-slack-pi
```

Then, inside the session:

- `/msg-bridge` — bridge status and the config menu.
- `/trusted` — list / add / remove trusted Slack users. Access is
  **deny-by-default and challenge-based**: a new user DMs the bot, gets a
  6-digit code, and replies with it to authorize (see § 5) — or you add them
  here.
- `/channels` — enable/disable channels and set per-channel `mode`
  (`all` / `mentions` / `trusted-only`).
- `/enable` · `/disable` — turn the bridge on/off without stopping the session.

These changes persist to `~/.pi/msg-bridge.json` (owned and rewritten by the
package); `gateway pi` preserves them across restarts, never clobbering live
grants (bug #289).

#### Optional pre-seed (headless) — `.pi/msg-bridge.json`

For headless setups where nobody watches the terminal, the tracked
`.pi/msg-bridge.json` pre-seeds `autoConnect` plus a starting trust set, so the
bridge is usable on first boot without the challenge handshake:

```json
{
  "autoConnect": true,
  "auth": {
    "trustedUsers": ["slack:U01ABCD2345"],
    "channels": {
      "C01EFGH6789": { "enabled": true, "mode": "mentions" }
    }
  }
}
```

- `autoConnect` — `true` opens Socket Mode as soon as the `client-slack-pi`
  session boots.
- `auth.trustedUsers` — Slack user IDs namespaced by transport as `slack:U…`;
  pre-authorizing your own ID skips the first-message challenge (§ 5).
- `auth.channels` — per-channel enablement keyed by channel ID (`C…`).

`gateway pi` seeds this into `~/.pi/msg-bridge.json` on launch but **preserves**
any grants you've since added via `/trusted`/`/channels`.

### 4.3 The `client-slack-pi` session (managed by `gateway`)

On container boot, `.devcontainer/entrypoint.sh` hands off to
`.oh/scripts/gateway.sh pi`, which npm-installs the bridge into a gitignored
`.pi/bridge/` directory and starts the dedicated `client-slack-pi` tmux session
loading it via `--extension`. You can also manage it by hand at any time with
the bare `gateway` command (a boot-installed symlink to that script; equivalently
`make gateway pi`):

```bash
gateway pi              # start (idempotent)
gateway pi --restart    # restart to pick up config / token edits
gateway pi --stop       # stop
gateway status          # client-slack-pi + client-slack-hermes
```

The sibling Hermes gateway client is the same command: `gateway hermes` (session
`client-slack-hermes`). Under the hood `gateway pi` / the supervisor run:

```bash
pi --extension .pi/bridge/node_modules/pi-messenger-bridge/dist/index.js \
   --extension .pi/bridge-recovery/index.ts \
   --approve            # interactive on the pane TTY — no --mode rpc, no | tee
```

pi runs **interactive**, attached to the pane's real TTY, so the loaded UI
extensions render in the TUI instead of flooding stdout with
`extension_ui_request` JSON frames — and the REPL stays alive at idle (no
`--mode rpc`, no `| tee` pipe). Logs are captured out-of-band: pi's stderr goes
to `/tmp/client-slack-pi.log`, and `gateway.sh` mirrors the pane there
(ANSI-stripped) with `tmux pipe-pane`. `--approve` trusts the project-local
files so the extension loads. A second `--extension`
(`.pi/bridge-recovery/index.ts`) adds Codex retry-recovery (§ 4.5). The bridge
is loaded **only** here — it is not pinned in `.pi/settings.json`, so no other
`pi` session competes for the Slack connection.

### 4.4 Self-healing supervisor

The `client-slack-pi` session does not run that `pi` command directly — it runs it
under a thin supervisor, `.devcontainer/client-slack-supervise.sh`, which
relaunches pi whenever the bridge dies. This exists because
pi-messenger-bridge binds its long-lived Slack socket to a **session-scoped pi
ctx**: when pi replaces the session (compaction, fork, model switch, reload),
that ctx goes stale and every subsequent Slack message throws
`extension ctx is stale after session replacement or reload`. The package has
no recovery hook, so the process keeps running while the bridge silently stops
responding. The supervisor tails the log for that stale-ctx signature (and
catches any non-zero crash), kills the bridge pi, clears the single-instance
lock (`~/.pi/msg-bridge.lock`), and relaunches a fresh process that reconnects
— look for the `[Slack] Bot user ID:` connect marker (§ 7) again after a
restart. A clean pi exit (`rc=0`) stops the loop. The manual relaunch below is
only needed to pick up config edits, not to recover from stale-ctx.

### 4.5 Codex retry-recovery

The bridge chains Codex turns through the openai-codex provider's
connection-scoped `previous_response_id`. When that id goes stale the provider
returns `previous_response_not_found` (HTTP 400), clears its own continuation,
and re-throws **without** retrying — so a real Slack turn dies with no reply.
The npm package has no recovery for this, so the harness co-loads a small
in-tree extension, `.pi/bridge-recovery/index.ts` (the second `--extension`
above). It hooks `agent_end`: on a recoverable provider-state error whose failed
turn was Slack-originated (the bridge's `[📱 … via slack]:` stamp), it re-injects
that turn **once** — the failed request already cleared the stale id, so the
retry chains fresh and succeeds. It does not patch the npm package.

### 4.6 Run and verify (read-only)

Run and check the gateway **from inside the sandbox** — both `gateway <pi|hermes>` and
`make gateway <pi|hermes>` require `pi`/`hermes` on `PATH`, so they only work in the
container (`.oh/scripts/gateway.sh` errors "run inside the sandbox" otherwise).

```bash
gateway pi                 # start the client-slack-pi session (idempotent)
gateway status             # both sessions + state, e.g.
                           #   · client-slack-pi        stopped   (gateway pi)
                           #   · client-slack-hermes    stopped   (gateway hermes)
```

To **watch** a running gateway without any risk of killing it, attach **read-only** with
`-r`, then detach with `Ctrl-b d` — never `Ctrl-C` or `exit` (those stop the pi process):

```bash
tmux attach -r -t client-slack-pi     # read-only view of the live session; detach: Ctrl-b d
tail -f /tmp/client-slack-pi.log      # or just tail the log — no attach needed
```

Use the interactive `gateway pi --attach` (read-write) **only** when you actually need to
run `/msg-bridge`, `/trusted`, or `/channels` inside the session. The sibling Hermes gateway
is the same story — `gateway hermes`, session `client-slack-hermes`, log
`/tmp/client-slack-hermes.log` (see [Hermes → Run and verify](../harnesses/hermes.md#run-and-verify-read-only)).

### Manual relaunch

After editing `.devcontainer/.env` or `.pi/msg-bridge.json`, restart the session
to pick up the change. The `gateway` command owns the whole lifecycle — it
sources the tokens from `.env`, seeds the config (preserving your trust grants),
clears the single-instance lock, and runs the supervisor — so a relaunch is one
line:

```bash
gateway pi --restart      # restart the client-slack-pi session
gateway pi --attach       # start it (if needed) and attach to watch the log
gateway status            # show client-slack-pi + client-slack-hermes
```

`gateway` is a boot-installed symlink to `.oh/scripts/gateway.sh` (equivalently
`make gateway pi`). The same command brings up the sibling Hermes gateway
client: `gateway hermes`. Detach an attached session with `Ctrl-b d`. The
session name `client-slack-pi` follows the `client-` prefix convention in
[`.oh/context/rules/sandbox-processes.md`](https://github.com/mifunedev/openharness/blob/development/context/rules/sandbox-processes.md).

## 5. Access Control — challenge-based auth

The bridge is **deny-by-default**: an unknown user gets no agent response until
they prove they're allowed to talk to the bot. There is no static allowlist to
maintain — trust is established through a one-time challenge.

1. The first time an unknown user messages the bot, the bridge prints a
   **6-digit challenge code** in the pi terminal. Read it with
   `tmux attach -r -t client-slack-pi` (detach: `Ctrl-b d`).
2. The user replies with that code in Slack.
3. On a match, the user becomes **trusted** and is persisted to
   `~/.pi/msg-bridge.json` under `auth.trustedUsers`, namespaced by transport as
   `slack:U…`. Trust survives restarts.

For **headless** setups where nobody is watching the pi terminal, pre-authorize
your Slack user ID up front — add `slack:U…` to `auth.trustedUsers` in the
tracked `.pi/msg-bridge.json` (§ 4.2) and restart the `client-slack-pi` session.
That skips the challenge entirely.

## 6. Admin DM Commands

DM the bot these commands to manage trust and per-chat behavior:

| Command | Effect |
|---------|--------|
| `/trusted` | List currently trusted users |
| `/revoke <userId>` | Revoke a user's trust (use the `slack:U…` or `U…` ID) |
| `/channels` | List known chats and their enabled mode |
| `/enable <chatId> <all\|mentions\|trusted-only>` | Enable the bot in a chat with the given response mode |
| `/disable <chatId>` | Disable the bot in a chat |
| `/help` | Show the bridge's command help |
| `/msg-bridge status` | Show connection state and trusted-user status |

## 7. Smoke Test

Run these checks in order. The first runs in the shell where you sourced the
env (before attaching to tmux).

1. **Vars present in the current shell:**
   ```bash
   env | grep PI_SLACK
   ```
   Expected: `PI_SLACK_APP_TOKEN` and `PI_SLACK_BOT_TOKEN` are both listed. If
   either is missing, `set -a` did not run in this shell — repeat the launch
   from the beginning.

2. **Socket Mode connected** (the real connectivity check):
   ```bash
   tmux capture-pane -t client-slack-pi -p | grep -F '[Slack] Bot user ID:'
   ```
   The `[Slack] Bot user ID:` line is the bridge's connect signal — it prints
   once Socket Mode is open and the bot identity is resolved. Note:
   `curl https://slack.com/api/auth.test` only validates the bot token
   (`xoxb-`), not the Socket Mode app token (`xapp-`). An invalid
   `PI_SLACK_APP_TOKEN` can pass `auth.test` and still fail to open a Socket
   Mode connection. Use the tmux log check above as the authoritative test.

3. **Round-trip test:**
   DM the bot or `@mention` it in a channel. If you've never talked to it
   before, complete the 6-digit challenge (§ 5) first. Watch
   `tmux attach -r -t client-slack-pi` — you should see the inbound event logged
   and the agent's reply posted back to Slack.

## 8. Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Bot stays silent; you've never authenticated | Deny-by-default — your Slack user isn't trusted yet | DM the bot, read the 6-digit code from `tmux attach -r -t client-slack-pi`, reply with it in Slack — or pre-authorize your user ID in `.pi/msg-bridge.json` (§ 4.2) |
| `invalid_auth` / `not_authed` in the log | `xapp-` and `xoxb-` tokens are swapped | `PI_SLACK_APP_TOKEN` must be the `xapp-` token; `PI_SLACK_BOT_TOKEN` must be the `xoxb-` token — correct `.devcontainer/.env` and relaunch |
| Bridge won't start after an unclean exit | Stale lock file `~/.pi/msg-bridge.lock` left behind | `rm ~/.pi/msg-bridge.lock`, then relaunch the `client-slack-pi` session |
| Bot connected (`[Slack] Bot user ID:` logged) but never replies | `autoConnect` not set in `.pi/msg-bridge.json` — the bridge stays idle | Set `"autoConnect": true` (§ 4.2) and relaunch |
| Bot is trusted but channel messages ignored | Bot is not a member of the channel | In Slack, type `/invite @OpenHarness` in the target channel |

## 9. Architecture Pointer

The Slack capability is the **pi-messenger-bridge** npm package. The harness
installs it via npm into a gitignored `.pi/bridge/` directory and loads it via
`--extension` only in the dedicated `client-slack-pi` tmux session
(`.devcontainer/entrypoint.sh`) — it is not globally pinned in
`.pi/settings.json`, so no other `pi` session competes for the Slack
connection. Replies post **in a thread** anchored to the triggering channel
message (`thread_ts`); DMs stay flat. The harness normally consumes the package
as published, but while that thread-reply patch is unreleased it temporarily
pins the entrypoint's `npm install` line to a fork branch
(`github:ryaneggz/pi-messenger-bridge#feat/slack-thread-replies`), reverting to
`pi-messenger-bridge@<version>` once the upstream PR lands. Source lives upstream at
[tintinweb/pi-messenger-bridge](https://github.com/tintinweb/pi-messenger-bridge).

For upstream lineage, the version-pin model, the quarterly review cadence, and
the removal of the old in-tree Slack extension, see
[`.pi/UPSTREAM.md`](https://github.com/mifunedev/openharness/blob/development/.pi/UPSTREAM.md).

[Connecting to the Sandbox](/docs/connecting)
