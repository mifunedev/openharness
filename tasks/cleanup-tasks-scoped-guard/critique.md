# Critique — cleanup-tasks-scoped-guard

Generated 2026-06-13; reviews `prd.md` post-/prd, pre-/ralph.

## Critic A — Implementer lens

[SEVERITY: H] [US-002] Worktree path `.worktrees/archive/$TODAY` not in `.worktrees/README.md` convention table (only feat/bug/task/audit/skill/agent rows). → add `archive/` row in same PR, or flatten path.
[SEVERITY: H] [US-002] Worktree-remove teardown ungated; a mid-step failure strands `.worktrees/archive/$TODAY` and the next-week run collides. → prune-stale-first + `--force` teardown that runs even on error exit.
[SEVERITY: M] [US-001] Exclude of `tasks/archive/` has no specified syntax. → mandate `':!tasks/archive/'` pathspec; probe greps for it.
[SEVERITY: M] [US-003] Bare-call detection underspecified; `git status --porcelain -- tasks/` contains the literal `git status --porcelain`. → specify grep + `grep -v -- '-- '` subtraction.
[SEVERITY: M] [US-002] `git mv` source paths must exist in the worktree; a worktree off `origin/$BASE` reflects committed state, not the shared checkout's uncommitted dirs. → clarify the sweep scans the worktree's committed `tasks/` (this is correct, not a bug — uncommitted dirs shouldn't archive).
[SEVERITY: M] [US-001] Token semantics: existing cron emits `OK (archived N, skipped M)` / `HEARTBEAT_OK`, not the PRD's implied idle `HEARTBEAT_OK`. → clarify BLOCKED-TASKS-WIP is the new dirty-abort token; existing OK/HEARTBEAT_OK behavior unchanged.
[SEVERITY: L] [US-003] Probe should also assert `git switch -c` ABSENT (asymmetric oracle), stronger than presence-only.
[SEVERITY: L] [US-004] No duplicate-check mechanism. → `grep -c '#85'` before write.
[SEVERITY: L] [*] git commands need repo-root cwd / absolute path.

## Critic B — User lens

[SEVERITY: H] [US-002] Crash-leaked worktree never cleaned; no documented escape hatch. → trap/force cleanup + prune-first; document manual recovery; Non-Goal noting orphaned-worktree tolerance.
[SEVERITY: H] [US-002] Same-day re-run "reuse existing worktree/branch" broken after a partial run (can't switch to a branch checked out elsewhere; dirty index). → mandate tear-down-and-recreate (idempotent).
[SEVERITY: M] [US-001] Probe doesn't assert the `tasks/archive/` exclusion. → add the assertion, or drop the parenthetical if worktree makes it moot.
[SEVERITY: M] [US-002] ~20 stranded tasks: unverified they end in exact `STATUS: COMPLETE`. → Open Question / operator-verify note.
[SEVERITY: M] [US-002] PR-capture idempotency fallback (`gh pr view`) survival through the refactor untested. → preserve + assert or Non-Goal.
[SEVERITY: M] [*] Heartbeat token parsing may see new BLOCKED-TASKS-WIP. → Non-Goal: heartbeat parsing unchanged.
[SEVERITY: L] [US-003] Probe is a static grep oracle, not a runtime test. → state the limitation.
[SEVERITY: L] [US-002] `git worktree remove` refuses dirty worktrees. → `--force`.
[SEVERITY: L] [*] "Open Questions: None" overconfident. → list the real ones.

## Synthesis

- **High-severity findings**: 4 (all on US-002 worktree mechanics; all AC-level mitigable; none are protected-path violations).
- **Medium-severity findings**: 7
- **Recommendation**: PROCEED after PRD revision. The four HIGH findings are robustness gaps in the worktree flow, not a fundamental flaw in the approach — each has a clear AC-level mitigation (prune-stale-first + `--force` crash-safe teardown, tear-down-and-recreate same-day re-run, `.worktrees/README.md` `archive/` row, worktree-scans-origin clarification). PRD revised in place to fold in all four HIGH mitigations plus the M/L clarifications (exact exclude pathspec, probe detection algorithm + `git switch -c`-absent assertion, PR-idempotency preserved, heartbeat-unchanged Non-Goal, duplicate-check). Re-evaluation: HIGH findings mitigated → PROCEED.
