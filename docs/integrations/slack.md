---
sidebar_position: 1
title: Slack
---

# Slack

Slack support ships as a Pi extension at `.pi/extensions/slack/`. Once your sandbox has Pi installed and Slack tokens in env, mention the bot or DM it to start a conversation.

## Setup

### 1. Create a Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and click **Create New App**.
2. Choose **From an app manifest** and paste the manifest from `.pi/install/slack-manifest.json` in the harness.
3. Install the app to your workspace.
4. Copy the **App-Level Token** (starts with `xapp-`) from the **Basic Information** page.
5. Copy the **Bot User OAuth Token** (starts with `xoxb-`) from the **OAuth & Permissions** page.

### 2. Set Environment Variables

Add these to `.devcontainer/.env`:

```bash
export SLACK_APP_TOKEN=xapp-...
export SLACK_BOT_TOKEN=xoxb-...
```

Optionally set channel and user allowlists (see § Allowlist below).

### 3. (Optional) Enable the Docker Compose Overlay

If you want the `.devcontainer/docker-compose.slack.yml` overlay to handle Slack env wiring for you:

1. Copy `config.example.json` to `config.json` at the harness root (if not already present).
2. Add `.pi/overlays/docker-compose.slack.yml` to the `composeOverrides[]` list in `config.json`.
3. Run `make sandbox` (or re-up the container).

The overlay wires `SLACK_APP_TOKEN` and `SLACK_BOT_TOKEN` from `.devcontainer/.env` into the running container.

## Allowlist

By default, the extension denies all Slack events unless you explicitly set at least one of these:

| Env Var | Purpose |
|---------|---------|
| `SLACK_ALLOW_CHANNELS` | Comma-separated channel IDs to allow (e.g., `C123,C456`). If unset, allows any channel. |
| `SLACK_ALLOW_USERS` | Comma-separated user IDs to allow (e.g., `U789,U101`). If unset, allows any user. |

**Fail-safe deny-default**: If both are unset, the extension blocks all messages. Set at least one to enable bridging.

Examples:
```bash
# Allow specific channels only
SLACK_ALLOW_CHANNELS=C123,C456

# Allow specific users only
SLACK_ALLOW_USERS=U789,U101

# Allow both specific channels AND specific users (both must match)
SLACK_ALLOW_CHANNELS=C123
SLACK_ALLOW_USERS=U789
```

## Architecture

The extension opens a Socket Mode WebSocket on `session_start` and listens for:
- `app_mention` events (when the bot is mentioned in a channel)
- `message` events (DMs to the bot)

Inbound messages are injected into the Pi agent via `pi.sendUserMessage()` with a `[Slack #channel] user:` prefix. The agent processes the message normally. On `turn_end`, if the agent did not explicitly call a slack tool, the extension automatically posts the agent's final text response back to Slack.

Four tools are available for explicit Slack actions:
- `slack_post(channel, text, threadTs?)` — post to a specific channel
- `slack_reply(text, threadTs?)` — reply to the current Slack thread
- `slack_react(emoji, ts?)` — add a reaction to a Slack message
- `slack_upload(filename, content, channel?, threadTs?)` — upload a file to Slack

Cleanup happens on `session_shutdown` — the Socket Mode connection is closed and watchers are stopped.

## Full Details

For a complete file inventory, env var reference, and build/test instructions, see `.pi/extensions/slack/README.md`.

For tracking upstream changes and divergence history, see `.pi/UPSTREAM.md`.
