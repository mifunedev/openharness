# Critique — make-cron-singleton-lock

Generated 2026-06-16; reviews `prd.md` post-/prd, pre-/ralph.

## Critic A — Implementer lens

CRITIC_A — IMPLEMENTER LENS
[SEVERITY: H] [STORY: US-001] Stale-lock reclamation remains underspecified and can reintroduce the race | Acceptance says stale/unparsable lock “removes/reclaims it and writes the current PID atomically,” but does not require a retry loop that re-attempts `wx` after unlink or guards against deleting a competitor’s newly-created pidfile | Specify algorithm: try `writeFileSync(pidFile, pid, { flag: "wx" })`; on `EEXIST`, inspect holder; if stale/unparsable, unlink only that observed stale file, then retry exclusive create; never plain overwrite after stale cleanup.
[SEVERITY: M] [STORY: US-001] “Simulated race behavior” test AC is too vague to prevent a check-then-write regression | PRD requires “Focused Vitest coverage proves ... simulated race behavior” but gives no observable contract for the race test | Require a deterministic mock/spying test where the second contender creates the pidfile between failed exclusive create/stale cleanup/retry, and assert `acquireLock()` returns `false` and preserves the competitor PID.
[SEVERITY: M] [STORY: US-001] Verification command is ambiguous and may miss script-level TypeScript errors | Root `package.json` typecheck only runs package typechecks, while `scripts/cron-runtime.ts` is exercised mainly by Vitest; PRD says “Typecheck and relevant script tests pass” without exact commands | Name exact gates, e.g. `pnpm test:scripts -- scripts/__tests__/cron-runtime.test.ts` plus the existing repository typecheck command, or add an explicit script TS check if intended.
[SEVERITY: L] [STORY: US-002] Wiki README freshness path permits broad `/wiki-lint` side effects when only an index probe is required | AC says `wiki/README.md` remains fresh “run `/wiki-lint` or the index probe/fallback if needed,” while requested proof is only `bash evals/probes/wiki-readme-index.sh` | Narrow implementation guidance to run the probe first and only regenerate `wiki/README.md` if the probe fails.
[SEVERITY: L] [STORY: *] Protected path edit is intentional but should be explicitly called out as non-deletion | `.claude/protected-paths.txt` lists `scripts/cron-runtime.ts`; PRD requires modifying it but does not state protected-path handling. No deletion is proposed | Add a note: `scripts/cron-runtime.ts` is protected and may be edited for this task, but must not be deleted, moved, or deprecated.

## Critic B — User lens

CRITIC_B — USER LENS
[SEVERITY: H] [STORY: US-001] Stale-lock reclaim path is underspecified at the race boundary | PRD requires atomic first create, then “removes/reclaims it and writes the current PID atomically,” but does not require retrying exclusive create after unlink or handling another process winning between stale removal and write; current target is protected `scripts/cron-runtime.ts` and existing implementation is check-then-write | Specify stale reclaim as unlink-then-exclusive-create with EEXIST/live recheck retry semantics, so two restarters cannot both reclaim the same stale pidfile.
[SEVERITY: M] [STORY: US-001] Regression test requirement may allow a mocked race that misses the user-visible duplicate-scheduler failure | Acceptance says “simulated race behavior” but not that the test must prove only one concurrent caller succeeds against a shared pidfile | Require a deterministic concurrent acquisition test where two contenders target the same pidfile and exactly one returns true while the final file contains one valid winner PID.
[SEVERITY: L] [STORY: US-001] No explicit rollback/escape hatch for a wedged lock | PRD preserves live foreign PID behavior but gives the operator no documented safe recovery path if the pidfile is wrong or `kill(pid, 0)` behavior is misleading | Add a short operator recovery note in docs/wiki: stop `cron-system`, verify PID/session, remove `crons/.pid`, restart cron runtime; do not add broad automation.

## Synthesis

- **High-severity findings**: 2
- **Medium-severity findings**: 3
- **Low-severity findings**: 3
- **Recommendation**: PROCEED

The high-severity findings were AC-tightening findings, not architecture halts: both critics identified the same missing retry/re-inspect contract for stale-lock reclamation. `prd.md` now explicitly requires exclusive-create-first acquisition, unlink-then-exclusive-create retry semantics, preservation of a competitor-created live pidfile, deterministic race coverage, exact verification commands, protected-path non-deletion handling, and an operator recovery note in the wiki. No critic proposed deleting or moving a protected path.
