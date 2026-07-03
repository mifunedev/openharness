# Upstream Tracking

## Provenance

| Property | Value |
|----------|-------|
| **Capability** | Messenger bridge (Telegram / WhatsApp / Slack / Discord / Matrix) |
| **Package** | `pi-messenger-bridge` ([tintinweb/pi-messenger-bridge](https://github.com/tintinweb/pi-messenger-bridge)) |
| **License** | MIT |
| **Install / load** | `npm install "github:ryaneggz/pi-messenger-bridge#feat/slack-thread-replies"` into gitignored `.pi/bridge/` (TEMPORARY fork pin carrying the unreleased Slack thread-reply patch; the fork's `prepare` script builds `dist/` on install); loaded via `--extension` only in the `client-slack` tmux session (`.devcontainer/entrypoint.sh`), interactive on the pane TTY (no `--mode rpc`), under the self-healing supervisor `.devcontainer/client-slack-supervise.sh` (restart-on-stale-ctx); a sibling in-tree `.pi/bridge-recovery/` extension is co-loaded for Codex retry-recovery |
| **Vendored** | No — npm package dependency, not a port |

## Relationship Model

The Slack (and other transport) capability is now provided by the community
npm package **pi-messenger-bridge**. This is a **package dependency**, not a
vendored or hand-ported in-tree extension:

- The package is installed via npm into a gitignored `.pi/bridge/` directory and loaded via `--extension` only in the dedicated `client-slack` tmux session (`.devcontainer/entrypoint.sh`), wrapped by the self-healing supervisor `.devcontainer/client-slack-supervise.sh` that restarts pi on the stale-ctx error and on crashes. pi runs interactive on the pane TTY (no `--mode rpc`), and a sibling in-tree `.pi/bridge-recovery/` extension — NOT part of the npm package — is co-loaded as a second `--extension` for Codex `previous_response_not_found` retry-recovery. It is **not** pinned in `.pi/settings.json` `packages[]`, so other Pi sessions do not load it — only the `client-slack` bridge session holds the Slack Socket-Mode connection.
- The pin in `.devcontainer/entrypoint.sh`'s `npm install` line **is** the review/bump artifact. It currently points at the fork branch `github:ryaneggz/pi-messenger-bridge#feat/slack-thread-replies` (Slack thread-reply patch, pending upstream); once the upstream PR merges and publishes a release, re-pin it to `pi-messenger-bridge@<release>`.
- Source lives upstream at `tintinweb/pi-messenger-bridge`; the harness consumes it as published, never edits it locally.
- Track the package by version pin only. The one current exception is the **temporary fork pin** above, authorized to ship the Slack thread-reply fix ahead of an upstream release; it reverts to a published `pi-messenger-bridge@<release>` as soon as the upstream PR lands. Do **not** vendor the package source into the tree, and do not fork it for any other reason.

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
2. If so (or once the thread-reply PR is released), re-pin `.devcontainer/entrypoint.sh`'s `npm install` line from the fork branch to `pi-messenger-bridge@<release>` and validate.
3. Verify the Slack transport still loads and bridges turns after the bump.
