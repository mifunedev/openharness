# pi-yaml-hooks — harness config

Event-driven **YAML hooks** for the pi coding agent. The engine is the
[`pi-yaml-hooks`](https://github.com/KristjanPikhof/Pi-YAML-Hooks) npm package,
pinned in [`.pi/settings.json`](../settings.json) `packages[]` as
`npm:pi-yaml-hooks@2026.6.14`. This directory holds the harness's project-scoped
hook config plus vendored upstream examples.

Upstream tracking (package, license, review cadence) lives in
[`.pi/UPSTREAM.md`](../UPSTREAM.md).

## What loads

| File | Status |
|---|---|
| [`hooks.yaml`](./hooks.yaml) | **Active** (when trusted) — observe-only demonstration hook |
| [`post-tool-log.mjs`](./post-tool-log.mjs) | Helper for the active hook (NDJSON audit logger) |
| [`examples/pre-tool-developer-guards/`](./examples/pre-tool-developer-guards/) | **Reference only** — intentionally NOT wired (see below) |

Audit output is written to `.pi-hook-logs/tool-events.ndjson` at the repo root,
which is **git-ignored** — logs are never committed.

## Trust gate (required)

Project hooks do **nothing** until the repo is explicitly trusted. This is a
deliberate security boundary; the harness does **not** auto-trust globally.
Enable per operator decision:

```bash
/hooks-trust                    # interactive, inside a pi session
# or, per session:
PI_YAML_HOOKS_TRUST_PROJECT=1 pi
```

Until then, `hooks.yaml` is inert even though the engine is installed.

## The active hook (`hooks.yaml`)

A conservative, **non-blocking** demonstration that YAML hooks work in the
harness. It only:

- **Logs** an NDJSON audit line on `tool.after.write`/`tool.after.edit` under
  harness source areas (`.oh/**`, `.pi/**`, `.devcontainer/**`, `workspace/**`).
- **Annotates** the pi status bar (`setStatus`) when dependency metadata
  (`package.json`, lockfiles) changes.

It intentionally does **not** block tools or inject follow-up prompts:

- Pre-tool guarding (risky bash, protected-path writes) is already owned by the
  TypeScript extension [`.pi/extensions/path-guard.ts`](../extensions/path-guard.ts).
  A YAML pre-tool guard would double up and produce conflicting confirmations.
- Prompt injection (`tool:` follow-ups) would interfere with unattended
  autopilot/cron pi sessions.

## Schema reference

Config lives in `<project>/.pi/hook/hooks.yaml` (this file) or
`<project>/.pi/hooks.yaml`; global hooks load from `~/.pi/agent/hook/hooks.yaml`.

- **Events**: `tool.before.*`, `tool.after.*` (e.g. `tool.after.write`),
  `file.changed`, `session.created`, `session.idle`, `session.deleted`.
- **Actions**: `bash` (run a shell command; exit `2` blocks a `tool.before.*`
  call), `tool` (inject a follow-up prompt), `notify` (UI notification),
  `confirm` (confirmation dialog), `setStatus` (status-bar entry).
  `command:` actions are **rejected by pi at load time** — always use `bash:`.
- **Conditions**: `matchesCodeFiles`, `matchesAnyPath`, `matchesAllPaths`.
- Context is injected as env vars (`PI_PROJECT_DIR`, `PI_SESSION_ID`, …) and the
  tool payload is piped to the action on stdin (see `post-tool-log.mjs`).

## Vendored examples (reference only)

### `examples/pre-tool-developer-guards/` — NOT wired

Verbatim upstream pack that blocks risky bash + protected-file writes/edits +
package installs. **Intentionally kept as reference and not activated**: its
behavior is already provided by `.pi/extensions/path-guard.ts`. Kept here to
document the overlap and as a copy-paste starting point for downstream repos.
Its `hooks.yaml` uses upstream repo-relative paths — adjust before any use.

### `atomic-commit-snapshot-worker` — not vendored

The upstream repo also ships a Python "snapshot worker" pack that auto-commits
**every** `file.changed` event into a per-worktree SQLite queue. It is
deliberately **not** included here:

- It is **repo-only** (not in the npm tarball) and cannot be installed via the
  package pin.
- It auto-commits on every file change — destructive and unsuitable for the
  harness's worktree/PR workflow.
- ~3,400 lines of `fcntl`/POSIX-signal Python would be committed dead weight.

If ever needed, clone it from
<https://github.com/KristjanPikhof/Pi-YAML-Hooks/tree/main/examples/atomic-commit-snapshot-worker>
and point a **project-local** `hooks.yaml` at the on-disk path.
