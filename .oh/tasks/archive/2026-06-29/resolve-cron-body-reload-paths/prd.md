# Resolve Cron Body Reload Paths Absolutely

## Introduction

Fix cron hot-reload so scheduled entries keep canonical absolute source file paths, allowing body and fire-time metadata reloads to work after the runtime process changes current working directory.

## Goals

- Store cron entry `filePath` values as absolute paths when parsing/loading cron definitions.
- Preserve existing `loadCrons(dir)` behavior for relative and absolute caller inputs.
- Add a regression test proving body hot-reload succeeds after a cwd change.
- Update cron-runtime documentation/wiki and changelog for the fixed control-plane behavior.

## Non-Goals

- Do not redesign cron scheduling, SIGHUP behavior, preflight gates, tmux/session management, or worktree isolation.
- Do not change cron frontmatter schema or existing cron file contents.
- Do not auto-remediate already-running processes beyond the code/test/docs fix.

## User Stories

### US-001 — Canonicalize cron entry paths

As the harness operator, I want cron entries to retain absolute source paths so fire-time reloads do not depend on whatever cwd the runtime or spawned sessions later use.

**Acceptance Criteria**

- `parseCronFile`/`loadCrons` produce `CronEntry.filePath` as an absolute path for relative and absolute inputs.
- `reloadEntryForFire` and `reloadBody` continue to read the same canonical source path.
- Existing cron-runtime tests continue to pass.
- Typecheck passes.

### US-002 — Guard cwd-independent body hot-reload

As the harness operator, I want a regression test that reproduces the cwd-change failure mode so future cron-runtime changes cannot reintroduce `BODY_RELOAD_ERR` for valid cron files.

**Acceptance Criteria**

- Add a test that loads a cron from a relative `loadCrons("crons")` call, changes `process.cwd()`, mutates the cron body, and verifies `reloadBody(entry)` returns the updated body.
- The test asserts `BODY_RELOADED` is logged and `BODY_RELOAD_ERR` is not logged.
- `pnpm run test:scripts -- scripts/__tests__/cron-runtime.test.ts` passes.

### US-003 — Document the hot-reload invariant

As a future agent, I want the durable docs to state that cron hot-reload uses absolute file paths so I can diagnose runtime liveness without rediscovering the invariant.

**Acceptance Criteria**

- Update `wiki/cron-runtime.md` to describe canonical absolute `filePath` storage and cwd-independent body reload.
- Update `CHANGELOG.md` under `[Unreleased]` with a Fixed entry for issue #517.
- `bash .oh/evals/probes/wiki-readme-index.sh` passes.

## Wiki Alignment

- **Impact**: REQUIRED
- **Local entries**: `wiki/cron-runtime.md`
- **Spec alignment**: The cron runtime wiki must explain that `CronEntry.filePath` is canonicalized to an absolute path during parse/load and remains the source for fire-time metadata/body reloads.
- **DeepWiki comparison**: No live DeepWiki page was fetched in this cron run; the local wiki already names the relevant source-file sections and should be updated to preserve that source-backed shape.
- **Acceptance criteria**: US-003 must update `wiki/cron-runtime.md` and verify the wiki index with `bash .oh/evals/probes/wiki-readme-index.sh`.

## Verification

- `pnpm run test:scripts -- scripts/__tests__/cron-runtime.test.ts`
- `bash .oh/evals/probes/wiki-readme-index.sh`
- `/eval` (full harness probe gate)
