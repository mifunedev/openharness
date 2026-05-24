---
sidebar_position: 1
title: Slack
---

> Slack UI labels accurate as of 2026-05-12.

# Slack

The Slack integration ships as a Pi extension at `.pi/extensions/slack/`. Once
your sandbox is up and Slack tokens are in env, DM the bot or mention it in a
channel to start a conversation. The extension opens a Socket Mode WebSocket on
startup and bridges inbound Slack events into the Pi agent, then posts the
agent's response back to Slack.

## 1. Prerequisites

- Sandbox is running (`make ps` shows the `openharness` container).
- `pi --version` works inside the sandbox (`make shell` to verify).
- A Slack workspace where you can create apps (workspace admin or equivalent).
  If you are on a company Slack that restricts app creation, create a free
  personal workspace at [slack.com/get-started](https://slack.com/get-started)
  and use it for testing.

## 2. Find Your Slack IDs

You need these before filling in the allowlist env vars.

**User ID (`U…`)**

1. Open Slack and go to your profile (or the profile of the user to allow).
2. Click the **...** (More) menu in the top-right of the profile panel.
3. Click **Copy member ID**. The value starts with `U`.

**Channel ID (`C…`)**

1. Open the channel in Slack.
2. Click the channel name at the top to open the **About** panel.
3. Scroll to the bottom of the panel — the channel ID starts with `C` and is
   listed there.

Collect all user and channel IDs you want to allow before moving to env setup.

## 3. Create the Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and click
   **Create New App**.
2. Choose **From an app manifest**.
3. Select your workspace and paste the contents of
   `.pi/install/slack-manifest.json` from this repo.
4. Click through the confirmation screens and then **Install to Workspace**.
5. Approve the requested OAuth scopes.

## 4. Capture Tokens

After installation, collect two tokens from the Slack app settings. They are
not interchangeable — the wrong token in the wrong variable causes a silent
auth failure.

| Token | Prefix | Where to find it |
|-------|--------|-----------------|
| App-Level Token | `xapp-` | **Basic Information** page → **App-Level Tokens** section → generate one with `connections:write` scope |
| Bot User OAuth Token | `xoxb-` | **OAuth & Permissions** page → **Bot User OAuth Token** |

Keep both values ready for the next step.

## 5. Run the wizard — `oh config slack`

Inside the sandbox, run the wizard. It prompts for the two tokens, asks
which allowlist mode to use (users / channels / both), validates IDs,
writes `.devcontainer/.env` atomically, and offers to restart the
`client-slack` tmux session.

```bash
make shell           # enter the sandbox
oh config slack      # interactive wizard
```

The wizard:
- Validates token prefixes (`xapp-` / `xoxb-`) before writing — swapped
  tokens are caught at the prompt, not after launch.
- Enforces the deny-default allowlist rule (at least one of
  `SLACK_ALLOW_USERS` / `SLACK_ALLOW_CHANNELS` is required).
- Writes only the Slack keys; unrelated entries (`GH_TOKEN`, `TZ`, etc.)
  are preserved.
- **Starts the Slack bridge for you** — at the end, it kills any
  existing `client-slack` tmux session and launches a fresh one running
  `pi` with the new env sourced. `pi` loads the Slack extension on boot
  and opens the Socket Mode connection. The wizard polls for the
  `"connected and listening"` log line and prints `✓ Slack bridge is live`
  on success (up to 15s).

If you decline the start step, the wizard prints the exact commands to
launch the bridge manually later.

### Manual fallback

If `oh` isn't available (older sandbox image, or you'd rather edit by
hand), the manual procedure still works:

<details>
<summary>Hand-edit <code>.devcontainer/.env</code> + relaunch <code>client-slack</code></summary>

`.devcontainer/.env` uses Docker Compose `KEY=value` format — no `export`
prefix. This file is gitignored, so your tokens will not be committed.

```
SLACK_APP_TOKEN=xapp-...
SLACK_BOT_TOKEN=xoxb-...

# At least one of the two allowlist vars must be set (deny-default if both absent).
# When both are set: message passes only if channel AND user both match.
SLACK_ALLOW_USERS=U01ABCD2345,U02EFGH6789
# SLACK_ALLOW_CHANNELS=C01ABCD2345,C02EFGH6789

# Optional vars:
# SLACK_BASE_DIR=/custom/path    # default: ~/.pi/cache/slack
# SLACK_BACKFILL=C01ABCD2345     # comma-separated channel IDs to backfill on startup (slow)
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
[`context/rules/sandbox-processes.md`](https://github.com/ryaneggz/open-harness/blob/development/context/rules/sandbox-processes.md).

</details>

## 6. Smoke Test

Run these checks in order. The first two run in the shell where you sourced
the env (before attaching to tmux).

1. **Vars present in the current shell:**
   ```bash
   env | grep SLACK
   ```
   Expected: `SLACK_APP_TOKEN`, `SLACK_BOT_TOKEN`, and your allowlist var are
   all listed. If any are missing, `set -a` did not run in this shell — repeat
   step 6 from the beginning.

2. **Socket Mode connected** (the real connectivity check):
   ```bash
   tmux capture-pane -t client-slack -p | grep -i 'socket\|connected\|listening'
   ```
   Look for lines indicating the Socket Mode client connected or is listening.
   Note: `curl https://slack.com/api/auth.test` only validates the bot token
   (`xoxb-`), not the Socket Mode app token (`xapp-`). An invalid
   `SLACK_APP_TOKEN` can pass `auth.test` and still fail to open a Socket Mode
   connection. Use the tmux log check above as the authoritative test.

3. **Round-trip test:**
   From an allow-listed user account, DM the bot or `@mention` it in an
   allow-listed channel. Watch `tmux attach -t client-slack` — you should see the
   inbound event logged and the agent's reply posted back to Slack.

## 7. Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Bot doesn't respond; allowlist is set | `pi` did not inherit the vars — `set -a` ran in a different shell than `tmux new-session` | Kill the session (`tmux kill-session -t client-slack`), run `set -a; source …; set +a`, then relaunch `tmux new-session` in the same shell |
| Bot doesn't respond; no allowlist set | Deny-default: both `SLACK_ALLOW_CHANNELS` and `SLACK_ALLOW_USERS` are unset | Add at least one allowlist var to `.devcontainer/.env` and relaunch |
| `invalid_auth` or `not_authed` in log | `xapp-` and `xoxb-` tokens are swapped | `SLACK_APP_TOKEN` must be the `xapp-` token; `SLACK_BOT_TOKEN` must be the `xoxb-` token — correct in `.devcontainer/.env` and relaunch |
| Socket Mode crashes / reconnects in a loop | Network interruption or token revoked | `tmux kill-session -t client-slack`, verify tokens in `.devcontainer/.env`, then relaunch |
| Bot is in allow-list but channel messages ignored | Bot is not a member of the channel | In Slack, type `/invite @OpenHarness` in the target channel |

## 8. Architecture Pointer

The extension is self-contained under `.pi/extensions/slack/`. For the full
file inventory, env var reference, and build/test instructions, see
[`.pi/extensions/slack/README.md`](https://github.com/ryaneggz/open-harness/blob/development/.pi/extensions/slack/README.md).

For upstream lineage, sync model, and divergence history, see
[`.pi/UPSTREAM.md`](https://github.com/ryaneggz/open-harness/blob/development/.pi/UPSTREAM.md).

[Connecting to the Sandbox](/docs/connecting)
