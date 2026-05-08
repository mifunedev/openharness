# Slack Socket Mode Bridge

Slack Socket Mode bridge implemented as a Pi extension. Once tokens are set in environment, this extension opens a WebSocket listener and bridges inbound Slack messages into the Pi agent via `pi.sendUserMessage()`, then posts agent responses back to Slack.

## File Inventory

| File | Purpose |
|------|---------|
| `index.ts` | Extension factory; manages `session_start`/`session_shutdown` lifecycle, bridges inbound Slack events to Pi, registers tools, posts agent responses back to Slack |
| `client.ts` | Slack Socket Mode client + Web API wrappers (chat.postMessage, files.uploadV2, conversations.history) |
| `context.ts` | Response helpers: `respond()`, `replaceMessage()`, `respondInThread()`, `setTyping()`, `uploadFile()`, `setWorking()`, `deleteMessage()` |
| `store.ts` | Per-channel JSONL persistence for message history + deduplication |
| `events.ts` | File-system event watcher with cron scheduling; synthetic event builder and `threadTs` support |
| `tools.ts` | Pi tool registration: `slack_post()`, `slack_reply()`, `slack_react()`, `slack_upload()` |
| `allowlist.ts` | Channel/user allow-list gating; fail-safe deny-default when both env vars unset |
| `download.ts` | Channel history backfill via Slack Web API |
| `log.ts` | Structured logging with chalk formatting |
| `__tests__/` | Vitest test suite (events, bridge, tools, allowlist) |

## Required Environment Variables

Set these in `.devcontainer/.env` or in your shell before running Pi:

| Variable | Purpose |
|----------|---------|
| `SLACK_APP_TOKEN` | Socket Mode app token (xapp-...). Required to start the extension. |
| `SLACK_BOT_TOKEN` | Bot user token (xoxb-...). Required to start the extension. |

## Optional Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `SLACK_ALLOW_CHANNELS` | (unset) | Comma-separated list of channel IDs to allow (`C123,C456`). If unset, allows any channel. |
| `SLACK_ALLOW_USERS` | (unset) | Comma-separated list of user IDs to allow (`U123,U456`). If unset, allows any user. |
| `SLACK_BASE_DIR` | `~/.pi/cache/slack` | Base directory for per-channel logs (JSONL) and backfill cache. Created if missing. |
| `SLACK_BACKFILL` | (unset) | Comma-separated channel IDs to backfill on startup (`C123,C456`). Off by default (slow operation). |

## Fail-Safe Allowlist Behavior

When **both** `SLACK_ALLOW_CHANNELS` and `SLACK_ALLOW_USERS` are unset, the extension **denies all events by default**. This prevents unintended channel access in production.

To enable the bridge:
- Set **at least one** of the two env vars. If only `SLACK_ALLOW_CHANNELS` is set, any user in those channels is allowed (user filter disabled). If only `SLACK_ALLOW_USERS` is set, those users are allowed in any channel (channel filter disabled). If both are set, a request passes when **both** the channel and user are in their respective lists.

Example configurations:
```bash
# Allow specific channels only
SLACK_ALLOW_CHANNELS=C123,C456

# Allow specific users only
SLACK_ALLOW_USERS=U789,U101

# Allow either specific channels OR specific users (channels unset allows any, users must match)
SLACK_ALLOW_USERS=U789
```

## How to Run

1. **Install Pi** (if not already done):
   ```bash
   # Inside the harness
   pi --version
   ```

2. **Set Slack tokens** in `.devcontainer/.env`:
   ```bash
   export SLACK_APP_TOKEN=xapp-...
   export SLACK_BOT_TOKEN=xoxb-...
   # Optionally set the allow-lists:
   export SLACK_ALLOW_CHANNELS=C123,C456
   ```

3. **Start Pi**:
   ```bash
   pi
   ```

   The extension loads automatically on `session_start`. If tokens are missing, the extension logs a warning and disables itself. The bridge is ready to receive Slack messages once Pi is idle.

## Build and Test

No separate build step needed — the extension lives alongside Pi's source. Test via the harness root:

```bash
# Run vitest for the extension
cd /home/sandbox/harness
pnpm test -- .pi/extensions/slack/__tests__

# Or run all tests
pnpm test
```

Tests cover:
- `threadTs` event routing and ordering
- Bridge message injection and `ctx.isIdle()` gating
- Allowlist allow/deny logic
- Tool execution and Slack response posting

## Tracking Upstream Changes

See `.pi/UPSTREAM.md` for:
- Lineage and reference source
- Customizations carried over
- Sync model (port, not vendor — one-way)
- Owner and quarterly review schedule

## Setup Guide

For step-by-step Slack app creation, token setup, and channel allowlist configuration, see `docs/integrations/slack.md`.
