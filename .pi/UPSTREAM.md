# Upstream Tracking

## Provenance

| Property | Value |
|----------|-------|
| **Capability** | Messenger bridge (Telegram / WhatsApp / Slack / Discord / Matrix) |
| **Package** | `pi-messenger-bridge` ([tintinweb/pi-messenger-bridge](https://github.com/tintinweb/pi-messenger-bridge)) |
| **License** | MIT |
| **Install / load** | `npm install pi-messenger-bridge@0.4.0` into gitignored `.pi/bridge/`; loaded via `--extension` only in the `client-slack` tmux session (`.devcontainer/entrypoint.sh`) |
| **Vendored** | No — npm package dependency, not a port |

## Relationship Model

The Slack (and other transport) capability is now provided by the community
npm package **pi-messenger-bridge**. This is a **package dependency**, not a
vendored or hand-ported in-tree extension:

- The package is installed via npm into a gitignored `.pi/bridge/` directory and loaded via `--extension` only in the dedicated `client-slack` tmux session (`.devcontainer/entrypoint.sh`). It is **not** pinned in `.pi/settings.json` `packages[]`, so other Pi sessions do not load it — only the `client-slack` bridge session holds the Slack Socket-Mode connection.
- The version in `.devcontainer/entrypoint.sh`'s `npm install pi-messenger-bridge@0.4.0` line **is** the review/bump artifact — to update, bump the version in that install line.
- Source lives upstream at `tintinweb/pi-messenger-bridge`; the harness consumes it as published, never edits it locally.
- **NEVER** vendor or fork the package into the tree; track it by version pin only.

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
**Last reviewed**: 2026-06-20

On each review:
1. Check whether `tintinweb/pi-messenger-bridge` has published a newer release.
2. If so, bump the `pi-messenger-bridge@<version>` version in `.devcontainer/entrypoint.sh`'s `npm install` line and validate.
3. Verify the Slack transport still loads and bridges turns after the bump.
