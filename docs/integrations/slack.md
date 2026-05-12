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

### 2. Add Tokens to `.devcontainer/.env`

Add these lines (no `export` prefix — Compose's `.env` format, same as the rest of the file):

```bash
SLACK_APP_TOKEN=xapp-...
SLACK_BOT_TOKEN=xoxb-...
SLACK_ALLOW_USERS=U01ABCD2345        # at least one allowlist is required
# SLACK_ALLOW_CHANNELS=C01ABCD2345   # optional; see § Allowlist
```

See § Allowlist for how to obtain user/channel IDs and the deny-by-default rules.

### 3. Launch `pi` Inside the Sandbox

The extension reads tokens from `process.env` at `session_start`, so the `pi` process must inherit them. `.devcontainer/.env` uses Compose's `KEY=value` format (not shell `export`), so you need `set -a` to auto-export everything as you source it. Per [`context/rules/sandbox-processes.md`](https://github.com/ryaneggz/open-harness/blob/main/context/rules/sandbox-processes.md), long-running agents live in a named tmux session.

```bash
make shell
set -a; source /home/sandbox/harness/.devcontainer/.env; set +a
tmux new-session -d -s agent-pi 'pi 2>&1 | tee /tmp/agent-pi.log'
tmux attach -t agent-pi
```

Detach with `Ctrl-b d`; reattach any time with `tmux attach -t agent-pi`.

No Docker Compose overlay is required — the in-tree Pi extension at `.pi/extensions/slack/` consumes these env vars directly. See `.pi/extensions/slack/README.md` for the full env var reference.

### 4. Smoke Test

1. `env | grep SLACK` from the same shell should list `SLACK_APP_TOKEN`, `SLACK_BOT_TOKEN`, and your allowlist var. If they're missing here, the `set -a` step did not run in the same shell.
2. `curl -s -H "Authorization: Bearer $SLACK_BOT_TOKEN" https://slack.com/api/auth.test | jq` should return `"ok": true`.
3. From an allow-listed user, DM the bot or `@mention` it in a channel where it's a member. `tmux attach -t agent-pi` to watch `pi` receive the message and post the reply back to Slack.

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
