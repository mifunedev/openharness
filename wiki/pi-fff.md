---
title: "pi-fff (fff file search)"
slug: pi-fff
tags: [pi, fff, file-search, ffgrep, fffind, frecency, integration, open-harness]
created: 2026-06-19
updated: 2026-06-19
sources:
  - raw/2026-06-19-pi-fff.md
related: [pi-loop, pi-tasks, pi-recap, opencode]
confidence: provisional
---

# pi-fff (fff file search)

## Relevant Source Files
- `.pi/settings.json` — `packages[]` pins `npm:@ff-labs/pi-fff@0.9.5` (last npm entry, before the `git:` pin); Pi installs it on startup once the project is trusted.
- `.pi/extensions/__tests__/settings.test.ts` — `toEqual` on `packages[]` pins the exact list (order-sensitive); any pin add/reorder must update it in lockstep.
- `.pi/APPEND_SYSTEM.md` — `## File search` section adds the soft, conditional "prefer fff when available" hint appended to the Pi system prompt.
- `docs/integrations/pi-fff.md` — human-facing integration doc (modes, verify, disable, troubleshooting).

## Summary
`pi-fff` is the [`@ff-labs/pi-fff`](https://github.com/dmtrKovalenko/fff) Pi extension, pinned as a default project-local Pi package the same way as [[pi-loop]], [[pi-tasks]], and [[pi-recap]]. It gives the Pi agent `ffgrep` (content search) and `fffind` (path search) — fast, typo-resistant, frecency-ranked file search backed by the native `@ff-labs/fff-node` binding (the same engine that powers file search in [[opencode]]). Unlike the operator-invoked Pi packages, fff is **always-on**: it loads its tools and replaces `@`-mention autocomplete on every Pi session, and the system-prompt hint changes the agent's default file-search behavior — which is why this knowledge lives in the wiki (agent-readable), not only in docs.

## Detail
The pin (`.pi/settings.json` `packages[]`) is the entire enabling mechanism: Pi auto-installs missing project packages on startup. `@ff-labs/pi-fff@0.9.5` (the `latest` dist-tag at landing) declares `@ff-labs/fff-node: "*"`, which resolved to `0.9.5` on 2026-06-19. The native binding ships **prebuilt binaries** via `optionalDependencies` for linux (gnu + musl), darwin, and win32 — so no Rust toolchain is needed. Verified on the sandbox host (Debian glibc 2.36, x64): `@ff-labs/fff-bin-linux-x64-gnu` resolves, `libfff_c.so` (~5.5 MB) loads, and `import('@ff-labs/fff-node')` exposes `FileFinder`/`findBinary`. Like every pinned Pi package, the top-level pin does **not** freeze the transitive native binding.

The extension has three `/fff-mode` modes: `tools-and-ui` (default — adds tools + replaces autocomplete), `tools-only` (tools only, native autocomplete kept), and `override` (replaces Pi's native `grep`/`find`/`multi_grep`). Open Harness keeps the **default `tools-and-ui` mode** and does **not** set `PI_FFF_MODE=override`. The `.pi/APPEND_SYSTEM.md` hint is therefore a *soft preference* — it suggests reaching for `ffgrep`/`fffind` **when available** while leaving the native tools as the fallback. This distinction matters: a soft hint never removes a tool, whereas `override` mode does. The "when available" guard makes the hint a no-op if the native binding ever fails to load (network-restricted boot, or a gnu/musl libc mismatch), so it can never misdirect the agent toward tools that are absent.

Cold-start behavior: the frecency index is empty on a fresh sandbox and warms from git touch history and from files the agent opens; `/fff-rescan` forces a scan and `/fff-health` reports picker/frecency/git status. To back the integration out, remove the pin from `.pi/settings.json`, revert the settings test, and drop the `## File search` section from `.pi/APPEND_SYSTEM.md` (see the doc's Disable/Remove section).

No DeepWiki counterpart exists — fff is an external third-party tool, not an internal harness subsystem.

## See Also
- [[pi-loop]]
- [[pi-tasks]]
- [[pi-recap]]
- [[opencode]]
