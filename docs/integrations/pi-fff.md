---
sidebar_position: 4
title: Pi fff (file search)
---

# Pi fff (file search)

Open Harness loads [`@ff-labs/pi-fff`](https://github.com/dmtrKovalenko/fff) as a
project-local Pi package from `.pi/settings.json`:

```json
"npm:@ff-labs/pi-fff@0.9.5"
```

Pi installs missing project packages automatically on startup after the project is
trusted. Open Harness uses this package path — the same one used for
`pi-autoresearch` and `pi-dynamic-workflows` — instead of vendoring upstream source
into `.pi/extensions/`, so the integration stays small, pinned, and easy to update.

[`fff`](https://github.com/dmtrKovalenko/fff) is a fast, typo-resistant file-search
toolkit for AI agents (the same engine that powers file search in opencode and
nushell). The Pi extension is backed by the native `@ff-labs/fff-node` binding,
which ships **prebuilt binaries** for linux (gnu + musl), darwin, and win32 via
`optionalDependencies` — **no Rust toolchain or separate binary install is needed**
in the sandbox.

:::note Pinned versions
`@ff-labs/pi-fff@0.9.5` was the `latest` dist-tag when this integration landed
(2026-06-19). The top-level pin does not freeze the native binding: `pi-fff` declares
`@ff-labs/fff-node: "*"`, which resolved to `@ff-labs/fff-node@0.9.5` on 2026-06-19
and was verified to load on the sandbox's glibc-2.36 x64 host
(`@ff-labs/fff-bin-linux-x64-gnu`, `libfff_c.so`). This is the same
transitive-dependency behavior as every other pinned Pi package.
:::

## What it adds

The package registers two agent-facing tools and replaces Pi's `@`-mention
autocomplete with a frecency-ranked picker:

- **`ffgrep`** — content search. Accepts `path`, `exclude`, `caseSensitive`,
  `context`, and cursor pagination. Auto-detects regex, falls back to fuzzy on zero
  exact matches, and rejects `.*`-style wildcard-only patterns up front.
- **`fffind`** — path and filename search across the whole repo-relative path (not
  just the filename), frecency-aware so files you actually open rank higher next time.

A short hint in `.pi/APPEND_SYSTEM.md`
tells the agent to **prefer** these tools for file search **when they are available**.
It is a preference only — the native `grep`/`find` tools stay available as the
fallback when the extension is not loaded.

### Modes

Three operating modes, switchable at runtime with `/fff-mode`:

| Mode | What it does |
| --- | --- |
| `tools-and-ui` (default) | Adds `ffgrep`/`fffind` and replaces `@`-mention autocomplete with FFF. |
| `tools-only` | Tool injection only; keeps Pi's native editor autocomplete. |
| `override` | Replaces Pi's built-in `grep`, `find`, and `multi_grep` with FFF. |

Open Harness keeps the **default `tools-and-ui` mode** — it does not set
`PI_FFF_MODE=override`, so the native tools are never removed. Env vars:
`PI_FFF_MODE`, `FFF_FRECENCY_DB`, `FFF_HISTORY_DB`. Flags: `--fff-mode`,
`--fff-frecency-db`, `--fff-history-db`.

### Commands

- `/fff-mode [tools-and-ui | tools-only | override]` — show or switch the mode.
- `/fff-health` — picker, frecency, and git-integration status.
- `/fff-rescan` — force a rescan of the file index.

## Disable / Remove

fff is always-on once pinned (it loads tools and modifies autocomplete on every Pi
session). To back it out:

1. Remove `"npm:@ff-labs/pi-fff@0.9.5"` from `packages[]` in `.pi/settings.json`.
2. Revert the matching entry in `.pi/extensions/__tests__/settings.test.ts` (the
   `toEqual` array is order-sensitive and pins the exact list).
3. Remove the `## File search` section from `.pi/APPEND_SYSTEM.md`.

To keep the package but stop FFF from changing autocomplete or replacing tools at
runtime, use `/fff-mode tools-only` (or `tools-and-ui` for the default).

## Verify installation

Check the project package pin:

```bash
jq '.packages[]' .pi/settings.json | grep '@ff-labs/pi-fff@0.9.5'
```

Check package metadata without starting Pi:

```bash
npm view @ff-labs/pi-fff@0.9.5 'pi' 'version'
```

Confirm the native binding resolves on this host (prebuilt binary, no build):

```bash
npm view @ff-labs/pi-fff dist-tags.latest        # expect 0.9.5
```

To try the package in a trusted Pi session without committing it to settings:

```bash
pi -e npm:@ff-labs/pi-fff@0.9.5
```

Then confirm `ffgrep`/`fffind` appear in Pi's tool list.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `ffgrep`/`fffind` not in the tool list | Extension failed to register: native binding install failed (network-restricted boot, or a libc variant mismatch — gnu vs. musl) | Re-run `pi -e npm:@ff-labs/pi-fff@0.9.5` in a trusted session and read startup output; confirm a `@ff-labs/fff-bin-linux-*` package resolved. The `.pi/APPEND_SYSTEM.md` hint is guarded with "when available", so a failed load is a no-op for the agent. |
| `@`-mention autocomplete is empty on first launch | The frecency index is cold on a fresh sandbox; it warms from git touch history and from files you open | Run `/fff-rescan` to force a scan, or just keep working — the index populates after the first file interactions. Use `/fff-health` to inspect picker/frecency/git status. |
| Package not listed | Project not trusted, or packages not reconciled yet | Run `pi list --approve`, or restart Pi from the trusted project root. |
| Want native grep/find back | FFF is in `override` mode | `/fff-mode tools-and-ui` (default) or `tools-only` — both keep native tools available. |
