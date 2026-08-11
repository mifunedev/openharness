# Upstream Tracking

## Provenance

| Property | Value |
|----------|-------|
| **Capability** | Messenger bridge (Telegram / WhatsApp / Slack / Discord / Matrix) |
| **Package** | `pi-messenger-bridge` ([tintinweb/pi-messenger-bridge](https://github.com/tintinweb/pi-messenger-bridge)) |
| **License** | MIT |
| **Install / load** | `npm install "github:ryaneggz/pi-messenger-bridge#81d8ed92b88cb9dfc71db0a9db084d1169fec36d"` into gitignored `.pi/bridge/` (TEMPORARY exact-commit fork pin from [ryaneggz/pi-messenger-bridge#2](https://github.com/ryaneggz/pi-messenger-bridge/pull/2), carrying thread replies, admin handlers, and authenticated supervised compact control; `prepare` builds `dist/`); loaded via `--extension` only in `client-slack-pi`, with local `.pi/bridge-recovery/` second for Codex retry, under `.devcontainer/client-slack-supervise.sh` using an isolated continued session and private one-shot IPC |
| **Vendored** | No — npm package dependency, not a port |

## Relationship Model

The Slack (and other transport) capability is now provided by the community
npm package **pi-messenger-bridge**. This is a **package dependency**, not a
vendored or hand-ported in-tree extension:

- The package is installed via npm into a gitignored `.pi/bridge/` directory and loaded only in the dedicated `client-slack-pi` tmux session. It owns authorization, settled-turn cross-chat/thread correlation, exact compact-request correlation, originating-thread acknowledgement, overlap serialization, current-event-context `ctx.compact`, generation guards, confirmed Slack disconnect with retry, and one-shot completion notification. The harness neither patches `node_modules` nor carries a duplicate compact extension.
- `.devcontainer/client-slack-supervise.sh` owns process/session continuity: mode-700 isolated session storage with explicit `--continue`, watcher-before-launch private unlinked pipe IPC, an isolated exact process group with bounded TERM-to-KILL restart, and lifecycle cleanup. `.pi/bridge-recovery/` remains the sole local co-extension for Codex `previous_response_not_found` retry.
- The pin in `.oh/scripts/gateway.sh`'s `FORK_PIN` **is** the review/bump artifact. It points at exact tested commit `github:ryaneggz/pi-messenger-bridge#81d8ed92b88cb9dfc71db0a9db084d1169fec36d` from [ryaneggz/pi-messenger-bridge#2](https://github.com/ryaneggz/pi-messenger-bridge/pull/2); once upstream publishes a release containing these changes, re-pin to `pi-messenger-bridge@<release>`.
- Track the package by exact version/commit pin only. Do **not** vendor package source or patch `node_modules`.

This model keeps the integration thin: upstream maintains the multi-transport
bridge, the harness just pins which release it runs.

### Historical note

The harness previously shipped a **hand-built in-tree Slack extension** at
`.pi/extensions/slack/` (ported lineage from `earendil-works/pi-mono`, carried
as a one-way reviewed port). It was **removed in #481** in favor of the
maintained `pi-messenger-bridge` package after recurring reliability problems:
idle-death (the bridge process exiting at idle) and Codex
`previous_response_not_found` turn failures. The old port's sibling-dependency
table and customization log retired with it.

## Review Cadence

**Owner**: `@ryaneggz`
**Schedule**: Quarterly (check for a newer `pi-messenger-bridge` release)
**Last reviewed**: 2026-08-11

On each review:
1. Check whether `tintinweb/pi-messenger-bridge` has published a newer release.
2. If so (or once fork PR #2 is released upstream), update `.oh/scripts/gateway.sh`'s `FORK_PIN` from the exact fork commit to `pi-messenger-bridge@<release>` and validate.
3. Verify Slack thread/admin behavior plus acknowledgement-first compact, private IPC restart, and continued-session recovery after the bump.
