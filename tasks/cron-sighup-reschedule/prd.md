# PRD: Cron-runtime SIGHUP reschedule

## Introduction

The harness cron runtime (`scripts/cron-runtime.ts`) is the scheduler that fires
every autonomous cron — heartbeat, autopilot, cleanup-tasks, eval-weekly. Today
its `main()` registers only `SIGTERM` and `SIGINT` handlers (both exit the
process). The merged PR #47 added `reloadBody()`, which hot-reloads only a cron's
prompt *body* at fire time. **Schedule edits, newly-added `crons/*.md` files, and
removed cron files are still ignored until the `system-cron` tmux session is
manually restarted.** Because the failure is silent — the old schedule keeps
running or a new cron never starts, with no error — it is exactly the class of
drift an unattended system cannot self-detect. This is recorded as a known
silent-failure mode in `memory/MEMORY.md` (`cron-runtime-reload-after-edit`),
citing a multi-hour window where an edited schedule was silently not firing.

This feature adds a `SIGHUP` handler that performs a graceful reschedule: stop
the current generation of scheduled jobs, re-read the `crons/` directory, and
re-arm everything — without exiting the process or releasing the PID lock. The
operator (or a future automation) triggers it from the host with
`docker exec -u sandbox openharness kill -HUP "$(cat crons/.pid)"`.

> This PRD was revised after a 2-critic review (see `critique.md`). All
> high-severity findings are folded into the acceptance criteria below; there
> were no protected-path or destructive-operation findings.

## Goals

- Let schedule edits and added/removed cron files take effect without a
  `system-cron` restart.
- Reschedule cleanly — no duplicate or overlapping *timers* from the prior
  generation (in-flight fires are a known, documented exception — see Non-Goals).
- Keep the running process and its PID lock intact across a reload.
- Preserve existing `SIGTERM`/`SIGINT` shutdown behavior unchanged.
- Make a reload observable after the fact via a `RELOAD` liveness line in
  `crons/.cron.log`.
- Stay fully covered by the existing `scripts/__tests__/cron-runtime.test.ts`
  suite (extended with a SIGHUP-reload block), with the handler exposed through a
  test seam consistent with the existing `logFn`/`mkCron` injection style.

## User Stories

### US-001: Track live job handles so the prior generation can be stopped

**Description:** As the cron runtime, I need to keep references to the croner
jobs I create so that a reschedule can stop them before arming new ones,
otherwise a reload would leave duplicate overlapping timers.

**Acceptance Criteria:**

- [ ] `constructCron(entry)` returns the live `Cron` handle it creates (instead
      of `void`).
- [ ] The injected-`mkCron` parameter type is **widened to exactly
      `(entry: CronEntry) => Cron | void`** (NOT `=> Cron`), so existing test
      spies typed `() => void` keep compiling under `tsc` — verified by the CI
      typecheck step. The default stays `constructCron`.
- [ ] `scheduleAll()` collects the truthy handles from each successful
      `mkCron(entry)` call into a module-level registry (e.g.
      `activeJobs: Cron[]`), clearing the registry at the **start** of each call
      so a re-run replaces (not appends to) it; `void`/`undefined` returns are
      simply not registered.
- [ ] An exported `resetActiveJobs()` (or equivalent reset seam) lets tests clear
      the module-level registry between cases, preventing cross-test pollution.
- [ ] `scheduleAll()` still returns `BootResult` (`{ scheduled, skipped }`) with
      the same counting semantics (load-skips + construct-skips, disjoint).
- [ ] Typecheck and lint pass.

### US-002: Exported, testable SIGHUP handler reschedules without exiting

**Description:** As an operator, I want to send `SIGHUP` to the cron runtime so
that it re-reads `crons/` and re-arms all schedules without me restarting the
tmux session.

**Acceptance Criteria:**

- [ ] The reschedule logic lives in an **exported** function (e.g.
      `export function sighupHandler(): void`) so tests can invoke it directly
      without calling `main()` (which acquires the real lock and arms real
      timers). `main()` registers it via `process.on("SIGHUP", () => setImmediate(sighupHandler))`.
- [ ] `sighupHandler` calls `.stop()` on every handle in the prior-generation
      registry, then re-runs `scheduleAll()` (which re-runs `loadCrons()`), so
      schedule edits and added/removed `crons/*.md` files all take effect.
- [ ] `sighupHandler` does NOT call `process.exit()` and does NOT remove the PID
      file — the process keeps running and retains its lock.
- [ ] A module-level boolean reload-lock makes the handler **re-entrancy-safe**:
      a SIGHUP that arrives while a reload is already in progress is a no-op (the
      in-progress reschedule completes; the second signal does not double-register
      jobs). The lock is cleared in a `finally` so a throw cannot wedge it.
- [ ] `SIGTERM`/`SIGINT` continue to run the existing `cleanup` (unlink PID file,
      exit 0) — behavior unchanged.
- [ ] Typecheck and lint pass.

### US-003: Reload is fault-isolated and logs a RELOAD liveness line

**Description:** As the unattended harness, I want a malformed cron file present
during a reload to be isolated (not crash the runtime) and I want each successful
reload recorded, so a reload is safe and observable.

**Acceptance Criteria:**

- [ ] A cron file with an invalid schedule present during a SIGHUP reload is
      dropped by the existing `loadCrons()` US-002 path (logged `SCHED_INVALID`),
      the other crons remain scheduled, and the process does not exit/crash.
- [ ] On a successful reschedule, `sighupHandler` records a `RELOAD` liveness
      entry by calling the existing private `log()` helper directly —
      **`log("system", "RELOAD", "<N> scheduled, <M> skipped")`** — reusing its
      best-effort contract (no inline `appendFileSync`, no duplicated format).
      `id` is `"system"`, matching the `BOOT` precedent.
- [ ] (`BOOT` will also recur on each reschedule because `scheduleAll()` logs it;
      this is acceptable and documented in US-005 — `RELOAD` is the
      reschedule-specific marker.)
- [ ] Typecheck and lint pass.

### US-004: Test coverage for the SIGHUP reload path

**Description:** As a maintainer, I want the reschedule behavior covered by the
existing test suite so a future refactor can't silently regress it.

**Acceptance Criteria:**

- [ ] A new `describe("SIGHUP reload", …)` block is added to
      `scripts/__tests__/cron-runtime.test.ts`, calling the **exported
      `sighupHandler`** directly (not `scheduleAll`) so the handler wiring itself
      is exercised; `resetActiveJobs()` is called between cases.
- [ ] A test asserts prior job handles have `.stop()` called on reschedule
      (using a `mkCron` returning fake handles with a `.stop` spy).
- [ ] A test asserts a newly-added cron file in the `tmp` crons dir is picked up,
      and a removed file is dropped, after invoking the handler against updated
      directory state.
- [ ] A test asserts a `RELOAD` line is written via the existing `appendFileSync`
      spy on reload.
- [ ] A test asserts a reload with an **empty** prior `activeJobs` registry (first
      reload before/without prior jobs) does not throw.
- [ ] A test asserts the re-entrancy lock: a second invocation while a reload is
      "in progress" is a safe no-op (does not double-register).
- [ ] No test touches the real `crons/` directory (uses the existing
      `beforeEach`/`afterEach` `tmp` dir pattern); no new external dependencies.
- [ ] `vitest run` (root `test:scripts`) passes with zero failures.

### US-005: Document the SIGHUP reload path

**Description:** As an operator reading the docs, I want to know how to reload
cron schedules without a restart — including from the host, where the runtime
lives inside the container.

**Acceptance Criteria:**

- [ ] `crons/README.md` gains a short note documenting the reload path. Because
      the runtime runs inside the container, the canonical command is
      **`docker exec -u sandbox openharness kill -HUP "$(cat crons/.pid)"`**; the
      note states the bare host-side `kill -HUP "$(cat crons/.pid)"` only works
      from *inside* the container (different PID namespace on the host). Uses the
      correct PID path `crons/.pid` (per `PID_FILE`), not `.cron.lock`.
- [ ] The note includes a liveness/health check before sending the signal:
      `docker exec -u sandbox openharness sh -c 'kill -0 "$(cat crons/.pid)" 2>/dev/null && echo alive || echo "not running"'`.
- [ ] The note includes an escape hatch: if a reload arms zero crons (e.g. files
      removed by accident), restart the runtime to restore the last good state
      (`tmux kill-session -t system-cron` then the documented runtime start), and
      points at the `system-cron` session.
- [ ] A new `RELOAD` row is added to the status-tokens table in `crons/README.md`
      (`id` is `system`; `msg` is the cron count).
- [ ] The stale § Hot-reload sentence — "Frontmatter changes (`schedule`,
      `enabled`, `timezone`, `overlap`) require a runtime restart; no watcher is
      implemented." — is corrected to state that schedule/frontmatter changes and
      added/removed cron files now take effect via a `SIGHUP` reload (still no
      auto-watcher); a full restart is only needed for runtime *code* changes.
- [ ] A `CHANGELOG.md` `[Unreleased]` entry under `### Added` records the
      SIGHUP cron-reload capability, linking issue #88.

## Functional Requirements

- FR-1: `constructCron` returns the created `Cron` handle; `mkCron` is typed
  `(entry: CronEntry) => Cron | void`; `scheduleAll` registers truthy handles in
  a module-level `activeJobs` array cleared at the start of each call, with an
  exported reset seam.
- FR-2: An exported `sighupHandler` stops all `activeJobs`, then calls
  `scheduleAll()` to re-read and re-arm the `crons/` directory; `main()` wires it
  to `SIGHUP` via `setImmediate`.
- FR-3: The handler must not exit the process or remove the PID file, and is
  re-entrancy-guarded by a boolean lock cleared in `finally`.
- FR-4: An invalid cron file during reload is dropped (existing `loadCrons`
  fault isolation), leaving the rest scheduled; the process stays alive.
- FR-5: A successful reload calls `log("system", "RELOAD", "<N> scheduled, <M> skipped")`.
- FR-6: `SIGTERM`/`SIGINT` shutdown behavior is unchanged.
- FR-7: The existing test suite is extended (via the exported handler seam) to
  cover stop-prior-jobs, pick-up-new/drop-removed-file, RELOAD-logging,
  empty-registry, and re-entrancy behaviors.
- FR-8: `crons/README.md` (note + RELOAD row + corrected Hot-reload sentence) and
  `CHANGELOG.md` document the new reload path.

## Non-Goals (Out of Scope)

- **In-flight fires are NOT killed on SIGHUP.** `Cron.stop()` cancels future
  ticks but does not abort an already-executing job callback or a launched
  `tmux: true` child. The `overlap: false` / `protect` guard (and the per-id
  `/tmp/cron-<id>.pid` sentinel for tmux fires) remains the sole protection
  against concurrent execution; stop-then-reschedule is best-effort, not atomic.
- Crash-recovery / process watchdog (restarting cron-runtime if the Node process
  dies) — needs `.devcontainer/` entrypoint wiring; separate ticket.
- Automatic filesystem-watch or mtime-poll auto-reload — SIGHUP-triggered
  reschedule is the minimal, testable MVP; auto-detection is deferred.
- Any change to how individual crons fire, their bodies (`reloadBody` unchanged),
  or their overlap/timezone semantics.
- Any sandbox application code.

## Technical Considerations

- `scripts/cron-runtime.ts` is TypeScript run via Node type-stripping; keep the
  `import.meta.url === file://${process.argv[1]}` entry guard intact.
- `PID_FILE = path.join(CRONS_DIR, ".pid")` → `crons/.pid`. `LOG_FILE` is
  `crons/.cron.log`; the private `log(id, status, msg)` helper already writes
  there with a best-effort try/catch — reuse it, do not duplicate.
- `scheduleAll(dir, logFn, mkCron)` already injects `mkCron`/`logFn` for tests;
  the registry-collection logic must tolerate a `void`-returning injected
  `mkCron`.
- **Signal-handler safety**: register SIGHUP as
  `process.on("SIGHUP", () => setImmediate(sighupHandler))` so the reschedule
  (which does synchronous file I/O via `loadCrons`/`log`) runs on the event loop,
  not inside the async-unsafe signal-callback context.
- Reuse the existing `tmp` crons-dir test harness and `appendFileSync` spy; do
  not introduce new test dependencies. Croner `Cron` instances expose `.stop()`.

## Success Metrics

- Editing a cron schedule + the documented `docker exec … kill -HUP` makes the
  new schedule active with no duplicate timers and no process restart.
- Adding/removing a `crons/*.md` file is reflected after a SIGHUP reload.
- `vitest run` green; CI green; `/eval` shows no new green→red probe regression.

## Open Questions

- None — the mechanism (SIGHUP-triggered `stop + scheduleAll`, deferred via
  `setImmediate`, re-entrancy-guarded) and the operator command are fixed by this
  PRD; richer auto-reload is explicitly out of scope.
