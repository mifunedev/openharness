# Critique — cron-job-error-logging

Generated 2026-06-11; reviews `prd.md` post-/prd, pre-/ralph. Two critics (implementer + user lens).

## Critic A — Implementer lens

- **[H] US-001 — export of `log` from a protected-path script.** `scripts/cron-runtime.ts` is on `.claude/protected-paths.txt`; PRD proposed exporting the module-private `log`. → **Mitigated**: revised PRD no longer exports `log`; `onJobError(id, err, logFn = log)` takes an injected logger for tests instead. The protected-path rule is about deletion/deprecation (per Critic B), not surgical modification, but the injection approach avoids widening the public surface regardless.
- **[H] US-001 — croner `protect` + function `catch` interaction.** Concern that an overlap/scheduling event could route a croner-internal error into the new `catch`, producing a misleading `ERR_JOB`. → **Mitigated**: revised AC states `onJobError` fires only on a synchronous job-callback throw; overlap continues to log `SKIPPED_OVERLAP`. `fire()` spawns-and-returns, so croner's `protect` never invokes `catch` for these callbacks.
- **[M] US-001 — `--check` AC not CI-wired.** → **Mitigated**: replaced the manual `node --check` AC with `pnpm test:scripts` (the CI-enforced gate).
- **[M] US-002 — two mutually-exclusive test strategies left to implementer.** → **Mitigated**: revised AC mandates strategy (a) (injected spy) as the ONLY required approach; strategy (b) struck.
- **[M] US-002 — import line not updated.** → **Mitigated**: added explicit AC to add `onJobError` to the destructured import.
- **[M] US-001 — 200-char truncation may clip long errors.** → **Acknowledged** in Non-Goals as accepted for this iteration.
- **[L] US-003 — no status-token section exists yet.** → **Mitigated**: AC now asks for a concise `## Status tokens` list.
- **[L] US-001 — exporting widens API surface.** → **Mitigated** by the internal-only-export Non-Goal.

## Critic B — User lens

- **[M] async-rejection surface unaddressed.** → **Mitigated**: Non-Goals now states unhandled rejections from async `fire()` paths emit to stderr only, not `.cron.log`.
- **[M] `onJobError` export stability unclear.** → **Mitigated**: Non-Goal declares it internal-only, no external-stability guarantee.
- **[M] exporting `log` is surface-widening for a solo harness.** → **Mitigated**: `log` no longer exported.
- **[L] missing rollback note.** → **Mitigated**: Technical Considerations now has a one-line rollback (restore `catch: true`).
- **[L] US-003 ceremony for a 3-word doc change.** → Accepted as-is (story kept; low cost).
- **[L] success metric not independently verifiable.** → Accepted; the injected-spy unit test is the regression gate (deterministic).
- **[L] protected-path note.** → No violation (modification, not deletion).

## Synthesis

- **High-severity findings**: 2 (both had AC-level mitigations and are now baked into `prd.md` — not HALT conditions).
- **Medium-severity findings**: 5 (all mitigated or acknowledged).
- **Low-severity findings**: 6 (mitigated or accepted).
- **Protected-path violations**: 0 (the change modifies, does not delete, `scripts/cron-runtime.ts`).
- **Recommendation**: PROCEED — all high-severity findings carry AC-level mitigations now reflected in the revised PRD.
