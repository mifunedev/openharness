---
sidebar_position: 1
title: Slack
---

> Slack UI labels accurate as of 2026-05-12.

# Slack

The Slack integration is provided by the npm package
[**pi-messenger-bridge**](https://github.com/tintinweb/pi-messenger-bridge)
(MIT, multi-transport — Slack / Telegram / WhatsApp / Discord / Matrix). The
harness **installs it via npm into a gitignored `.pi/bridge/` directory** and
the **dedicated `client-slack` tmux session loads it via `--extension`** — it
is **not** globally pinned in `.pi/settings.json`, so no other `pi` session
loads the bridge or competes for the Slack connection. You do **not** run
`pi install` yourself. Once your sandbox is up and Slack
tokens are in env, DM the bot or mention it in a channel to start a
conversation. The bridge opens a Socket Mode WebSocket on startup, relays
inbound Slack events into the Pi agent, and posts the agent's response back to
Slack.

> Upstream / standalone users (outside this harness) install the package with
> `pi install npm:pi-messenger-bridge`. Inside the harness the entrypoint's
> `npm install` into `.pi/bridge/` plus the `client-slack` `--extension` load
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

## 4. Configure the bridge (native — no wizard)

Configuration is **native**: edit two files directly inside the sandbox.
There is no interactive configuration wizard — you set tokens in
`.devcontainer/.env` and bridge runtime state in the tracked
`.pi/msg-bridge.json`.

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

### 4.2 Bridge runtime — `.pi/msg-bridge.json`

The tracked `.pi/msg-bridge.json` holds the bridge's non-secret runtime
config. On boot the entrypoint copies it into the bridge package
(`~/.pi/msg-bridge.json`, which the package then rewrites at runtime). Set
`autoConnect` so the bridge listens on startup, and optionally pre-authorize
trusted users and enable channels:

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

- `autoConnect` — `true` opens Socket Mode and starts listening as soon as
  the `client-slack` session boots.
- `auth.trustedUsers` — Slack user IDs namespaced by transport as `slack:U…`.
  Pre-authorizing your own ID skips the first-message challenge (see § 5) —
  recommended for headless setups where nobody watches the terminal.
- `auth.channels` (optional) — per-channel enablement keyed by Slack channel
  ID (`C…`); each entry takes `"enabled": true` and a `mode` of
  `all` / `mentions` / `trusted-only`.

### 4.3 The `client-slack` session starts automatically

You do **not** launch anything by hand. On container boot,
`.devcontainer/entrypoint.sh` npm-installs the bridge into a gitignored
`.pi/bridge/` directory and starts the dedicated `client-slack` tmux session
that loads it via `--extension`:

```bash
pi --extension .pi/bridge/node_modules/pi-messenger-bridge/dist/index.js \
   --mode rpc --approve 2>&1 | tee /tmp/client-slack.log
```

`--mode rpc` keeps pi alive as a persistent process-integration host (a plain
`pi` exits at idle when stdout is not a TTY); `--approve` trusts the
project-local files so the extension loads. The bridge is loaded **only**
here — it is not pinned in `.pi/settings.json`, so no other `pi` session
competes for the Slack connection.

### 4.4 Self-healing supervisor

The `client-slack` session does not run that `pi` command directly — it runs it
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

### Manual relaunch

After editing `.devcontainer/.env` or `.pi/msg-bridge.json`, restart the
session to pick up the change. `.devcontainer/.env` is Compose-formatted (no
`export`), so `set -a` is required to auto-export vars as they are sourced.
**`set -a` is shell-local — the `tmux new-session` command must run in the
same shell that ran `set -a`**, or `pi` will not inherit the vars.

```bash
set -a; source /home/sandbox/harness/.devcontainer/.env; set +a
tmux kill-session -t client-slack 2>/dev/null
tmux new-session -d -s client-slack \
  'pi --extension /home/sandbox/harness/.pi/bridge/node_modules/pi-messenger-bridge/dist/index.js --mode rpc --approve 2>&1 | tee /tmp/client-slack.log'
tmux attach -t client-slack
```

Detach with `Ctrl-b d`. The session name `client-slack` follows the `client-`
prefix convention in
[`context/rules/sandbox-processes.md`](https://github.com/mifunedev/openharness/blob/development/context/rules/sandbox-processes.md).

## 5. Access Control — challenge-based auth

The bridge is **deny-by-default**: an unknown user gets no agent response until
they prove they're allowed to talk to the bot. There is no static allowlist to
maintain — trust is established through a one-time challenge.

1. The first time an unknown user messages the bot, the bridge prints a
   **6-digit challenge code** in the pi terminal. Read it with
   `tmux attach -t client-slack` (detach: `Ctrl-b d`).
2. The user replies with that code in Slack.
3. On a match, the user becomes **trusted** and is persisted to
   `~/.pi/msg-bridge.json` under `auth.trustedUsers`, namespaced by transport as
   `slack:U…`. Trust survives restarts.

For **headless** setups where nobody is watching the pi terminal, pre-authorize
your Slack user ID up front — add `slack:U…` to `auth.trustedUsers` in the
tracked `.pi/msg-bridge.json` (§ 4.2) and restart the `client-slack` session.
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
   tmux capture-pane -t client-slack -p | grep -F '[Slack] Bot user ID:'
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
   `tmux attach -t client-slack` — you should see the inbound event logged
   and the agent's reply posted back to Slack.

## 8. Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Bot stays silent; you've never authenticated | Deny-by-default — your Slack user isn't trusted yet | DM the bot, read the 6-digit code from `tmux attach -t client-slack`, reply with it in Slack — or pre-authorize your user ID in `.pi/msg-bridge.json` (§ 4.2) |
| `invalid_auth` / `not_authed` in the log | `xapp-` and `xoxb-` tokens are swapped | `PI_SLACK_APP_TOKEN` must be the `xapp-` token; `PI_SLACK_BOT_TOKEN` must be the `xoxb-` token — correct `.devcontainer/.env` and relaunch |
| Bridge won't start after an unclean exit | Stale lock file `~/.pi/msg-bridge.lock` left behind | `rm ~/.pi/msg-bridge.lock`, then relaunch the `client-slack` session |
| Bot connected (`[Slack] Bot user ID:` logged) but never replies | `autoConnect` not set in `.pi/msg-bridge.json` — the bridge stays idle | Set `"autoConnect": true` (§ 4.2) and relaunch |
| Bot is trusted but channel messages ignored | Bot is not a member of the channel | In Slack, type `/invite @OpenHarness` in the target channel |

## 9. Architecture Pointer

The Slack capability is the **pi-messenger-bridge** npm package. The harness
installs it via npm into a gitignored `.pi/bridge/` directory and loads it via
`--extension` only in the dedicated `client-slack` tmux session
(`.devcontainer/entrypoint.sh`) — it is not globally pinned in
`.pi/settings.json`, so no other `pi` session competes for the Slack
connection. The harness consumes the package as published and never edits or
vendors it locally — to update, bump the `pi-messenger-bridge@<version>`
version in the entrypoint's `npm install` line. Source lives upstream at
[tintinweb/pi-messenger-bridge](https://github.com/tintinweb/pi-messenger-bridge).

For upstream lineage, the version-pin model, the quarterly review cadence, and
the removal of the old in-tree Slack extension, see
[`.pi/UPSTREAM.md`](https://github.com/mifunedev/openharness/blob/development/.pi/UPSTREAM.md).

[Connecting to the Sandbox](/docs/connecting)
