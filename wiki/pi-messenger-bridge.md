---
title: "pi-messenger-bridge"
slug: pi-messenger-bridge
tags: [pi, slack, messenger, extension, npm]
created: 2026-06-20
updated: 2026-06-20
sources:
  - raw/2026-06-20-pi-messenger-bridge.md
related: [pi-loop, pi-tasks]
confidence: provisional
---

# pi-messenger-bridge

## Relevant Source Files
- `.devcontainer/entrypoint.sh` — installs the package via `npm install pi-messenger-bridge@0.4.0` into the gitignored `.pi/bridge/` dir and loads it via `pi --extension …/dist/index.js --mode rpc --approve` **only** in the `client-slack` tmux session (`.devcontainer/entrypoint.sh:439`–`444`). It is **not** pinned in `.pi/settings.json` `packages[]`, so no other Pi session loads the bridge or contends for the Slack connection.
- `packages/oh/src/config/slack.ts` — the `oh config slack` wizard: prompts for the two Slack tokens, seeds `~/.pi/msg-bridge.json` mode `0600` (`slack.ts:134`–`137`), and (re)launches the bridge's `client-slack` tmux session (`slack.ts:17`, `:143`–`155`).
- `~/.pi/msg-bridge.json` — the bridge's non-secret runtime config (`autoConnect:true`, `auth.trustedUsers`), seeded mode `0600` by the wizard and re-installed by the entrypoint before the `client-slack` session launches.
- `docs/integrations/slack.md` — operator-facing setup guide for the Slack path (create the app, capture `xapp-`/`xoxb-` tokens, run the wizard).
- External: the MIT-licensed npm package `pi-messenger-bridge` (GitHub README captured in the snapshot below).

## Summary
`pi-messenger-bridge` is an MIT-licensed npm package that bridges common messengers — Telegram, WhatsApp, Slack, Discord, and Matrix — into a running Pi coding agent as an in-session extension, so remote users can drive the agent from their messenger app. Open Harness installs it via npm into the gitignored `.pi/bridge/` dir and uses it for **Slack**, replacing the removed in-tree `.pi/extensions/slack/` extension (#481). It is **not** globally pinned in `.pi/settings.json`; instead `.devcontainer/entrypoint.sh` loads it via `--extension` only in the dedicated `client-slack` tmux session, so no other Pi session contends for the Slack connection. The `oh config slack` wizard wires up the tokens and trust.

## Detail
The package installs with `pi install npm:pi-messenger-bridge` and registers the `/msg-bridge` command plus a toggleable status widget. In the harness it is **not** pinned in `.pi/settings.json` `packages[]`; instead `.devcontainer/entrypoint.sh` runs `npm install pi-messenger-bridge@0.4.0` into the gitignored `.pi/bridge/` dir (npm builds the package's native transport deps, which pnpm does not) and loads it via `pi --extension "$HARNESS/.pi/bridge/node_modules/pi-messenger-bridge/dist/index.js" --mode rpc --approve` **only** in the `client-slack` tmux session (`.devcontainer/entrypoint.sh:439`–`444`). Dedicated-session-only load means no other Pi session loads the bridge — important because the single-instance lock (below) would otherwise let multiple instances contend for and steal the Slack Socket-Mode connection. `--mode rpc` keeps the bridge alive headlessly (plain `pi | tee` exits at idle on non-TTY stdout).

**Configuration.** State lives in `~/.pi/msg-bridge.json`, written mode `0600` inside `~/.pi/` (mode `0700`). The Slack shape the wizard seeds is `{ slack: { botToken, appToken }, auth: { trustedUsers: ["slack:U…"], adminUserId }, autoConnect: true, showWidget, debug }` (`packages/oh/src/config/slack.ts:223`–`231`). `autoConnect: true` makes the bridge open its transports headlessly on boot — no interactive `/msg-bridge connect` needed — which is what lets the `client-slack` session come up unattended.

**Credentials & env overrides.** Tokens are supplied as `PI_SLACK_BOT_TOKEN` (`xoxb-…`) and `PI_SLACK_APP_TOKEN` (`xapp-…`); environment variables take precedence over the file config. The wizard upserts these into the sandbox env-overrides file and sources it when launching the bridge (`slack.ts:216`, `:155`).

**Auth model.** Authentication is challenge-based and deny-default: a first-time messenger user receives a 6-digit code printed in the Pi terminal, which they echo back to become a trusted user. Trust is namespaced per transport (`slack:U…`) to prevent cross-platform impersonation. Trusted users can DM the bot admin commands (`/trusted`, `/revoke`, `/channels`, `/enable`, `/disable`).

**Single-instance guard.** A global flag plus a PID lock file at `~/.pi/msg-bridge.lock` stops duplicate Socket-Mode polling when Pi spawns sub-agents.

**Runtime shape.** It is a *pi-native* extension: it injects inbound messages with Pi's `sendUserMessage()` and reads `turn_end` events to post the agent's reply back — no tool-loop hack. In Open Harness the bridge process runs as `pi` inside the `client-slack` tmux session (`slack.ts:17`), (re)started by the wizard, which polls the connection log line before declaring the bridge live.

## System Relationships
```mermaid
flowchart LR
  subgraph cfg[config]
    ENTRY[".devcontainer/entrypoint.sh<br/>npm install → .pi/bridge/<br/>pi --extension --mode rpc"]
    JSON["~/.pi/msg-bridge.json<br/>slack tokens · auth.trustedUsers"]
  end
  subgraph sess["client-slack tmux session"]
    EXT["pi-messenger-bridge<br/>extension (dedicated load)"]
  end
  SLACK["Slack workspace<br/>(Socket Mode)"] -->|inbound event| EXT
  ENTRY -. "--extension load" .-> EXT
  JSON -.config + trust.-> EXT
  EXT -->|sendUserMessage| TURN["Pi agent turn"]
  TURN -->|turn_end| EXT
  EXT -->|reply| SLACK
```
The `oh config slack` wizard seeds `~/.pi/msg-bridge.json`; `.devcontainer/entrypoint.sh` installs the package into `.pi/bridge/` and loads it via `--extension` inside the dedicated `client-slack` tmux session. Because it is **not** globally pinned in `.pi/settings.json`, no other Pi session loads the bridge to contend for the Slack connection.

## See Also
- [[pi-loop]]
- [[pi-tasks]]
