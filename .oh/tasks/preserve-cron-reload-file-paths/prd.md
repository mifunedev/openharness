# PRD — Preserve cron reload file paths

## Summary
Fix cron hot-reload so fire-time metadata reloads keep the path-qualified cron `filePath`, preventing `reloadBody` from falling back to stale cached prompt bodies after `reloadEntryForFire`.

## Goals
- Preserve the source cron file path across `reloadEntryForFire` and `reloadBody`.
- Add a regression test that fails when a reloaded entry stores only a basename.
- Refresh cron-runtime wiki guidance so future agents know this path preservation is load-bearing.

## Non-Goals
- Do not change cron schedules, cron frontmatter semantics, or SIGHUP behavior.
- Do not alter autopilot selection/cap logic.
- Do not touch sandbox application code.

## User Stories

### US-001 — Preserve path-qualified reload metadata
As a harness operator, I want cron body reloads to keep reading the original cron file after metadata hot-reload, so body edits do not silently fall back to stale cached prompts.

Acceptance criteria:
- `reloadEntryForFire` reparses the on-disk cron using the original path-qualified `entry.filePath`, not `path.basename(entry.filePath)`.
- The returned live entry preserves `filePath` equal to the original cron file path.
- `reloadBody(liveEntry)` can read an updated body from the same cron file without logging `BODY_RELOAD_ERR`.

### US-002 — Guard the regression with tests
As a future agent, I want a focused test for the reloaded-entry path contract, so the basename regression cannot return unnoticed.

Acceptance criteria:
- `scripts/__tests__/cron-runtime.test.ts` asserts `reloadEntryForFire(entry).filePath` is the path-qualified cron file.
- The test calls `reloadBody` on the live entry and expects the updated body.
- The test asserts no `BODY_RELOAD_ERR` is emitted on the success path.
- `pnpm run test:scripts` passes.

### US-003 — Update durable cron-runtime knowledge
As a future operator or agent, I want the cron runtime wiki to describe fire-time metadata reload and path preservation, so the mental model matches the implementation.

Acceptance criteria:
- `wiki/cron-runtime.md` describes `reloadEntryForFire`, `reloadBody`, and why preserving the full `filePath` matters.
- `wiki/README.md` index reflects the updated cron-runtime entry date.
- `CHANGELOG.md` includes an Unreleased fixed entry referencing issue #472.

## Wiki Alignment

- **Impact**: REQUIRED
- **Local entries**: update `wiki/cron-runtime.md` and refresh `wiki/README.md`.
- **Spec alignment**: The wiki should state that body hot-reload depends on a path-qualified `filePath` preserved through fire-time metadata reload.
- **DeepWiki comparison**: No focused DeepWiki page was available in-session; local source/wiki alignment is sufficient for this narrow runtime bug fix.
- **Acceptance criteria**: Covered by US-003.

## Verification
- `pnpm vitest run scripts/__tests__/cron-runtime.test.ts`
- `pnpm run test:scripts`
- `pnpm run typecheck` (with worktree package `node_modules` symlinks to the main checkout)
- Manual diff review confirms `wiki/cron-runtime.md`, `wiki/README.md`, and `CHANGELOG.md` satisfy US-003.
