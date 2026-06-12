# PRD: Log cron-runtime job errors (ERR_JOB)

## Introduction

`scripts/cron-runtime.ts` schedules every cron with [croner](https://github.com/hexagon/croner)'s
`catch: true` (a **boolean**) option (line 180). With a boolean, croner catches any error thrown
synchronously inside the scheduled callback `() => fire(e)` and **discards it silently** — no log
line, no trace. The synchronous body of `fire()` → `fireTmux()` can throw on real conditions
(`fs.writeFileSync(promptFile, …)` on disk-full/EACCES, `fs.readFileSync(pidFile, …)`, the
overlap-guard logic). When that happens the cron "doesn't fire" with **zero diagnostic** in
`crons/.cron.log`.

Every cron — `heartbeat`, `autopilot`, `eval-weekly`, `cleanup-tasks` — rides this runtime, so a
dead cron is indistinguishable from an idle one. This feature replaces the boolean with a function
handler that emits a new `ERR_JOB` status line, restoring failure observability while preserving
croner's crash-resistance (errors are still caught; the runtime loop never dies).

## Goals

- Surface synchronous cron-job-callback errors as an `ERR_JOB` line in `crons/.cron.log` (cron id + stringified error).
- Preserve the existing no-crash behavior: a thrown job error must not take down the runtime loop.
- Keep the change minimal and unit-testable, with zero behavior change on the happy path.

## User Stories

### US-001: Replace silent `catch: true` with a logging handler

**Description:** As a harness operator, I want a cron job-callback error to be recorded so that a
failed cron is distinguishable from an idle one in `crons/.cron.log`.

**Acceptance Criteria:**

- [ ] `scripts/cron-runtime.ts` defines and exports `onJobError(id: string, err: unknown, logFn = log): void` that records the error by calling `logFn(id, "ERR_JOB", String(err))`. The `logFn` parameter defaults to the module's internal `log` helper and exists ONLY to allow deterministic unit testing via injection (see US-002). `onJobError` is an internal-only export — its signature carries no external-stability guarantee.
- [ ] The module's `log` helper is NOT exported (it stays module-private); only `onJobError` becomes a new export. Existing internal `log` call sites are unchanged. _(Mitigates critic-A H-finding: avoids widening the public API surface of a load-bearing script; injection covers testability instead.)_
- [ ] Line 180 `new Cron(...)` replaces `catch: true` with `catch: (err: unknown) => onJobError(e.id, err)`, closing over the loop's `e.id`. No other `new Cron` option changes (`timezone`, `protect` unchanged).
- [ ] `onJobError` fires ONLY on a synchronous job-callback throw inside `fire()`/`fireTmux()`. Overlap handling is unchanged: a skipped fire still logs `SKIPPED_OVERLAP`, never `ERR_JOB`. _(Mitigates critic-A H-finding on protect/catch interaction. `fire()` spawns and returns immediately, so croner's `protect` never routes through `catch`; the pidfile guard remains the overlap mechanism.)_
- [ ] No `catch: true` literal remains in the file; `grep -n "catch: true" scripts/cron-runtime.ts` returns nothing.
- [ ] `pnpm test:scripts` (vitest) is green — the existing CI-enforced gate that compiles/strips and runs the runtime module.
- [ ] Lint passes.

### US-002: Unit test for the ERR_JOB handler

**Description:** As a maintainer, I want a deterministic test for `onJobError` so the logging
contract is regression-protected.

**Acceptance Criteria:**

- [ ] A new `describe("onJobError", …)` block in `scripts/__tests__/cron-runtime.test.ts` calls `onJobError("testjob", new Error("disk full"), spy)` where `spy` is an injected stand-in logger (e.g. `vi.fn()` or a local `(...args) => calls.push(args)`), and asserts the spy received exactly `("testjob", "ERR_JOB", "Error: disk full")`. This is the ONLY required strategy — it is deterministic and touches no filesystem. _(Mitigates critic findings: avoids the module-load `LOG_FILE` capture trap, where setting `process.env.CRONS_DIR` after the top-level import does NOT redirect the real log.)_
- [ ] `onJobError` is added to the destructured import from `../cron-runtime` at the top of the test file; the existing imports (`acquireLock`, `buildTmuxWrapper`, `loadCrons`, `parseCronFile`, `tmuxSessionName`) remain.
- [ ] All existing tests still pass: `pnpm test:scripts` (vitest) is green; the run does NOT write to the repo's real `crons/.cron.log`.

### US-003: Document the ERR_JOB status token

**Description:** As a reader of the cron runtime, I want `ERR_JOB` documented so the new log lines
are self-explanatory.

**Acceptance Criteria:**

- [ ] `crons/README.md` documents `ERR_JOB`, stating it fires when a synchronous cron job-callback throws, with the log format `<id>\tERR_JOB\t<error-string>`. Because the README currently lists status tokens only inline in prose (no dedicated section), add a concise `## Status tokens` (or similarly named) list enumerating all tokens — `SPAWNED`, `FIRE`, `OK`, `EXIT_n`, `ERR`, `ERR_JOB`, `SKIPPED_OVERLAP`, `BOOT` — each with a one-line meaning, rather than appending `ERR_JOB` to an arbitrary spot.
- [ ] `grep -n "ERR_JOB" crons/README.md` returns a hit; existing prose/sections are not deleted (additive only).

## Functional Requirements

- FR-1: `onJobError(id, err)` MUST call the module `log` helper with `(id, "ERR_JOB", String(err))`.
- FR-2: The croner `catch` option MUST be a function delegating to `onJobError(e.id, err)`, never the boolean `true`.
- FR-3: A thrown job error MUST NOT crash the runtime loop (croner still catches it; the handler only logs).
- FR-4: The happy path (successful fire → `SPAWNED`/`FIRE`/`OK`) MUST be byte-for-byte unchanged.
- FR-5: `crons/README.md` MUST list `ERR_JOB` in the status-token reference.

## Non-Goals (Out of Scope)

- Watchdog / respawn for a crashed cron-runtime process (separate concern).
- The `docker inspect` secret-exposure hook gap (separate finding).
- Any change to other crons (`crons/*.md`), the heartbeat tmux mode, or the eval/cleanup schedules.
- Catching/logging **async** rejections inside spawned child processes — `spawn()` failures are already handled via `child.on("error", …)`. This story targets only the synchronous job-callback throw. Unhandled-rejection events from any async `fire()` code path remain out of scope; they emit to stderr only, not `.cron.log`.
- A stable public API for `onJobError`. It is exported solely for unit testing via logger injection; external callers must not depend on its signature.
- Expanding the existing 200-char `log()` message cap. `ERR_JOB` messages reuse `log()` as-is, so a very long error string (e.g. an `EACCES` on a long path) is truncated to 200 chars — accepted for this iteration; revisit only if truncation proves to hide diagnostics in practice.
- Adding file locking to `.cron.log`.

## Technical Considerations

- **Module-load env capture (test gotcha):** `const CRONS_DIR = process.env.CRONS_DIR || "crons"` and `const LOG_FILE = path.join(CRONS_DIR, ".cron.log")` are evaluated **once at import**. The existing test suite imports `../cron-runtime` at the top of the file, so setting `process.env.CRONS_DIR` inside `beforeEach` will NOT redirect `LOG_FILE`. Two safe test strategies: (a) make `onJobError` accept an optional injected logger (default = the module `log`) and assert the spy received `(id, "ERR_JOB", String(err))` — no filesystem, fully deterministic; or (b) assert against the real `LOG_FILE` path that the module computed at import (read it back after the call). Strategy (a) is preferred for isolation.
- `log()` already truncates the message to 200 chars and best-effort-appends; reuse it as-is — do not duplicate formatting.
- croner's `catch` option accepts `(error, ctx) => void`; only the error arg is needed.
- The runtime runs under `node --experimental-strip-types` (no `tsc`); keep types simple (`unknown` for the error).
- **Rollback:** the change is one line at the call site — to revert, restore `catch: true` at line 180 (the `onJobError` export may remain, inert). No data migration, no state change.

## Success Metrics

- A simulated job-callback throw produces exactly one `ERR_JOB` line in `.cron.log` with the cron id and error text.
- Zero change to existing test outcomes; new test green in CI.

## Open Questions

- None — scope is fully specified by the plan.

## Critic Review

Two critics (implementer + user lens) reviewed this PRD before the issue/branch were committed
(see `critique.md`). Two high-severity findings were raised — (1) exporting the module-private
`log` from a protected-path script, and (2) the croner `protect`/function-`catch` interaction —
**both carried AC-level mitigations and have been incorporated into the acceptance criteria above**
(inject an optional logger instead of exporting `log`; `onJobError` fires only on a synchronous
job-callback throw, overlap still logs `SKIPPED_OVERLAP`). All medium/low findings were mitigated
or explicitly accepted in Non-Goals. No protected-path violations (the change modifies, does not
delete, `scripts/cron-runtime.ts`). **Recommendation: PROCEED.**
