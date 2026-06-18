# Atomic Cron Singleton Lock

## Summary

Harden the cron runtime singleton lock so concurrent runtime starts cannot both acquire the scheduler pidfile. The fix replaces the check-then-write lock acquisition with atomic exclusive creation, preserves stale/self/live-pid behavior, and adds regression tests around the race boundary.

## Goals

- Make `scripts/cron-runtime.ts#acquireLock()` mutually exclusive under concurrent starts.
- Preserve the existing public contract: live foreign lock returns `false`; stale lock is reclaimed; current-process lock is allowed.
- Add deterministic Vitest coverage that would fail if the implementation regresses to non-atomic check-then-write.
- Keep the cron runtime wiki model and changelog aligned with the hardened lock behavior.

## Non-Goals

- No scheduler semantics changes beyond lock acquisition.
- No changes to cron definitions, tmux launch behavior, worktree creation, preflight gates, or liveness tokens.
- No sandbox application code changes.
- No broad security redesign of Docker socket or agent permission defaults.

## User Stories

### US-001 — Acquire the cron singleton lock atomically

As the harness operator, I want cron runtime lock acquisition to be atomic so watchdog/restart races cannot spawn duplicate schedulers.

Acceptance criteria:

- `scripts/cron-runtime.ts` is protected-path code and may be edited for this task, but must not be deleted, moved, or deprecated.
- `acquireLock(pidFile)` first attempts `writeFileSync(pidFile, String(process.pid), { flag: "wx" })` or equivalent exclusive-create semantics before considering stale-lock reclamation.
- On `EEXIST`, `acquireLock(pidFile)` inspects the existing holder. If the pidfile contains the current process PID, it returns `true`. If it contains a live foreign PID, it returns `false` and leaves the file unchanged.
- Stale/unparsable reclaim uses retry semantics: inspect the observed stale file, unlink it, then retry exclusive create. If another contender wins before the retry, `acquireLock(pidFile)` re-inspects and returns `false` for a live holder rather than overwriting.
- Focused Vitest coverage proves live, stale, self, unparsable, and deterministic race behavior: two contenders against the same pidfile cannot both return `true`, and a competitor-created live pidfile between stale cleanup and retry is preserved.
- `CHANGELOG.md` records the cron-runtime lock hardening under `## [Unreleased]` in the same commit as the runtime change.
- `pnpm test:scripts -- scripts/__tests__/cron-runtime.test.ts` and `pnpm typecheck` pass.

### US-002 — Update the cron-runtime wiki model

As a future agent, I want the cron runtime wiki entry to mention singleton locking so I understand how scheduler duplication is prevented.

Acceptance criteria:

- `wiki/cron-runtime.md` documents `acquireLock()` as the singleton guard with source-file line references updated for the final code.
- The wiki system-relationships section mentions the lock before schedule arming.
- `wiki/cron-runtime.md` includes a short operator recovery note for a wedged/stale lock: stop `cron-system`, verify PID/session state, remove `crons/.pid`, and restart the runtime; no broad auto-recovery is added.
- `bash evals/probes/wiki-readme-index.sh` passes; regenerate `wiki/README.md` only if that probe fails.

## Wiki Alignment

- **Impact**: REQUIRED
- **Local entries**: `wiki/cron-runtime.md`
- **Spec alignment**: The entry must add singleton lock acquisition to the cron runtime model, including how atomic pidfile creation prevents duplicate scheduler starts while stale locks remain reclaimable.
- **DeepWiki comparison**: No live DeepWiki page was fetched during this cron run; local `wiki/cron-runtime.md` is the canonical source-backed model and already uses DeepWiki-style source-file coverage, detail, system relationships, and `## See Also`.
- **Acceptance criteria**: US-002 must update `wiki/cron-runtime.md` with final source references and verify the wiki README index probe.

## Open Questions

None.
