# Critique — cron-schedule-fault-isolation

Generated 2026-06-12; reviews `prd.md` post-/prd, pre-/ralph. Two critics
(implementer + user lens) per ship-spec Stage 3.

## Critic A — Implementer lens

```
[SEVERITY: H] [US-001] Cron.validate does NOT exist in croner v9.1.0
  | EVIDENCE: node -e "typeof Cron.validate" → undefined (independently verified by orchestrator)
  | RECOMMENDATION: remove the Cron.validate branch; mandate the try/catch probe directly.

[SEVERITY: H] [US-001] try/catch probe can leave a live timer / registry entry
  | EVIDENCE: croner constructor calls schedule() (arms setTimeout) when a function is passed;
    named jobs are pushed to a module-level array and only removed by .stop().
  | RECOMMENDATION: probe with NO function and NO name; call .stop(); paused:true does not
    prevent the timer.

[SEVERITY: M] US-001 paused:true does not prevent the internal setTimeout — call .stop().
[SEVERITY: M] US-002 injectable logFn changes loadCrons signature — state it explicitly: loadCrons(dir?, logFn?).
[SEVERITY: M] US-003 "M skipped" counter mechanism is ambiguous across the two skip paths — specify it.
[SEVERITY: M] US-002 AC(c) "naming the bad cron" is not directly verifiable — tighten the log assertion contract.
[SEVERITY: M] US-002 keep the invalid-schedule skip distinct from the existing silent "skip unreadable" fs catch.
[SEVERITY: L] US-003 constructor try/catch is dead code if US-002 works — acknowledge it as defense-in-depth; test via stub.
[SEVERITY: L] US-004 "no rows reformatted" is not machine-verifiable — restate as "existing rows unchanged; only SCHED_INVALID added".

No protected-path violations. cron-runtime.ts is on .claude/protected-paths.txt but is MODIFIED, not deleted — permitted.
```

## Critic B — User lens

```
[SEVERITY: M] [*] No operator notification path beyond crons/.cron.log — a single dev may miss a
  SCHED_INVALID line for hours. RECOMMEND: add Non-Goal that heartbeat surfacing is out of scope (follow-up).
[SEVERITY: L] US-002 document the two-layer (load + construct) design so an implementer doesn't collapse it.
[SEVERITY: L] US-004 status-token table already exists (lines 43–58) — add the row there, don't duplicate.
[SEVERITY: L] US-003 confirm M is de-duplicated across the two skip paths.
[SEVERITY: L] [*] No rollback flag — note the fail-safe is one-directional by design; revert via git.
[SEVERITY: L] [*] cron-runtime.ts is a protected path — modification (not deletion) is permitted.
No scope creep found; the four stories are tightly scoped.
```

## Synthesis

- **High-severity findings**: 2 (both Critic A, both on US-001) — **mitigated at AC level**.
- **Medium-severity findings**: 6 — all incorporated into the ACs / Technical Considerations.
- **Low-severity findings**: 7 — incorporated where they sharpen verifiability.
- **Protected-path findings**: 0 (both critics confirmed `cron-runtime.ts` is modified, not deleted).
- **Recommendation**: **PROCEED.**

### Why PROCEED (not HALT)

The Stage 4 gate HALTs on a high-severity finding *with no AC-level mitigation*.
Both H findings are precise, mechanical implementation corrections — not unsound
scope or protected-path deletions — and the critic supplied the exact fix. The
orchestrator independently verified the croner v9.1.0 behavior
(`typeof Cron.validate === "undefined"`; `new Cron(schedule)` with no
function/no name parses-and-throws on invalid input, arms no timer, registers
nothing) and revised US-001 to mandate that verified probe. With the mitigations
baked into the ACs, both H findings are resolved in-spec. The remaining M/L
findings were folded in to tighten verifiability (explicit `loadCrons(dir?, logFn?)`
signature, a precise `SCHED_INVALID` log assertion contract, an accurate
`2 scheduled, 1 skipped` boot-summary fixture, the defense-in-depth framing for
the US-003 constructor guard, and the distinct-skip-paths boundary). Two
Non-Goals were added per Critic B (heartbeat surfacing out of scope; no
crash-on-invalid restore flag).
