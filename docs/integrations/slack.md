---
sidebar_position: 1
title: Slack
---

> Slack UI labels accurate as of 2026-05-12.

# Slack

The Slack integration is provided by the npm package
[**pi-messenger-bridge**](https://github.com/tintinweb/pi-messenger-bridge)
(MIT, multi-transport — Slack / Telegram / WhatsApp / Discord / Matrix). The
harness **pins it in `.pi/settings.json` `packages[]`** as
`npm:pi-messenger-bridge@0.4.0`, so `pi` auto-installs and loads it on boot —
you do **not** run `pi install` yourself. Once your sandbox is up and Slack
tokens are in env, DM the bot or mention it in a channel to start a
conversation. The bridge opens a Socket Mode WebSocket on startup, relays
inbound Slack events into the Pi agent, and posts the agent's response back to
Slack.

> Upstream / standalone users (outside this harness) install the package with
> `pi install npm:pi-messenger-bridge`. Inside the harness the pin handles it.

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

## 4. Run the wizard — `oh config slack`

Inside the sandbox, run the wizard. It prompts for the two tokens, optionally
takes your Slack user ID to pre-authorize, validates the inputs, and wires up
the bridge for you.

```bash
make shell           # enter the sandbox
oh config slack      # interactive wizard
```

The wizard:
- Validates token prefixes (`xapp-` / `xoxb-`) before writing — swapped
  tokens are caught at the prompt, not after launch.
- Writes the two tokens to `.devcontainer/.env` as `PI_SLACK_APP_TOKEN`
  (`xapp-…`) and `PI_SLACK_BOT_TOKEN` (`xoxb-…`). Unrelated entries
  (`GH_TOKEN`, `TZ`, etc.) are preserved.
- Seeds `~/.pi/msg-bridge.json` (the bridge's env-overrides file) with
  `"autoConnect": true` so the bridge connects and starts listening on boot.
- Optionally **pre-authorizes** the Slack user ID you provide, adding it to
  `auth.trustedUsers` so you skip the challenge step (see § 5) — useful for
  headless setups where you can't watch the terminal.
- **Starts the Slack bridge for you** — it kills any existing
  `client-slack` tmux session and launches a fresh one running `pi` with the
  new env sourced. `pi` loads the bridge on boot and opens the Socket Mode
  connection. The wizard polls for the `[Slack] Bot user ID:` log line and
  prints success once the bridge is live (up to 15s).

If you decline the start step, the wizard prints the exact commands to
launch the bridge manually later.

### Manual fallback

If `oh` isn't available (older sandbox image, or you'd rather edit by
hand), the manual procedure still works:

<details>
<summary>Hand-edit <code>.devcontainer/.env</code> + relaunch <code>client-slack</code></summary>

`.devcontainer/.env` uses Docker Compose `KEY=value` format — no `export`
prefix. This file is gitignored, so your tokens will not be committed:

```
PI_SLACK_APP_TOKEN=xapp-...
PI_SLACK_BOT_TOKEN=xoxb-...
```

The bridge also reads `~/.pi/msg-bridge.json`, which overrides env and holds
non-secret runtime state — set `autoConnect` so the bridge listens on boot, and
(optionally) pre-authorize trusted users so they skip the challenge:

```json
{
  "autoConnect": true,
  "auth": {
    "trustedUsers": ["slack:U01ABCD2345"]
  }
}
```

Then launch Pi in tmux. `.devcontainer/.env` is Compose-formatted (no
`export`), so `set -a` is required to auto-export vars as they are
sourced. **`set -a` is shell-local — the `tmux new-session` command must
run in the same shell that ran `set -a`**, or `pi` will not inherit the
vars. This is the most common manual-mode failure.

```bash
set -a; source /home/sandbox/harness/.devcontainer/.env; set +a
tmux new-session -d -s client-slack 'pi 2>&1 | tee /tmp/client-slack.log'
tmux attach -t client-slack
```

Detach with `Ctrl-b d`. The session name `client-slack` follows the `client-`
prefix convention in
[`context/rules/sandbox-processes.md`](https://github.com/mifunedev/openharness/blob/development/context/rules/sandbox-processes.md).

</details>

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
your Slack user ID up front — pass it to `oh config slack`, or add
`slack:U…` to `auth.trustedUsers` in `~/.pi/msg-bridge.json` by hand. That skips
the challenge entirely.

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
| Bot stays silent; you've never authenticated | Deny-by-default — your Slack user isn't trusted yet | DM the bot, read the 6-digit code from `tmux attach -t client-slack`, reply with it in Slack — or pre-authorize your user ID via `oh config slack` |
| `invalid_auth` / `not_authed` in the log | `xapp-` and `xoxb-` tokens are swapped | `PI_SLACK_APP_TOKEN` must be the `xapp-` token; `PI_SLACK_BOT_TOKEN` must be the `xoxb-` token — correct `.devcontainer/.env` and relaunch |
| Bridge won't start after an unclean exit | Stale lock file `~/.pi/msg-bridge.lock` left behind | `rm ~/.pi/msg-bridge.lock`, then relaunch the `client-slack` session |
| Bot connected (`[Slack] Bot user ID:` logged) but never replies | `autoConnect` not set in `~/.pi/msg-bridge.json` — the bridge stays idle | Set `"autoConnect": true` (the wizard does this) and relaunch |
| Bot is trusted but channel messages ignored | Bot is not a member of the channel | In Slack, type `/invite @OpenHarness` in the target channel |

## 9. Architecture Pointer

The Slack capability is the **pi-messenger-bridge** npm package, pinned in
`.pi/settings.json` `packages[]` as `npm:pi-messenger-bridge@0.4.0`. The harness
consumes it as published and never edits or vendors it locally — to update,
bump the pin. Source lives upstream at
[tintinweb/pi-messenger-bridge](https://github.com/tintinweb/pi-messenger-bridge).

For upstream lineage, the version-pin model, the quarterly review cadence, and
the removal of the old in-tree Slack extension, see
[`.pi/UPSTREAM.md`](https://github.com/mifunedev/openharness/blob/development/.pi/UPSTREAM.md).

[Connecting to the Sandbox](/docs/connecting)
