# PRD: Capture cron job failure reason in the liveness log

## Introduction

Non-tmux cron jobs (`heartbeat`, `eval-weekly`, `cleanup-tasks`) currently
record only `EXIT_<code>` in `crons/.cron.log` when they fail — with **no
captured reason**. In `scripts/cron-runtime.ts`, `fire()`'s
`child.on("exit")` handler (line ~236) records the exit code and discards the
job's output one line later. The job's stdout/stderr *is* tee'd to
`/tmp/<session>.log` (`buildCronAgentCommand`, lines ~150–177), but that file
is ephemeral (lost on container restart) and never referenced from the
persistent liveness line. So when a job fails, the liveness log records *that*
it failed and throws away *why*.

This bites the harness's primary liveness/health/drift monitor: the
`heartbeat` cron exits `EXIT_1` on ~20–25% of hourly runs with zero error
detail, and every one is undiagnosable from the liveness log alone. This
feature persists a **bounded tail** of the failing job's tee'd log into the
`EXIT_<code>` line, converting a blind, recurring, self-masking failure into a
diagnosable one — at near-zero cost and effectively zero risk (the existing
`log()` whitespace-collapse + 200-char cap bounds the blast radius).

This is **not** a duplicate of #50 (`feat/49-cron-job-error-logging`, which
added croner's per-job `catch:` → `onJobError` → `ERR_JOB` for a synchronous
throw inside the croner callback) nor of #67 (construction-time schedule
guard). It closes the distinct **child-process-exit** blind spot at line 236.

## Goals

- Persist the *reason* a non-tmux cron child exited non-zero, not just the
  code, into the durable `crons/.cron.log` liveness line.
- Reuse the output already tee'd to `/tmp/<session>.log` — no new capture
  mechanism, no new file, no new dependency.
- Guarantee no regression: a missing/empty log file logs `EXIT_<code>`
  exactly as today, and the success (`OK`) path is byte-identical.
- Keep the enriched line **length-bounded** (rely on the existing `log()`
  200-char cap). Note honestly: this *does* introduce new exposure — today no
  stdout is captured into `.cron.log`; after this change up to 200
  whitespace-collapsed characters of the failing job's output are. The cap
  bounds the *length*, not the *content*; no secret filtering is performed
  (see Non-Goals).

## User Stories

### US-001: Export a best-effort `readFailureTail` helper

**Description:** As a harness operator, I want a small, well-tested helper that
returns a bounded tail of a log file (and an empty string when the file is
missing, empty, or unreadable) so that the exit handler can enrich its message
without ever throwing.

**Acceptance Criteria:**

- [ ] `scripts/cron-runtime.ts` exports `readFailureTail(logFile: string, maxChars = 200): string` — the return type is `string` (never `undefined`), so `log()`'s `msg.replace(...)` can never throw on its result.
- [ ] The `maxChars` default is **200**, matching the existing `log()` slice cap so the parameter is never silently dead weight; the parameter exists for direct test injection, mirroring the existing exported-for-testing `onJobError(logFn = log)` convention (no external-stability guarantee).
- [ ] Returns the last `maxChars` characters of the file's content for a populated file.
- [ ] Returns `""` for a nonexistent path, an empty file, or any `fs` error — it never throws on any input.
- [ ] Uses the already-imported `node:fs` — no new imports.
- [ ] New unit tests in `scripts/__tests__/cron-runtime.test.ts` (a dedicated `describe` block) reuse the existing `beforeEach` temp-dir fixture (`path.join(tmp, ...)`), not a new teardown path, and cover: (a) a populated file returns a non-empty tail containing the file's trailing text; (b) a nonexistent path returns `""` without throwing; (c) an empty file returns `""`; (d) a file longer than `maxChars` returns exactly the last `maxChars` characters.
- [ ] `pnpm test` passes; typecheck/lint passes.

### US-002: Enrich `fire()`'s exit handler with the failure tail

**Description:** As a harness operator, I want a non-zero cron child exit to
append the failure tail to the `EXIT_<code>` liveness line so that I can
diagnose a failure from `crons/.cron.log` alone.

**Acceptance Criteria:**

- [ ] In `fire()`, `child.on("exit")` calls `readFailureTail(logFile)` only when `code !== 0` and passes the result as the third (`msg`) argument to `log()`, i.e. `log(entry.id, \`EXIT_${code}\`, readFailureTail(logFile))`.
- [ ] The `code === 0` branch still calls `log(entry.id, "OK")` with no third argument — behavior byte-identical to today.
- [ ] The signal-kill case (`code === null`) is preserved: `null !== 0` is true, so the status string remains `EXIT_null` exactly as today and the tail is appended to it (no new special-casing of `null`).
- [ ] The enriched line stays bounded by the existing `log()` whitespace-collapse + 200-char `slice` — no change to `log()` itself.
- [ ] `fireTmux` is left functionally unchanged; a one-line comment is added immediately above its terminal `log(entry.id, "SPAWNED", session)` call noting the detached tmux path cannot observe the agent's exit and therefore cannot capture a reason.
- [ ] No other lines in `fire()` change; `pnpm test` passes; typecheck/lint passes.

### US-003: Document the enriched `EXIT_n` liveness format

**Description:** As a harness operator reading `crons/README.md`, I want the
status-tokens table to describe the enriched `EXIT_n` line so the new format
is discoverable.

**Acceptance Criteria:**

- [ ] The `EXIT_n` row in the `crons/README.md` status-tokens table notes that, when the job's log file is populated, a bounded tail of the job's output is appended to the message (the 4th `msg` column — already used by `ERR_JOB`/`ERR`/`BODY_RELOADED`), so the change is **additive to an existing optional field**, not a new line shape.
- [ ] A concrete format example is shown in a **fenced code block** below the table (not as inline literal tabs in a cell), to keep the table lint-clean — e.g. `<iso>⇥<id>⇥EXIT_1⇥<bounded tail of job output>`.
- [ ] Only the `EXIT_n` row (plus the new fenced example) is changed — no other rows or sections are modified.
- [ ] Markdown remains lint-clean.

## Functional Requirements

- FR-1: `readFailureTail(logFile, maxChars?)` reads the tail of `logFile`,
  returning at most `maxChars` characters; returns `""` on missing/empty/error.
- FR-2: `readFailureTail` is exported (mirrors the existing `onJobError`
  test-injection convention) so it is unit-testable directly without spawning
  a child process.
- FR-3: `fire()`'s exit handler appends `readFailureTail(logFile)` to the
  `EXIT_<code>` message on non-zero exit only.
- FR-4: The success path (`code === 0` → `OK`) and `fireTmux` behavior are
  unchanged.
- FR-5: `crons/README.md`'s status-tokens table documents the enriched
  `EXIT_n` format.

## Non-Goals

- No change to the `OK` success path or its log line.
- No change to `fireTmux` / the detached tmux exit path beyond a clarifying
  comment (it cannot observe the agent's exit by design).
- No change to the `log()` helper's signature, whitespace-collapse, or
  200-char cap.
- No new capture file, no persisting the full `/tmp/<session>.log`, no log
  rotation, no change to `buildCronAgentCommand`.
- No change to the croner `catch:` / `onJobError` / `ERR_JOB` path (#50) or
  the construction-time schedule guard (#67).
- **No secret-detection or content filtering** on the tail. The 200-char cap
  bounds length, not content; if a failing child echoes a credential near the
  tail of its output, up to 200 chars of it land in the gitignored (but
  on-disk) `.cron.log`. Ensuring `/tmp/<session>.log` is credential-free is the
  operator's responsibility — out of scope here.
- **No path validation** added to `readFailureTail`. It is always called with
  the `logFile` path `fire()` itself constructs from `entry.id` — the *same*
  `entry.id`-derived path already used to spawn the job today. Hardening an
  untrusted `entry.id` is a pre-existing surface, not widened by this change,
  and is out of scope.
- No changes to `crons/README.md` beyond the `EXIT_n` row and its new fenced
  format example.
- No sandbox application code.

## Technical Considerations

- `logFile` is already in scope inside `fire()` at line ~222
  (`const logFile = \`/tmp/${session}.log\`;`).
- `node:fs` is already imported; no new dependency.
- The `log()` helper (line ~97) already does `msg.replace(/\s+/g, " ").slice(0, 200)`,
  so passing the tail as the `msg` argument is inherently bounded and
  whitespace-collapsed — `readFailureTail`'s own `maxChars` is a secondary
  safety bound, not the primary one.
- Tests follow the established pattern in `scripts/__tests__/cron-runtime.test.ts`
  (the file already injects `logFn` into `onJobError`); `readFailureTail` is
  tested directly with a temp file via the existing `beforeEach` temp-dir
  fixture, avoiding any real child spawn. `fire()`'s wiring is integration-only
  (it spawns a real child), so it is *not* unit-tested — the logic under test
  lives in `readFailureTail`, which is.
- After a Claude→Codex fallback, `buildCronAgentCommand` appends Codex output
  to the *same* `logFile` (`tee -a`), so the tail may reflect the end of a
  combined claude+codex log; the 200-char cap still bounds it. Acceptable —
  the tail is a diagnostic hint, not a full trace.
- The visible tail in `.cron.log` is at most 200 whitespace-collapsed
  characters and may begin mid-line — this is the minimum-viable diagnostic
  signal, deliberately not a full trace (the full output remains in the
  ephemeral `/tmp/<session>.log` for the session's lifetime).
- Verifying the end-to-end Success Metric requires a manual post-merge check
  (trigger a failing cron, confirm `.cron.log` shows a non-empty tail); the
  unit suite covers `readFailureTail` only, not a real child spawn. Add this
  manual step to the PR checklist.
- Scope is strictly `scripts/` + `crons/` — harness-infra only.

## Success Metrics

- A non-zero non-tmux cron exit produces a `crons/.cron.log` line of the shape
  `<iso>\t<id>\tEXIT_<code>\t<bounded reason tail>` instead of a bare
  `EXIT_<code>`.
- The next `heartbeat` `EXIT_1` is diagnosable from `crons/.cron.log` alone.
- Zero behavior change on the success path and zero new test failures.

## Open Questions

- None — the plan is fully specified; `maxChars` default is pinned to 200 to
  match the existing `log()` cap.

## Critique acknowledgment

Two adversarial critics (implementer + user lens) reviewed this PRD before any
code was written; see `tasks/cron-failure-reason/critique.md`. Both
high-severity findings (a possible `undefined` return reaching `log().replace`,
and an inaccurate "zero new risk" framing) were mitigated directly in this
revised spec — the helper's return type is pinned to `string`, and the new
(length-bounded, content-unfiltered) stdout exposure is now stated honestly
with an explicit no-secret-filtering Non-Goal. All medium/low findings
(`maxChars` default pinned to 200, `EXIT_null` SIGKILL case preserved,
fenced-code README example, pre-existing path-validation surface, combined
claude+codex tail, downstream `.cron.log` 4th-field compatibility, manual
post-merge QA step) were folded in. Recommendation: PROCEED.
