# Critique — cron-sighup-reschedule

Generated 2026-06-13; reviews `prd.md` post-/prd, pre-/ralph.

## Critic A — Implementer lens

```
[SEVERITY: H] [US-001] mkCron signature change to return Cron breaks the
  (entry)=>void test spies under tsc unless widened to (entry: CronEntry) => Cron | void.
  → Lock the widened type in the AC.
[SEVERITY: H] [US-002] .stop() halts future fires but not an in-flight callback;
  reschedule can overlap with a still-running non-tmux fire.
  → Document stop-then-reschedule as best-effort; overlap guard remains sole protection.
[SEVERITY: H] [US-002] Handler buried in main() (acquireLock + scheduleAll side
  effects) is not testable. → Export/inject sighupHandler so tests call it directly.
[SEVERITY: M] [US-001] module-level activeJobs registry → cross-test pollution;
  require reset between tests.
[SEVERITY: M] [US-003] RELOAD line id unspecified → use id="system" (BOOT precedent).
[SEVERITY: M] [US-005] crons/README.md status-tokens table + stale "require a
  runtime restart" sentence must be updated.
[SEVERITY: M] [US-002] signal-handler sync I/O → defer via setImmediate.
[SEVERITY: M] [US-004] AC risks testing scheduleAll directly, not the handler wiring.
[SEVERITY: L] [US-001] BOOT token recurs on reload → document or emit distinct token.
[SEVERITY: L] [US-003] reuse private log() helper, don't duplicate appendFileSync.
```

## Critic B — User lens

```
[SEVERITY: H] [US-005] kill -HUP from the HOST hits the wrong PID namespace; the
  runtime lives in the container → doc must use docker exec -u sandbox openharness kill -HUP.
[SEVERITY: H] [US-002] in-flight fire race (same as Critic A) → Non-Goals must state
  in-flight fires are not killed; overlap:false remains sole protection.
[SEVERITY: M] [US-001] mkCron type signature change vs tsc (same as Critic A).
[SEVERITY: M] [US-003] RELOAD line format unspecified (same as Critic A).
[SEVERITY: M] [US-005] stale "require a runtime restart" sentence (same as Critic A).
[SEVERITY: M] [*] rapid double-SIGHUP re-entrancy unaddressed → add boolean reload lock.
[SEVERITY: M] [US-005] no escape hatch if a reload arms zero crons → doc the
  system-cron restart fallback.
[SEVERITY: L] [US-005] operator may not know crons/.pid is valid → add a kill -0 health check.
[SEVERITY: L] [US-004] no test for empty prior activeJobs / double-SIGHUP.
```

## Synthesis

- **High-severity findings**: 5 (mkCron type ×1; in-flight overlap ×2 dup; handler
  testability ×1; container-boundary kill command ×1) — all addressable by AC edits,
  none a scope/destructive/protected-path blocker.
- **Medium-severity findings**: ~9 (RELOAD format/id, status-table + stale-sentence
  doc fixes, reentrancy guard, setImmediate, test-wiring tightening, escape hatch).
- **Protected-path violations**: 0.
- **Recommendation**: REVISE-PRD → PROCEED. PRD revised to fold in all H mitigations
  and the high-value M/L refinements before the issue/branch/PR are committed.
