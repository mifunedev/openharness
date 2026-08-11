# Upstream Tracking

## Provenance

| Property | Value |
|----------|-------|
| **Capability** | Messenger bridge (Telegram / WhatsApp / Slack / Discord / Matrix) |
| **Package** | `pi-messenger-bridge` ([tintinweb/pi-messenger-bridge](https://github.com/tintinweb/pi-messenger-bridge)) |
| **License** | MIT |
| **Install / load** | `npm install "github:ryaneggz/pi-messenger-bridge#c8b96e9d0fb69611c4e67ae298d1d10d83792a26"` into gitignored `.pi/bridge/` (TEMPORARY exact-commit fork pin carrying the unreleased Slack thread-reply patch plus Slack admin slash-command handlers; the fork's `prepare` script builds `dist/` on install); loaded via `--extension` only in the `client-slack-pi` tmux session, interactive on the pane TTY (no `--mode rpc`), under `.devcontainer/client-slack-supervise.sh`; local `.pi/bridge-recovery/` and `.pi/slack-compact/` co-extensions load second/third for Codex retry and Slack-requested compaction recovery |
| **Vendored** | No — npm package dependency, not a port |

## Relationship Model

The Slack (and other transport) capability is now provided by the community
npm package **pi-messenger-bridge**. This is a **package dependency**, not a
vendored or hand-ported in-tree extension:

- The package is installed via npm into a gitignored `.pi/bridge/` directory and loaded via `--extension` only in the dedicated `client-slack-pi` tmux session, wrapped by `.devcontainer/client-slack-supervise.sh` for stale-ctx, crash, and successful-compaction reconnects. Pi runs interactive on the pane TTY (no `--mode rpc`). Two sibling in-tree extensions — `.pi/bridge-recovery/` second for Codex `previous_response_not_found` retry-recovery and `.pi/slack-compact/` third for exact authorized Slack compaction requests — are local Open Harness co-extensions, **not** package patches. Both stay outside `.pi/extensions/` auto-discovery and are absent from `.pi/settings.json`, so every non-gateway Pi session is unaffected. Exact order lets the package's earlier `turn_end` deliver the acknowledgement before Slack compaction begins.
- The pin in `.oh/scripts/gateway.sh`'s `FORK_PIN` **is** the review/bump artifact. It currently points at exact merged commit `github:ryaneggz/pi-messenger-bridge#c8b96e9d0fb69611c4e67ae298d1d10d83792a26` (Slack thread-reply patch plus admin slash-command handlers from [ryaneggz/pi-messenger-bridge#1](https://github.com/ryaneggz/pi-messenger-bridge/pull/1)); once upstream publishes a release, re-pin it to `pi-messenger-bridge@<release>`.
- Package source lives upstream at `tintinweb/pi-messenger-bridge`; the harness consumes it as published and never edits `node_modules`. Gateway-specific recovery behavior belongs in the two tracked local co-extensions instead.
- Track the package by version pin only. The one current exception is the **temporary fork pin** above, authorized to ship the Slack thread-reply fix and admin slash-command handlers ahead of an upstream release; it reverts to a published `pi-messenger-bridge@<release>` as soon as the upstream PR lands. Do **not** vendor the package source into the tree.

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
**Last reviewed**: 2026-06-21

On each review:
1. Check whether `tintinweb/pi-messenger-bridge` has published a newer release.
2. If so (or once the thread-reply PR is released), update `.oh/scripts/gateway.sh`'s `FORK_PIN` from the fork commit to `pi-messenger-bridge@<release>` and validate.
3. Verify the Slack transport still loads and bridges turns after the bump.
