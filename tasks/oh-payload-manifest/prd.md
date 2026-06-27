# PRD — `.oh/` payload manifest (RFC #531 follow-on, value-first step 3)

> Issue: https://github.com/mifunedev/openharness/issues/531
> Stacks on PR #336 (`feat/531-oh-update`) — extends the `runUpdate` overlay it introduced.
> Strategic context: `.claude/specs/openharness-trajectories/proposal.md` §"Recommended path",
> step 3. Tactical seed: `.claude/specs/oh-payload-manifest/spec.md`.

## Problem

PR #336 added `oh update`, which overlays a newer `.oh/` control plane onto an
equipped repo. But it overlays **all** of `.oh/` (minus `node_modules`/`dist`) —
verified by `update.ts`'s `walkFiles(fromOh)` + per-segment volatile skip. That means
`oh update` ships, into **every** equipped repo:

- **`.oh/docs/`** — a full Docusaurus marketing/documentation website (wired into a
  separate docs workflow), irrelevant to a consumer's control plane; and
- **`.oh/patches/`** — a repo-specific dependency patch.

This is the un-mitigated "inward bloat" leak the architecture review surfaced: `.oh/`
is not yet a clean **payload**. `oh update` should overlay a **declared** payload, not
"whatever physically sits in `.oh/`".

## Goal

Make `oh update` overlay a **manifest-declared allowlist** of `.oh/` payload, excluding
`.oh/docs/` and `.oh/patches/` by omission. Add a guard probe so a shipped `.oh/` asset
cannot silently bake in a **non-overridable** upstream-repo literal (the de-hardcode
residual — the override seam already exists in `prompt-miner-caps.sh` and must not regress).

## Design

### 1. The manifest — `.oh/manifest.json`

A lean **allowlist** (`include` globs) plus a small `exclude` denylist, **safe-by-default**:
a newly-added `.oh/foo/` does not silently leak into consumer repos unless listed.

```json
{
  "include": ["cli/**", "scripts/**", "install/**", "templates/**", "README.md", "manifest.json"],
  "exclude": ["**/node_modules/**", "**/dist/**"]
}
```

- **Paths are POSIX, relative to `.oh/`** — exactly the relpath shape `walkFiles` already
  produces (`path.relative(fromOh, abs)`). So `cli/**` matches `.oh/cli/src/cli.ts`. This
  is why the manifest **cannot** reach outside `.oh/`: the overlay root is `<from>/.oh`
  and the path-escape guard refuses any dest outside `<target>/.oh`. **The `.oh/`-only
  safety invariant is preserved unchanged.** Shipping `.mifune/skills` (decision C) would
  require relaxing that guard — **explicitly out of scope here**; deferred to the registry.
- `docs/**` and `patches/**` are **omitted** → not shipped. They stay physically put
  (no `docs.yml` churn); they are simply not in the payload.
- `templates/**` is listed **preemptively**: it does not exist on the #336 base (it ships
  in PR #334), but allow-listing it now means that when #334 merges, `oh init`/`oh update`
  carry it without a silent gap. A glob that matches nothing today is harmless.
- **The manifest itself ships** (`manifest.json` ∈ include) — the source's manifest
  governs and propagates forward, so a consumer's next `oh update` inherits the newer
  payload policy.

### 2. The matcher — `.oh/cli/src/lib/manifest.ts` (pure, zero-dep)

The CLI has no glob dependency (`node:fs` + `node:path` only), so a **tiny purpose-built**
matcher. Precise, documented semantics:

- `**` matches any run of characters **including `/`** (cross-segment).
- A leading `**/` also matches **zero** leading segments — so `**/node_modules/**`
  matches both `cli/node_modules/x` and a top-level `node_modules/x`.
- `*` matches any characters **except `/`** (within a single segment).
- A pattern with no wildcard is an **exact** literal match (`README.md` matches
  `README.md`, never `cli/README.md`).
- Every other regex-special character is escaped.
- A relpath **ships** iff it matches **≥1 `include`** pattern **and 0 `exclude`** patterns
  (exclude wins).

Exported surface (pinned — US-002/US-003 depend on it):

```ts
export interface Manifest { include: string[]; exclude: string[]; }
export function loadManifest(fromOh: string): Manifest | null; // null ⇒ absent/invalid ⇒ back-compat
export function shouldShip(relpath: string, manifest: Manifest): boolean;
export function globToRegExp(glob: string): RegExp;            // exported for direct unit tests
```

### 3. Integration — `.oh/cli/src/commands/update.ts` (extend, do not rewrite)

After the existing preconditions, `const manifest = loadManifest(fromOh)`. In the overlay
loop, **after** the existing per-segment `node_modules`/`dist` volatile skip and **before**
`assertDestInTarget` + copy:

- `manifest === null` → **back-compat**: overlay all (today's behavior) after emitting
  **one** stdout line `oh update: no .oh/manifest.json in source; overlaying all of .oh/ (legacy mode)`.
- `manifest !== null` and `!shouldShip(R, manifest)` → skip with a report line
  `skip <R> (not in payload)` (dry-run-prefixed like every other line) and count it in
  the existing `<s> skipped` summary tally.
- Otherwise unchanged: guard + create/overwrite/copy.

The per-segment volatile skip stays as a backstop. No signature change to `runUpdate`; the
final summary line format is unchanged (skipped count simply includes payload-excluded files).

### 4. Guard probe — shipped assets keep the repo overridable

A second 3-state probe (`oh-shipped-repo-overridable.sh`) locks the de-hardcode residual:
every **shipped** `.oh/` asset that references the upstream repo must keep it **overridable**
(the `${AUTOPILOT_REPO:-…}` default-override form), never a bare non-overridable literal in
an executable position. Today only `.oh/scripts/prompt-miner-caps.sh` references it, already
in the override form; the probe prevents a refactor from regressing that into a baked-in
`--repo mifunedev/openharness`. It is a **static deletion/regression guard**, stated as such
in `# desc:` (the real config-derivation design lives in the autopilot skill + `cron-runtime`).

## Acceptance criteria (rolled up; per-story contracts in `prd.json`)

- `oh update --from <dir>` overlays **only** manifest-declared payload; `.oh/docs/` and
  `.oh/patches/` are **absent** in the target — proven by a vitest fixture.
- Allowlist semantics, exclude-wins, leading-`**/`, exact-literal — all unit-tested directly.
- Missing/invalid manifest → back-compat overlay-all with one warning line (unit-tested).
- The `.oh/`-only path-escape guard is **unchanged**; no write ever lands outside `<target>/.oh/`.
- `.oh/manifest.json` exists and is the production allowlist (docs/patches omitted).
- Two 3-state probes (`oh-payload-manifest`, `oh-shipped-repo-overridable`) PASS; one
  RESULTS row each; full eval suite has no green→red regression.
- `.oh/README.md` documents the payload boundary; CHANGELOG `[Unreleased]` entry with the
  full mifunedev #531 URL.
- `node .oh/cli/build.mjs` bundles clean; `tsc --noEmit` clean; full `vitest run` green.

## Non-goals (explicit — do not let scope creep)

- **No instance extraction** (moving `context/`/`memory/`/`tasks/`/`crons/` to their own
  repo) — that is the gated step 5, a separate later decision.
- **No `oh init` change** — `commands/init.ts` + `.oh/templates/` are PR #334's and do not
  exist on this base. Note the seam in the README; do **not** create or import init files.
- **No cross-tree shipping** — the manifest does not reach `.mifune/skills` (decision C →
  registry later); the `.oh/`-only guard is not relaxed.
- **No `.oh/docs`/`.oh/patches` deletion or `docs.yml` churn** — they stay put, merely
  excluded from the payload by omission.
- **No de-hardcoding of the live `crons/`** — those are instance-layer, not shipped by the
  `oh update` mechanism; the shipped `.oh/` scripts that reference the upstream repo
  (`install.sh`, `maintenance/restart-openharness-tmux.sh`) already use the overridable
  `${VAR:-…}` form. (`prompt-miner-caps.sh` is NOT in `.oh/` — it lives at
  `.mifune/skills/prompt-miner/`, outside the `oh update` payload entirely.)
- **No probe-layer taxonomy** — categorizing existing probes by layer (generic→Scaffolding /
  mifune-specific→Instance), which the proposal's step 3 also mentions, is deferred to the
  instance-extraction step (5).
- **No remote-fetch, no installed-binary bundling, no runtime-path change.**

## Sequencing

Stacks on `feat/531-oh-update` (#336) because it extends that PR's `update.ts`. PR targets
`development`; the body declares the #336 dependency. Rebase onto `development` once #336
merges. The only cross-PR coupling is `update.ts` (owned wholly by #336's branch history +
this slice's single edit).
