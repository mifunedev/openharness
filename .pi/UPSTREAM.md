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

---

## Provenance — pi-yaml-hooks

| Property | Value |
|----------|-------|
| **Capability** | Event-driven YAML hooks for pi (`tool.before.*`/`tool.after.*`/`file.changed`/`session.*` → `bash`/`tool`/`notify`/`confirm`/`setStatus`) |
| **Package** | `pi-yaml-hooks` ([KristjanPikhof/Pi-YAML-Hooks](https://github.com/KristjanPikhof/Pi-YAML-Hooks)) |
| **License** | MIT |
| **Install / load** | Pinned in `.pi/settings.json` `packages[]` as `npm:pi-yaml-hooks@2026.6.14` (loads the engine in every pi session). Project hook config lives at `.pi/hook/hooks.yaml` and is **inert until trusted** via `/hooks-trust` or `PI_YAML_HOOKS_TRUST_PROJECT=1` — the harness does not auto-trust globally. See `.pi/hook/README.md`. |
| **Vendored** | Engine: No — npm package pin. Examples: the small `pre-tool-developer-guards` pack is vendored under `.pi/hook/examples/` as reference-only (intentionally superseded by `.pi/extensions/path-guard.ts`); the repo-only `atomic-commit-snapshot-worker` pack is deliberately not vendored. |

### Relationship Model

The YAML-hooks capability is consumed as a **thin npm package pin** (same model
as `pi-autoresearch`, `pi-subagents`, etc.), not a vendored port. The engine
loads in every pi session, but the harness's project hook config (`.pi/hook/hooks.yaml`)
is a conservative, observe-only demonstration that stays inert until an operator
trusts the project. Blocking/guarding is intentionally left to the existing
TypeScript extension `.pi/extensions/path-guard.ts` — the YAML layer does not
duplicate it.

### Review Cadence

**Owner**: `@ryaneggz`
**Schedule**: Quarterly (check for a newer `pi-yaml-hooks` release)
**Last reviewed**: 2026-07-05

On each review:
1. Check whether `KristjanPikhof/Pi-YAML-Hooks` has published a newer release (`npm view pi-yaml-hooks version`).
2. If so, re-pin `.pi/settings.json` `packages[]` **and** the matching entry in `.pi/extensions/__tests__/settings.test.ts` (asserted with `toEqual` — keep them in lockstep), then run `node_modules/.bin/vitest run`.
3. Confirm the event/action/condition vocabulary in `.pi/hook/README.md` still matches upstream, and that `.pi/hook/hooks.yaml` still parses/loads under a trusted session.
