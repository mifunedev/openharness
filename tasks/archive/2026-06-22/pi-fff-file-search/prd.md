# PRD — Add fff file-search support to the Pi harness

> v1.1 — revised after 2-critic review (`critique.md`). Resolves 3 H findings at
> the AC level and upgrades Wiki Alignment to REQUIRED.

## Introduction

[`fff`](https://github.com/dmtrKovalenko/fff) is a fast, typo-resistant file-search
toolkit for AI agents (the same engine that powers file search in opencode and
nushell). For the Pi harness, fff ships as the **`@ff-labs/pi-fff` Pi extension**,
which adds `ffgrep` (content search) and `fffind` (path search) tools and feeds Pi's
interactive `@`-mention autocomplete from a frecency-ranked index. The extension is
backed by the native `@ff-labs/fff-node` binding, which pulls prebuilt binaries for
linux (gnu + musl), darwin, and win32 via `optionalDependencies` — so no Rust
toolchain or separate binary install is needed in the sandbox. (Verified at
authoring time: `@ff-labs/fff-node@0.9.5` installs and loads on the sandbox's
glibc-2.36 x64 host via `@ff-labs/fff-bin-linux-x64-gnu`.)

Open Harness already loads project-local Pi packages by pinning them in
`.pi/settings.json` `packages[]` (e.g. `pi-autoresearch`, `pi-dynamic-workflows`).
This task adds `@ff-labs/pi-fff` to that list using the exact same mechanism, keeps
the pinned-packages test green, nudges the agent to prefer fff for file search, and
documents the integration following the established `docs/integrations/` pattern.

## Goals

1. Pin `npm:@ff-labs/pi-fff@0.9.5` in `.pi/settings.json` `packages[]` so the
   sandbox Pi installs it on startup (same path as the other pinned Pi packages).
2. Keep `.pi/extensions/__tests__/settings.test.ts` green by updating its pinned
   array to include the new entry in the exact committed order.
3. Add a short, conditional prompt hint to `.pi/APPEND_SYSTEM.md` so the Pi agent
   prefers fff tools (`ffgrep`/`fffind`) for file search and grep **when available**.
4. Document the integration in `docs/integrations/pi-fff.md`, mirroring
   `pi-autoresearch.md`: what it adds, modes, verify steps, disable path, troubleshooting.
5. Add a small agent-readable `wiki/pi-fff.md` entry (per `context/rules/wiki.md`).
6. Record the change in `CHANGELOG.md` under `## [Unreleased]`.

## Non-Goals

- **No MCP-server / Rust `fff-mcp` binary route.** This task uses the Pi extension
  only; it does not install the standalone fff MCP server or the homebrew formula.
- **No other-harness wiring.** Claude/Codex MCP configs are out of scope; Pi-only.
- **No `override` MODE.** Keep the extension's default `tools-and-ui` mode; do not
  set `PI_FFF_MODE=override`, which *replaces* Pi's native `grep`/`find`/`multi_grep`
  tools. The US-002 prompt hint is a **soft, conditional preference** that *keeps*
  the native tools available — it does not remove or replace any built-in tool, so it
  is distinct from `override` MODE (this distinction resolves the Critic-B H finding).
- **No sandbox application code.** This is harness-infra config + docs/wiki only.
- **No other pin changes.** Existing pinned package versions stay byte-identical.

## User Stories

### US-001 — Pin the pi-fff package and keep the settings test green
**As** the Pi harness, **I want** `@ff-labs/pi-fff@0.9.5` pinned in
`.pi/settings.json`, **so that** the sandbox installs fff's file-search tools on
startup.

**Acceptance criteria**
- `.pi/settings.json` `packages[]` contains `"npm:@ff-labs/pi-fff@0.9.5"` (exact,
  version-pinned; `0.9.5` confirmed to still be the `latest` dist-tag at impl time
  via `npm view @ff-labs/pi-fff dist-tags.latest`).
- The entry is inserted **as the last `npm:` pin — immediately after
  `npm:pi-autoresearch@1.6.0` and before the trailing `git:...pi-dynamic-workflows`
  pin** — so npm pins stay grouped and the `git:` pin stays last.
- `.pi/extensions/__tests__/settings.test.ts` `expect(settings.packages).toEqual([...])`
  is updated to the new exact array (same order as the committed JSON).
- `npx vitest run .pi/extensions/__tests__/settings.test.ts` passes.
- No other entry in `packages[]` is reordered or version-bumped (`git diff
  .pi/settings.json` shows exactly one added line).
- **Transitive-dep note (Critic-A H mitigation)**: `@ff-labs/pi-fff` depends on
  `@ff-labs/fff-node: "*"`; like every other pinned Pi package, its transitive deps
  are not frozen by the top-level pin. The resolved `@ff-labs/fff-node` version
  (`0.9.5` at impl time) and the resolution date are recorded in the doc (US-003) so
  the pin is reproducible/auditable.

### US-002 — Hint the Pi agent to prefer fff for file search
**As** an operator, **I want** the Pi agent to reach for fff tools, **so that**
file search is faster and more token-efficient (per upstream's published benchmarks)
than the built-in grep/find.

**Acceptance criteria**
- `.pi/APPEND_SYSTEM.md` gains **exactly one short section (≤ 6 lines)** telling the
  agent to prefer `ffgrep`/`fffind` for file search/grep **when those tools are
  available**, so the guidance is harmless (a no-op) if the extension fails to load.
- The hint does **not** instruct the agent to disable, remove, or override native
  tools — it expresses a preference order only.
- Existing `.pi/APPEND_SYSTEM.md` sections (Project context, Slack Bridge Awareness)
  are preserved verbatim.
- Runtime guard satisfied: the extension is confirmed loadable in Pi before the hint
  is trusted (see Verification Plan runtime step), so the hint does not misdirect the
  agent to non-existent tools.

### US-003 — Document the integration and record the change
**As** a maintainer, **I want** a docs page and a changelog entry, **so that** the
integration is discoverable and follows the existing Pi-package documentation pattern.

**Acceptance criteria**
- `docs/integrations/pi-fff.md` exists with Docusaurus frontmatter including an
  explicit `sidebar_position: 4` (autoresearch is 3), mirroring `pi-autoresearch.md`:
  intro + pin snippet, "What it adds" (tools, the three `/fff-mode`s, commands), a
  verify section (`jq '.packages[]' .pi/settings.json | grep pi-fff`,
  `npm view @ff-labs/pi-fff@0.9.5 'pi' 'version'`, and the `pi -e` runtime check).
- The doc states the native binding (`@ff-labs/fff-node`) ships prebuilt binaries
  (no Rust toolchain needed) **and records the resolved fff-node version + the
  resolution date** (Critic-A H/M mitigation).
- The doc includes a **Disable / Remove** section (Critic-B M): remove the pin from
  `packages[]`, revert the settings test, revert the `.pi/APPEND_SYSTEM.md` hint; or
  switch modes at runtime with `/fff-mode`.
- The doc's troubleshooting table includes rows for: **(a)** fff tools not registered
  / native-binding install failed (network-restricted boot or libc mismatch), and
  **(b)** `@`-mention autocomplete empty on first launch (frecency index warms over
  use; `/fff-rescan` forces a scan).
- `CHANGELOG.md` gains one bullet under `## [Unreleased]` describing the fff pin,
  following the existing convention (ends with the `([#NNN](.../issues/NNN))` issue
  reference, using this task's tracking issue).
- `pnpm run lint` and the root vitest suite pass (pre-commit gate).

### US-004 — Add an agent-readable wiki entry
**As** a future agent, **I want** `wiki/pi-fff.md`, **so that** the always-on fff
behavior and the prompt-hint preference are loadable into agent context via
`/wiki-query` (docs/ is human-only; the hint changes agent default behavior).

**Acceptance criteria**
- `wiki/raw/2026-06-19-pi-fff.md` immutable snapshot of the upstream README's Pi
  section captured as the provenance source.
- `wiki/pi-fff.md` follows `context/rules/wiki.md` schema: frontmatter
  (`title`, `slug: pi-fff`, `tags`, `created`/`updated: 2026-06-19`, `sources:` →
  the raw snapshot, `confidence: provisional`), `## Summary`, `## Detail` (the
  always-on tools + autocomplete + prompt-hint behavior, with `.pi/settings.json`
  and `.pi/APPEND_SYSTEM.md` source cites), `## See Also`. ≤ 600 words.
- `wiki/README.md` index is refreshed; `bash evals/probes/wiki-readme-index.sh` passes.

## Wiki Alignment

- **Impact**: REQUIRED
- **Local entries**: `wiki/pi-fff.md` (create) + `wiki/raw/2026-06-19-pi-fff.md` snapshot.
- **Spec alignment**: the wiki entry must state that fff is **always-on** (loads
  `ffgrep`/`fffind` and modifies `@`-mention autocomplete every Pi session) and that
  `.pi/APPEND_SYSTEM.md` adds a soft preference for fff tools — the agent-facing
  behavior this PRD introduces. Two critics independently flagged that, unlike the
  operator-invoked `pi-autoresearch`/`pi-dynamic-workflows` precedents, fff changes
  default agent behavior and is therefore agent-knowledge (wiki), not just human docs.
- **DeepWiki comparison**: No relevant `deepwiki.com/mifunedev/openharness` page —
  fff is an external third-party tool, not an internal subsystem; DeepWiki indexes
  the harness's own architecture, which this change does not alter. (Recorded per
  Stage 2.5; no source-file/terminology gap against an internal page because none exists.)

## Verification Plan

1. `git diff .pi/settings.json` shows exactly one added line (the pin), nothing reordered.
2. `npx vitest run .pi/extensions/__tests__/settings.test.ts` passes.
3. `jq '.packages[]' .pi/settings.json | grep '@ff-labs/pi-fff@0.9.5'` returns the pin.
4. `npm view @ff-labs/pi-fff dist-tags.latest` equals `0.9.5` (pin matches latest).
5. **Runtime (Critic-A/B H mitigation)**: `@ff-labs/fff-node@0.9.5` installs and
   loads on the sandbox host (verified at authoring: `libfff_c.so` present, ESM
   import exposes `FileFinder`/`findBinary`). Optionally `pi -e npm:@ff-labs/pi-fff@0.9.5`
   in a trusted session registers `ffgrep`/`fffind`.
6. `bash evals/probes/wiki-readme-index.sh` passes (US-004 index freshness).
7. `pnpm run lint && pnpm run test` (pre-commit) passes.
8. Docs build is unaffected (Markdown-only additions under `docs/` and `wiki/`).

## Critique resolution

2-critic review (`critique.md`) found 3 H + 7 M. All H findings are mitigated at the
AC level (no destructive ops, no protected-path violations, no GitHub state existed):
1. **fff-node wildcard transitive dep** → recorded resolved version + date in the
   doc; consistent with the existing convention for all 8 pinned Pi packages.
2. **No runtime verification** → native binding empirically loaded on the sandbox;
   hint carries a "when available" guard so it is harmless if the extension fails.
3. **Non-Goal contradiction** → Non-Goal reworded to scope to the runtime `override`
   MODE (tool *replacement*), distinct from the soft conditional preference hint.
Medium findings folded in: wiki entry (US-004), autocomplete + native-binding
troubleshooting rows, Disable section, hint size cap, sidebar_position, dist-tag check.
