# PRD: Fault-isolate cron scheduling

Tracking issue: #67 · Slug: `cron-schedule-fault-isolation` · Branch: `feat/67-cron-schedule-fault-isolation`

## Introduction

`scripts/cron-runtime.ts` is the single Node process that schedules and fires
every harness cron (autopilot, heartbeat, eval-weekly, cleanup-tasks). It
schedules each cron in an unguarded loop in `main()`:

```ts
for (const e of entries) {
  new Cron(e.schedule, { timezone: e.timezone, protect: !e.overlap, catch: ... }, () => fire(e));
}
```

`parseCronFile` validates only that the `schedule` field is **non-empty**
(`if (!fm.schedule) return null;`), never that it is a *valid* cron expression.
A malformed `schedule:` string therefore passes parse, enters the entries list,
and then throws **synchronously** from the `new Cron()` constructor. That
exception propagates out of `main()` and **crashes the entire runtime process**,
silently stopping ALL crons at once — including the heartbeat, which is the only
crash detector (via `crons/.cron.log`). The outage is invisible until a human
notices nothing has run for hours.

This PRD makes cron scheduling fault-isolating: a single malformed schedule is
**skipped and logged**, never fatal. PR #50's `catch:` option only handles
per-job *runtime* errors; it does not cover the construction-time throw this PRD
addresses.

## Goals

- A malformed `schedule:` string in any `crons/*.md` never crashes the runtime.
- Invalid-schedule crons are skipped and recorded in `crons/.cron.log` with a
  distinct `SCHED_INVALID` status so the misconfiguration is visible.
- Valid crons are always scheduled even when a sibling cron is invalid.
- Boot logs a `scheduled/skipped` summary so a misconfiguration is observable in
  the liveness log.
- Behavior is covered by unit tests in the existing vitest suite; no regressions.

## User Stories

### US-001: Add a pure `isValidSchedule` helper

**Description:** As the cron runtime, I need a side-effect-free way to test
whether a schedule string is a valid cron expression so that I can reject bad
schedules before constructing a `Cron`.

**Acceptance Criteria:**

- [ ] `isValidSchedule(schedule: string): boolean` is added to
      `scripts/cron-runtime.ts` and exported.
- [ ] It is implemented with a try/catch probe — croner v9.1.0 exposes **no**
      static `Cron.validate` (verified: `typeof Cron.validate === "undefined"`),
      so do **not** add a `Cron.validate` branch. The probe constructs a `Cron`
      with **no callback function and no `name` option**
      (`new Cron(schedule)`), which parses the pattern and throws synchronously
      on an invalid one **without arming a timer** (croner only calls
      `schedule()` when a function is passed) **and without registering in the
      module-level named-jobs array** (no `name`). Call `.stop()` on the probe
      instance (in a `finally`/before returning) as defensive cleanup, then
      return `true`; return `false` in the `catch`.
- [ ] `isValidSchedule` MUST NOT throw for any string input (including `""`,
      garbage, and valid expressions), MUST NOT schedule or fire anything, and
      MUST NOT leave a live timer or a registry entry behind.
- [ ] `isValidSchedule("0 * * * *")` → `true`; `isValidSchedule("not-a-cron")` →
      `false`; `isValidSchedule("")` → `false`.
- [ ] Unit tests cover a valid expression, a malformed string, and the empty
      string.
- [ ] Typecheck/lint passes; existing tests still pass.

### US-002: Skip and log invalid-schedule crons at load time

**Description:** As the cron runtime, I want a cron whose schedule is invalid to
be excluded from the scheduled set and logged, so that one bad cron file does not
poison the entries list handed to `main()`.

**Acceptance Criteria:**

- [ ] In the load path (`loadCrons`), a cron whose `schedule` fails
      `isValidSchedule` is excluded from the returned entries (it is not
      scheduled). The new signature is `loadCrons(dir?: string, logFn?: typeof log)`
      — an **optional second parameter** defaulting to the module-private `log`
      (mirroring `onJobError(id, err, logFn = log)`), so the existing
      `loadCrons(tmp)` call sites remain valid.
- [ ] The validation+skip+log logic runs **after** `parseCronFile` returns a
      non-null entry and **outside** the existing filesystem `try/catch`
      (lines 53–58), keeping the two skip paths distinct: an unreadable file
      stays silently skipped as today; an **invalid schedule** is logged
      `SCHED_INVALID`. (Do not merge the two paths.)
- [ ] The skip is recorded via `logFn` as status `SCHED_INVALID`. The assertion
      contract: `logFn` is called with first arg equal to the cron's id
      (frontmatter `id` or filename-derived), second arg exactly `SCHED_INVALID`,
      and third arg containing the offending schedule string.
- [ ] `parseCronFile` remains side-effect-free (no logging inside it) so
      `reloadBody` and existing parser tests stay pure. Validation+logging live
      in `loadCrons` (or a helper it calls), not in `parseCronFile`.
- [ ] `loadCrons` never throws on an invalid schedule.
- [ ] Unit tests: (a) a temp-dir cron with a malformed schedule is excluded from
      `loadCrons` output and does not throw; (b) a valid cron in the same
      directory as an invalid one is still returned; (c) the injected `logFn`
      receives a call matching the assertion contract above (id, `SCHED_INVALID`,
      bad-schedule string).
- [ ] Typecheck/lint passes.

### US-003: Fault-isolate the `new Cron()` loop and log a boot summary

**Description:** As the cron runtime, I want each `new Cron(...)` construction in
`main()` isolated so that any residual constructor throw stops only that one cron,
and I want a boot summary so a skipped cron is visible.

**Acceptance Criteria:**

- [ ] Each `new Cron(...)` construction in `main()` is wrapped in try/catch; on
      throw it logs `SCHED_INVALID` for that cron id (with the error) and
      continues the loop — remaining crons are still constructed. This guard is
      **defense-in-depth**: US-002 already filters invalid schedules at load
      time, so in normal operation this catch never fires; it protects against a
      future load-path bypass or a croner edge case.
- [ ] The boot log line reports both counts as
      `log("system", "BOOT", "<N> scheduled, <M> skipped")`, preserving the
      existing `BOOT` status token. The counts MUST be **accurate** for the mixed
      fixture below; `M` is the number of crons not scheduled due to an invalid
      schedule, with no double-counting (a cron dropped at load time is not also
      counted at construction). The exact plumbing (e.g. `loadCrons` surfacing a
      skip count, or `main` deriving it) is the implementer's choice provided the
      logged counts are correct.
- [ ] With one invalid and two valid crons present, the two valid crons are
      scheduled, the runtime does not exit early, and the BOOT summary reads
      `2 scheduled, 1 skipped`.
- [ ] The defense-in-depth catch is exercised by a test that bypasses the
      load-time filter — e.g. by stubbing `isValidSchedule` to return `true` for
      a malformed schedule, or by testing an extracted construction helper
      directly.
- [ ] Typecheck/lint passes; existing tests still pass.

### US-004: Document the `SCHED_INVALID` token

**Description:** As an operator editing cron files, I want the `SCHED_INVALID`
liveness token documented so I can recognize a skipped cron in `crons/.cron.log`.

**Acceptance Criteria:**

- [ ] `crons/README.md` documents `SCHED_INVALID` by adding a row to the
      existing status-tokens table (confirmed present at ~lines 43–58) with an
      accurate one-line description.
- [ ] A sentence notes that an invalid `schedule:` string is skipped at load time
      and never crashes the runtime, so other crons keep running.
- [ ] All existing status-token rows remain present and unchanged; only the
      `SCHED_INVALID` row is added (no reformatting of other rows).

## Functional Requirements

- FR-1: The runtime MUST NOT terminate due to a malformed `schedule:` string in
  any `crons/*.md` file.
- FR-2: `isValidSchedule(s)` MUST return a boolean for any string input without
  throwing, scheduling, or firing.
- FR-3: `loadCrons` MUST exclude invalid-schedule crons from its result and log
  `SCHED_INVALID` for each.
- FR-4: Each `new Cron(...)` construction in `main()` MUST be individually
  fault-isolated so a throw skips only that cron.
- FR-5: Boot MUST log a `scheduled/skipped` summary via the existing `BOOT`
  status.
- FR-6: `crons/README.md` MUST document the `SCHED_INVALID` status token.

## Non-Goals (Out of Scope)

- Auto-correcting or normalizing malformed schedules — invalid means skipped, not
  repaired.
- A watchdog/auto-restart for the `system-cron` tmux session (separate concern).
- Changing the croner library version or switching schedule-validation libraries.
- Investigating why `eval-weekly` has not fired (separate concern / operational).
- Any change to per-job *runtime* error handling (already covered by `onJobError`
  / PR #50).
- **Heartbeat surfacing** of `SCHED_INVALID` lines (actively alerting the
  operator when a recent skip is in the log) is out of scope — a potential
  follow-up. This PR's notification path is the `crons/.cron.log` entry + boot
  summary only.
- **No runtime flag** is provided to restore the prior crash-on-invalid behavior;
  the fail-safe (skip+log) is one-directional by design. Revert via git if ever
  needed.
- The two-layer design (load-time filter **and** construction-time guard) is
  intentional belt-and-suspenders; do **not** collapse it to a single layer. The
  load-time filter is the primary path; the construction guard is
  defense-in-depth (see US-003).
- Any sandbox application code.

## Technical Considerations

- Files in scope: `scripts/cron-runtime.ts`,
  `scripts/__tests__/cron-runtime.test.ts`, `crons/README.md`.
- `log(id, status, msg)` is module-private and writes to
  `crons/.cron.log` (`LOG_FILE`). Use the established injectable-`logFn` seam
  (see `onJobError`) rather than logging from `parseCronFile`, so tests can assert
  the `SCHED_INVALID` write without touching the real log file.
- Tests use vitest with `mkdtempSync` temp dirs and a mocked `node:fs`
  (`scripts/__tests__/cron-runtime.test.ts`) — follow that style; `loadCrons`
  already takes a `dir` argument used by existing tests.
- croner is imported as `import { Cron } from "croner"` (v9.1.0). There is **no**
  static `Cron.validate` in this version (verified) — use the no-callback /
  no-name `new Cron(schedule)` try/catch probe described in US-001.
- The two `loadCrons` skip paths must stay distinct: the existing filesystem
  `try/catch` (lines 53–58, "skip unreadable") remains silent; the new
  invalid-schedule skip logs `SCHED_INVALID`. Add the validation after the
  `entry` null-check, not inside that `try/catch`.

## Success Metrics

- Injecting a cron file with a deliberately malformed schedule leaves all other
  crons scheduled and the runtime alive, with a `SCHED_INVALID` line in the log
  (previously: total silent outage).
- `vitest run` is green including the new cases; no existing test regresses.

## Open Questions

- (Resolved) croner v9.1.0 exposes no static `Cron.validate` — the no-callback /
  no-name `new Cron(schedule)` try/catch probe is the mandated approach (US-001).

## Critic review

Two critics (implementer + user lens) reviewed this PRD before any issue/branch
existed (see `critique.md`). Findings: 2 high (both US-001, croner validation
mechanism), 6 medium, 7 low, 0 protected-path violations. **Recommendation:
PROCEED** — the two high-severity findings were mitigated at the AC level
(US-001 now mandates the orchestrator-verified probe; `Cron.validate` does not
exist in v9.1.0 and was removed from the spec), and the medium/low findings were
folded into the ACs and Technical Considerations to sharpen verifiability.
