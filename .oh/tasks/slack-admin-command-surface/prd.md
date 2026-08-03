# PRD: Slack admin command surface clarity

## Background

Issue #354 reports that Slack admin commands such as `/help`, `/trusted`, `/channels`, `/enable`, and `/disable` are not visible, while the docs do not clearly distinguish them from Pi's `/msg-bridge` command. The root package described slash-prefixed DM handlers, but the shipped Slack manifest and bridge transport originally lacked the paired native slash-command declarations/handlers needed for discoverability.

## Goal

Make the documented Slack admin workflow unambiguous and add a deterministic guard so future docs do not reintroduce the Pi-vs-Slack command-surface confusion.

## Non-goals

- Do not patch generated `.pi/bridge/node_modules` as source.
- Implement Slack-native admin slash commands only as a paired change: `.pi/install/slack-manifest.json` declarations plus package-owned Bolt command handlers.
- Do not change Slack token/config persistence behavior.

## Evidence / RCA

- `.pi/bridge/node_modules/pi-messenger-bridge/dist/index.js` registers only `msg-bridge` as a Pi command.
- `.pi/bridge/node_modules/pi-messenger-bridge/dist/transports/slack.js` routes admin commands only for DM text beginning with `/` or six-digit challenge codes.
- `.pi/bridge/node_modules/pi-messenger-bridge/dist/auth/challenge-auth.js` handles `/help`, `/trusted`, `/channels`, `/enable`, `/disable`, and `/revoke` only after the Slack user is trusted.
- The original `.pi/install/slack-manifest.json` contained message event subscriptions but no Slack-native slash command definitions; the package also lacked Bolt `app.command(...)` handlers.

## User Stories

### US-001 — Separate Pi and Slack command surfaces

As an Open Harness operator, I can tell which commands are typed inside the Pi TUI and which are sent to the Slack bot, so I do not look for `/trusted` or `/help` in the wrong place.

Acceptance criteria:

- Slack integration docs state that `/msg-bridge` is the Pi in-session command surface.
- Docs no longer instruct users to run `/trusted` or `/channels` inside the Pi session.
- Docs state that Slack admin commands are manifest-backed and separate from Pi's `/msg-bridge` surface.

### US-002 — Document Slack slash-command caveat and fallback

As an operator debugging Slack admin commands, I know what to do if Slack intercepts `/help` or `/trusted` before the bot receives them.

Acceptance criteria:

- `.pi/install/slack-manifest.json` declares the documented admin slash commands and docs explain how to update an existing Slack app.
- Docs provide reliable fallback inspection/config commands: `gateway status`, `tmux capture-pane -t client-slack-pi -p`, `jq '.auth' ~/.pi/msg-bridge.json`, and `.pi/msg-bridge.json` pre-seeding.
- Smoke/troubleshooting sections guide users to start with a plain-text DM to trigger challenge auth.

### US-003 — Guard the docs contract

As a maintainer, I get a failing probe if future docs again imply that `/trusted` or `/channels` are Pi TUI commands.

Acceptance criteria:

- Add a Tier-A eval probe checking Slack docs for the command-surface contract.
- The probe fails if the known misleading phrases reappear.
- The probe passes locally.

### US-004 — Submit a reviewable PR

As a maintainer, I can review the fix in a single branch with task artifacts and verification evidence.

Acceptance criteria:

- Add a changelog entry under `## [Unreleased]`.
- Commit on `bug/354-slack-admin-surface`.
- Push branch and open a PR targeting `development`.
- PR body references issue #354 and lists verification commands.
