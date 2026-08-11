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
   **Socket Mode**, declares the bridge admin slash commands, and requests the
   bot scopes the bridge needs.
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

Three layers. **Tokens** go in `.devcontainer/.env` (§ 4.1). The **Pi
session command surface is the bridge's own `/msg-bridge` command** (§ 4.2):
use it for connection/status/configuration inside `client-slack-pi`. The
**Slack app manifest** in `.pi/install/slack-manifest.json` declares the admin
slash commands so Slack can show and route them (§ 6). Runtime trust/channel
state persists in `~/.pi/msg-bridge.json`; the tracked `.pi/msg-bridge.json` is
only an optional pre-seed for headless setups (§ 4.2).

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

Inside the Pi session, the bridge exposes **one** Pi slash command:
`/msg-bridge`. Attach only when you need to inspect or change the bridge from
the TUI:

```bash
gateway pi --attach     # start (if needed) + attach to client-slack-pi
```

Then, inside the session, use:

- `/msg-bridge` — bridge status and the config menu.
- `/msg-bridge status` — connection state plus trusted-user/channel counts.
- `/msg-bridge help` — the Pi-side command reference.
- `/msg-bridge connect` / `/msg-bridge disconnect` — Socket Mode lifecycle.

Do **not** look for `/trusted`, `/channels`, `/enable`, `/disable`, or `/help`
as Pi TUI commands. This mirrors the root package: `pi-messenger-bridge`'s
README lists `/msg-bridge ...` under `## Commands`, then lists `/trusted`,
`/channels`, `/enable`, `/disable`, `/revoke`, `/toggletools`, and `/help` in a
separate "Admin commands (in DM with the bot)" section. The package source also
registers only `msg-bridge` as a Pi command. Open Harness additionally declares
those admin commands in `.pi/install/slack-manifest.json` and pins the bridge
fork branch that handles Slack slash-command payloads by forwarding them to the
same `handleAdminCommand` path as trusted DM text (§ 6). Auth/channel changes
persist to `~/.pi/msg-bridge.json` (owned and rewritten by the package);
`gateway pi` preserves them across restarts, never clobbering live grants (bug
#289).

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
any grants you've since added via Slack DM admin handlers or runtime challenge
auth.

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
pi --session-dir ~/.pi/gateway/pi-sessions --continue \
   --extension .pi/bridge/node_modules/pi-messenger-bridge/dist/index.js \
   --extension .pi/bridge-recovery/index.ts \
   --approve            # interactive on the pane TTY — no --mode rpc, no | tee
```

Pi runs **interactive**, attached to the pane's real TTY, so loaded UI extensions
render in the TUI instead of flooding stdout with `extension_ui_request` JSON
frames, and the REPL stays alive at idle. The private mode-700 session directory
belongs only to this gateway. Every launch explicitly uses `--continue`, so the
second launch reopens the first launch's active path, including its newly written
compaction entry. Logs are captured out of band in `/tmp/client-slack-pi.log`.
The package owns Slack compaction (§ 4.6); the only local co-extension is
`.pi/bridge-recovery/index.ts` for Codex retry-recovery (§ 4.5). Neither is
globally pinned, so local TUI, cron, Hermes, and sibling Pi sessions remain
unaffected.

### 4.4 Self-healing supervisor

The `client-slack-pi` session runs under
`.devcontainer/client-slack-supervise.sh`. Crashes and the legacy
`extension ctx is stale after session replacement or reload` signature still
restart Pi, but every recovery signals only the exact PID recorded for that
launch. There is no name-based `pkill`; sibling Pi sessions survive. EXIT, INT,
TERM, and HUP cleanup tears down the exact watcher/ticker children and removes
the bridge lock, heartbeat, PID, and transient restart state.

Successful compaction uses no log marker or environment nonce. Before launching
Pi, the supervisor creates a private inherited one-shot pipe, synchronizes until
the reader is open, passes the write descriptor to the bridge package, and
unlinks the FIFO pathname. Ordinary Node tool subprocesses inherit only stdio,
so they may see an fd number in the environment but do not possess the pipe;
pane output and old logs have no signaling path. The package disconnects Slack
first, writes one byte, and closes its descriptor. The watcher records
`compaction reconnected` and signals the exact supervised PID. After Pi exits,
the supervisor closes its writer and waits for the one-shot watcher to settle
**before** evaluating rc, so immediate completion and simultaneous completion +
rc=0 cannot be lost. Launch two then uses the same `--session-dir --continue`
path rather than starting bare Pi.

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

### 4.6 Compact the current Pi Slack session from Slack

An **already-authorized** Slack user can send one of these complete,
case-insensitive ordinary messages:

```text
compact session
compact current session
compact the current session
```

The exact pinned `pi-messenger-bridge` package recognizes the control only
**after** its normal user/channel trust check. It binds an immutable request to
the authenticated message metadata and posts the acknowledgement directly to
the originating Slack chat/thread:

> Compaction requested. I’ll compact this session, then the gateway will restart
> and reconnect.

A successful `chat.postMessage` is the commit point. If Slack delivery fails,
the package does not compact, disconnect, or signal. If another Pi turn is
active, the acknowledged request waits for `agent_settled`; it never attaches
to an arbitrary later text turn. Empty responses, tool turns, and provider
errors therefore cannot steal the request. Authenticated inbound callbacks are
serialized, and overlap/direct-next messages receive an in-progress response
without entering the context being replaced.

The package then calls Pi's documented
`ctx.compact({ customInstructions, onComplete, onError })`. On success it closes
the logical intake gate immediately, disconnects the exact Slack transport, and
only then writes to the supervisor's private pipe. Session/request generations
guard late completion/error callbacks after replacement. On error the gateway
stays connected and re-arms without a restart loop.

The package also accepts ordinary text `/compact [instructions]` if Slack passes
it through. The exact **untrimmed** instruction capture is checked before
normalization: C0, DEL, and C1 controls are rejected, and the limit is 500
Unicode code points. Open Harness does **not** register or claim a native Slack
`/compact` slash command; it is absent from the app manifest. Use the natural
message forms as the supported surface.

### 4.7 Run and verify (read-only)

Run and check the gateway **from inside the sandbox** — both `gateway <pi|hermes>` and
`make gateway <pi|hermes>` require `pi`/`hermes` on `PATH`, so they only work in the
container (`.oh/scripts/gateway.sh` errors "run inside the sandbox" otherwise).

```bash
gateway pi                 # start the client-slack-pi session (idempotent)
gateway status             # both sessions + HEALTH (not just existence), e.g.
                           #   ✓ client-slack-pi  healthy   (tmux attach -t client-slack-pi)
                           #   · client-slack-hermes  stopped   (gateway hermes)
```

`status` reports the supervisor's live state, not merely "a tmux session exists":
`healthy` (heartbeat fresh), `recovering` (in a restart/backoff — may add
`· N restart(s)`, `· stale-ctx recovered <age> ago`, or
`· compaction reconnected <age> ago`), or
`running · disconnected (no PI_SLACK token)` when the bridge loaded without tokens.
A session with no state yet falls back to `running`.

To **watch** a running gateway without any risk of killing it, attach **read-only** with
`-r`, then detach with `Ctrl-b d` — never `Ctrl-C` or `exit` (those stop the pi process):

```bash
tmux attach -r -t client-slack-pi     # read-only view of the live session; detach: Ctrl-b d
tail -f /tmp/client-slack-pi.log      # or just tail the log — no attach needed
```

Use the interactive `gateway pi --attach` (read-write) **only** when you actually need to
run Pi-side `/msg-bridge` commands inside the session. Slack trust/channel admin
handlers are DM text messages to the bot, not Pi TUI commands. The sibling Hermes gateway
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

## 6. Admin Slack commands

The shipped Slack manifest declares these **manifest-backed Slack admin commands**,
and the pinned bridge fork handles them over Socket Mode after the invoking user
is trusted.
The same text still works as trusted Slack DM text when Slack delivers it as a
message event:

| Slack command / DM text | Effect |
|---------|--------|
| `/trusted` | List currently trusted users |
| `/revoke <userId>` | Revoke a user's trust (use the `slack:U…` or `U…` ID) |
| `/channels` | List known chats and their enabled mode |
| `/enable <chatId> <all\|mentions\|trusted-only>` | Enable the bot in a chat with the given response mode |
| `/disable <chatId>` | Disable the bot in a chat |
| `/toggletools` | Toggle tool-call visibility in Slack replies |
| `/help` | Show the bridge's admin help |

If you created the Slack app before this manifest declared admin slash
commands, update/recreate the app from `.pi/install/slack-manifest.json` so
Slack can show them in autocomplete and route command payloads to the bridge.
If a command still does not arrive, use the supported inspection/configuration
fallbacks:

```bash
gateway status
tmux capture-pane -t client-slack-pi -p | grep -F '[Slack] Bot user ID:'
jq '.auth' ~/.pi/msg-bridge.json
```

For headless setups, pre-seed `auth.trustedUsers` and `auth.channels` in
`.pi/msg-bridge.json` (§ 4.2), then run `gateway pi --restart`. Use Pi-side
`/msg-bridge status` inside `gateway pi --attach` for connection state;
`/msg-bridge status` is not a Slack admin command.

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
   DM the bot plain text such as `hello` or `@mention` it in a channel. If
   you've never talked to it before, complete the 6-digit challenge (§ 5) first.
   After trust succeeds, test one manifest-backed admin command such as
   `/trusted` in the bot DM. Watch `tmux attach -r -t client-slack-pi` — you
   should see the inbound event logged and the agent's reply posted back to
   Slack.

4. **Compaction round trip:** send `compact current session` as a complete Slack
   message. Expect the acknowledgement in the same DM/thread, then a short
   reconnect. Confirm with `gateway status` (`compaction reconnected … ago`) and
   the fresh `[Slack] Bot user ID:` marker. Do not expect a second completion
   message from the replaced process.

## 8. Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Bot stays silent; you've never authenticated | Deny-by-default — your Slack user isn't trusted yet | DM the bot plain text, read the 6-digit code from `tmux attach -r -t client-slack-pi`, reply with it in Slack — or pre-authorize your user ID in `.pi/msg-bridge.json` (§ 4.2) |
| `/help` or `/trusted` is not visible in Slack autocomplete | The Slack app was created before `.pi/install/slack-manifest.json` declared admin slash commands, or the app manifest was not updated | Update/recreate the Slack app from `.pi/install/slack-manifest.json`, then `gateway pi --restart`; use `gateway status`, `tmux capture-pane -t client-slack-pi -p`, and `jq '.auth' ~/.pi/msg-bridge.json` to inspect runtime state |
| `invalid_auth` / `not_authed` in the log | `xapp-` and `xoxb-` tokens are swapped | `PI_SLACK_APP_TOKEN` must be the `xapp-` token; `PI_SLACK_BOT_TOKEN` must be the `xoxb-` token — correct `.devcontainer/.env` and relaunch |
| Bridge won't start after an unclean exit | Stale lock file `~/.pi/msg-bridge.lock` left behind | `rm ~/.pi/msg-bridge.lock`, then relaunch the `client-slack-pi` session |
| Bot connected (`[Slack] Bot user ID:` logged) but never replies | `autoConnect` not set in `.pi/msg-bridge.json` — the bridge stays idle | Set `"autoConnect": true` (§ 4.2) and relaunch |
| Bot is trusted but channel messages ignored | Bot is not a member of the channel | In Slack, type `/invite @OpenHarness` in the target channel |
| Text mentioning “compact” did not compact | Only the exact full-message grammar is accepted | Send `compact session`, `compact current session`, or `compact the current session` as the entire authorized Slack message |
| Slack says `/compact` is unknown | Open Harness does not register a native Slack `/compact` slash command | Use natural message text (`compact current session`); the optional stamped `/compact [instructions]` form is only handled if ordinary text reaches Pi |
| Acknowledgement arrived but reconnect is unclear | The acknowledgement precedes compaction and is not a completion confirmation | Run `gateway status`, then check `tmux capture-pane -t client-slack-pi -p | grep -F '[Slack] Bot user ID:'`; inspect `/tmp/client-slack-pi.log` for either the safe compaction failure or supervisor reconnect line |

## 9. Architecture Pointer

The Slack capability is the **pi-messenger-bridge** npm package. The harness
installs it via npm into a gitignored `.pi/bridge/` directory and loads it via
`--extension` only in the dedicated `client-slack-pi` tmux session
(`.devcontainer/entrypoint.sh`) — it is not globally pinned in
`.pi/settings.json`, so no other `pi` session competes for the Slack
connection. The harness co-loads only `.pi/bridge-recovery/` for Codex retry;
Slack compaction is package-owned, not patched or vendored in the harness.
Replies post **in a thread** anchored to the triggering channel message
(`thread_ts`); DMs stay flat. While these changes are unreleased, the harness
pins the exact reviewed fork commit
`github:ryaneggz/pi-messenger-bridge#965de09fdfbe156c4369df84091723614c0b6600`
from [ryaneggz/pi-messenger-bridge#2](https://github.com/ryaneggz/pi-messenger-bridge/pull/2),
which includes thread replies, admin handlers, and supervised compact control.
Re-pin to `pi-messenger-bridge@<version>` once upstream publishes them. Source lives upstream at
[tintinweb/pi-messenger-bridge](https://github.com/tintinweb/pi-messenger-bridge).

For upstream lineage, the version-pin model, the quarterly review cadence, and
the removal of the old in-tree Slack extension, see
[`.pi/UPSTREAM.md`](https://github.com/mifunedev/openharness/blob/development/.pi/UPSTREAM.md).

[Connecting to the Sandbox](/docs/connecting)
