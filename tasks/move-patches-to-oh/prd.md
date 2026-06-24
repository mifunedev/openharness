# PRD: Move `patches/` → `.oh/patches/`

## Summary

After #321/#322 grouped harness machinery under `.oh/` and removed the back-compat
symlinks, the root `patches/` folder is the last piece of build machinery still
orphaned at the repo root. Per the `.oh/README.md` function-class rule (`.oh/` =
"OpenHarness's own machinery, grouped as one addressable unit"), the pnpm dependency
patch belongs under `.oh/`. This task relocates `patches/` → `.oh/patches/`, repoints
its single consumer (`package.json` `patchedDependencies`), regenerates the lockfile,
and updates the namespace doc + CHANGELOG. Issue #324.

## Goals

- `patches/gray-matter@4.0.3.patch` lives at `.oh/patches/gray-matter@4.0.3.patch`.
- The pnpm patch resolves and applies from the new path (`pnpm install` clean).
- `.oh/README.md` reflects the new contents; one new CHANGELOG `[Unreleased]` entry.

## Non-Goals

- Moving `context/`, `crons/`, `memory/`, `tasks/`, `evals/` (stay at root — live
  state / operator config / identity tier).
- Editing `crons/heartbeat.md`, `.mifune/skills/wiki/corpus/**`, `.pi/prompts/**`.
- Rewriting CHANGELOG history (one new `[Unreleased]` entry only).

## User Stories

### US-001 — Relocate the patch and repoint its consumer
**Owns:** `patches/` (moved), `.oh/patches/` (created), `package.json`, `pnpm-lock.yaml`
**Work:** `git mv patches .oh/patches`; update `package.json` `patchedDependencies`
key `"gray-matter@4.0.3"` value `patches/...` → `.oh/patches/gray-matter@4.0.3.patch`;
run `pnpm install` to regenerate `pnpm-lock.yaml` so its `path:` entry points at the
new location.
**AC:**
- `.oh/patches/gray-matter@4.0.3.patch` exists; `ls patches` errors.
- `grep -n 'patches/' package.json` shows only `.oh/patches/...`.
- `grep -n 'patches/' pnpm-lock.yaml` shows only `.oh/patches/...`.
- `pnpm install` exits 0 with the patch applied (no "patch not found" / no failed-apply).

### US-002 — Update namespace doc and CHANGELOG
**Owns:** `.oh/README.md`, `CHANGELOG.md`
**Work:** add `patches/` (the vendored pnpm dependency patches) to the `.oh/` contents
listing in `.oh/README.md`; add one `### Changed` entry under `[Unreleased]` in
`CHANGELOG.md` referencing #324/#321 describing the move.
**AC:**
- `.oh/README.md` names `patches/` as part of `.oh/`.
- Exactly one new CHANGELOG `[Unreleased]` entry; no prior history altered.

## Global Acceptance Criteria
1. `ls patches` exits non-zero (gone from root); `.oh/patches/gray-matter@4.0.3.patch` present.
2. `pnpm install` exits 0; patch resolves from `.oh/patches/`.
3. `for p in evals/probes/*.sh; do bash "$p"; echo "$p -> $?"; done` — no new REGRESSION.
4. Forbidden files never staged: `crons/heartbeat.md`, `.mifune/skills/wiki/corpus/**`, `.pi/prompts/**`.

## Risk / Rollback
- **Patch fails to apply:** wrong path in `package.json` → `pnpm install` errors loudly (caught immediately).
- **Rollback:** `git mv .oh/patches patches` + revert the `package.json`/lock/doc edits; the move is a single tracked rename.
