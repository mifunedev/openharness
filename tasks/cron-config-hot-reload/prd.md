# PRD: Cron Config Hot-Reload

## Introduction

`scripts/cron-runtime.ts` reads each cron definition's **body once at boot**.
`loadCrons()` runs a single time inside `main()` (line 177), and each entry's
body is frozen into the croner callback closure `() => fire(e)` (line 180). At
fire time, `fireTmux()` and `fire()` write `entry.body` verbatim (lines 133 and
157) — the on-disk `crons/*.md` file is never re-read.

The consequence is that **any edit to a cron definition stays dormant until the
cron runtime is manually restarted** (which only happens on container restart /
re-running `entrypoint.sh`). This silently breaks the harness's self-improvement
premise: every PR that edits a cron body is a no-op in production until a human
restarts the runtime. Live evidence: PR #42 modified `crons/heartbeat.md` at
2026-06-11 18:46 UTC, but the running runtime booted at 02:01 UTC and never
reloaded — that change is dormant right now.

This feature makes a cron definition's body **hot-reload at fire time**: the
runtime re-reads and re-parses the entry's own file just before each fire, so
body edits take effect at the next scheduled fire with no restart. A
cached-body fallback (with a logged signal) guarantees a transient read/parse
error never escalates into a missed fire.

## Goals

> **Scope:** only the cron **body** (the agent prompt) is hot-reloaded. Frontmatter
> fields (`schedule`, `enabled`, `timezone`, `overlap`) still require a runtime
> restart — see Non-Goals.

- Body edits to any `crons/*.md` file take effect at the **next fire** without a
  runtime restart.
- A read/parse error at fire time never crashes a fire and never silently fires
  a stale body — it falls back to the boot-time cached body and logs the event.
- Operators can see in `crons/.cron.log` when a fire picked up an edited body.
- No regression to existing cron-runtime behavior, tests, schedule handling, or
  the overlap/lock semantics.

## User Stories

### US-000: `loadCrons` stores an absolute (dir-qualified) `filePath`

**Description:** As the cron runtime, I need each `CronEntry.filePath` to be a
path the runtime can re-read from any working directory, because today it is a
bare basename that would break `reloadBody`.

**Acceptance Criteria:**

- [ ] `loadCrons` populates `filePath` with `path.join(dir, f)` (e.g.
      `crons/heartbeat.md`), not the bare filename `f`. This is the
      mitigation for Critic A's basename finding: `parseCronFile` currently
      receives `f` (line 54) and stores it verbatim as `filePath` (line 45),
      so `fs.readFileSync(entry.filePath)` would resolve against `cwd`, not
      `CRONS_DIR`.
- [ ] The derived `id` is unchanged — `parseCronFile` derives `id` via
      `path.basename(file, ".md")`, which yields the same value for
      `crons/heartbeat.md` as for `heartbeat.md`.
- [ ] Existing `loadCrons` tests still pass (the suite uses `loadCrons(tmp)`, so
      `filePath` becomes `<tmp>/<name>.md`, which `reloadBody` can read).
- [ ] `tsc --noEmit` passes.

### US-001: `reloadBody` helper owns read + diff + log + fallback

**Description:** As the cron runtime, I want a single exported helper that
returns the latest on-disk body for an entry, emits the reload/error log
signals itself, and degrades safely on a read/parse error.

**Acceptance Criteria:**

- [ ] A helper `reloadBody(entry: CronEntry): string` is **exported** from
      `scripts/cron-runtime.ts` (exported so US-003 can unit-test it directly;
      this resolves the testability finding since `fire`/`fireTmux` are
      module-private and `LOG_FILE` is import-time bound).
- [ ] On success it returns
      `parseCronFile(fs.readFileSync(entry.filePath, "utf-8"), path.basename(entry.filePath))?.body`
      (the fresh on-disk body).
- [ ] `reloadBody` owns BOTH log signals (single responsibility — no diff/log
      logic at the call sites): it logs `BODY_RELOADED` when the fresh body
      differs from the cached `entry.body`, and logs `BODY_RELOAD_ERR` and
      returns the cached `entry.body` on any read/parse error (file missing,
      unreadable, unparseable, or null parse result).
- [ ] The `BODY_RELOAD_ERR` log message includes the cron `id`/filename and a
      truncated error string (the internal `log()` truncates `msg` to 200
      chars — the message must fit).
- [ ] The helper does **not** mutate `entry` in place (`entry.body` stays the
      boot-time cached value).
- [ ] `tsc --noEmit` passes.

### US-002: Fire paths use `reloadBody` and emit a reload signal

**Description:** As an operator, I want each fire to use the freshly-read body
and to log when a reload actually changed the body, so I can confirm edits are
deploying.

**Acceptance Criteria:**

- [ ] `fireTmux()` computes `const body = reloadBody(entry)` once and writes
      `body` to the prompt file instead of `entry.body` (replacing the line-133
      usage). Exactly one prompt file is written per fire — no extra temp file.
- [ ] `fire()` computes `reloadBody(entry)` once and passes it to `spawn`
      instead of `entry.body` (replacing the line-157 usage).
- [ ] The call sites contain **no** diff or logging logic — the `BODY_RELOADED`
      signal is emitted inside `reloadBody` (per US-001) and surfaces in
      `crons/.cron.log`.
- [ ] Because `entry` is never mutated (FR-4), `BODY_RELOADED` recurs on every
      fire after an edit until the runtime is restarted. This is **intentional
      drift signaling**: it means the fired body differs from the body the
      runtime booted with; a restart re-baselines. Documented in US-004.
- [ ] No change to schedule registration, the overlap/`SKIPPED_OVERLAP` guard,
      lock semantics, or tmux session naming.
- [ ] `tsc --noEmit` passes.

### US-003: Tests for reload + fallback

**Description:** As a maintainer, I want tests proving an edited body is used at
fire time and that an unreadable file falls back safely.

**Acceptance Criteria:**

- [ ] `scripts/__tests__/cron-runtime.test.ts` imports the now-exported
      `reloadBody` and adds a case asserting that a body **mutated on disk
      after** the `CronEntry` was built (via `loadCrons(tmp)` or a hand-built
      entry with a dir-qualified `filePath`) is the body returned by
      `reloadBody` — proving the on-disk edit is picked up.
- [ ] A second case asserts that an unreadable/removed `filePath` causes
      `reloadBody` to return the cached `entry.body` and to emit
      `BODY_RELOAD_ERR`. Because `LOG_FILE` is bound at import time, the log
      assertion uses `vi.spyOn(fs, "appendFileSync")` (or equivalent) to capture
      the log call — **not** a tmp-dir log file.
- [ ] A third assertion (may share a case) confirms `BODY_RELOADED` is emitted
      when the on-disk body differs from the cached body, via the same spy.
- [ ] `parseCronFile`'s signature and throw-safety contract are unchanged, so
      `cron-runtime.property.test.ts` needs no edits.
- [ ] Existing tests in `cron-runtime.test.ts` and
      `cron-runtime.property.test.ts` are **not** modified or removed (adding
      new `it()`/`describe()` blocks is allowed; the US-000 `filePath` change
      may require updating any existing assertion that checks the exact
      `filePath` value — if so, update only that assertion and note it).
- [ ] `vitest run` is green, including the new cases.

### US-004: Document hot-reload in `crons/README.md`

**Description:** As a reader of the cron docs, I want the hot-reload contract
documented so the old "restart the runtime to apply" assumption is retired.

**Acceptance Criteria:**

- [ ] `crons/README.md` gains a `## Hot-reload` section (≤6 lines of prose).
- [ ] It states: body edits apply at the next fire without a restart; an
      unreadable file falls back to the cached body and logs `BODY_RELOAD_ERR`;
      a `BODY_RELOADED` line marks a fire whose body drifted from the boot-time
      body (recurs each fire until restart); and that schedule/`enabled`/
      timezone changes **require a runtime restart — no watcher is implemented**.
- [ ] It includes the one-line rollback (drop `reloadBody`, restore the two
      `entry.body` usages; no config flag).
- [ ] No existing `crons/README.md` content is removed or reordered (additive
      section only — manual-diff QA item, no automated gate).

## Functional Requirements

- FR-1: The runtime MUST re-read and re-parse an entry's own `filePath` at fire
  time and use that body for the agent prompt.
- FR-2: On a read/parse failure, the runtime MUST fall back to the cached
  `entry.body`, MUST log `BODY_RELOAD_ERR`, and MUST NOT abort the fire.
- FR-3: The runtime MUST log `BODY_RELOADED` when the freshly-read body differs
  from the cached body.
- FR-4: `reloadBody` MUST NOT mutate the passed `CronEntry`.
- FR-5: All existing cron-runtime behavior (scheduling, overlap guard, lock,
  tmux wrapper) MUST be unchanged.

## Non-Goals (Out of Scope)

- `fs.watch` schedule-reconciler for `schedule`/`enabled`/`timezone`/`overlap`
  changes — mention only as future work; **not** implemented here.
- Log rotation for `crons/.cron.log`.
- Cleanup of leaked `/tmp/cron-*.prompt` files.
- Orphaned-`autopilot-*`-tmux-session sweep.
- Any change to the security model, sudo/socket posture, or overlap/lock
  semantics.
- Any sandbox application code — harness-infra only (`scripts/`, `crons/`,
  tests, docs).

## Technical Considerations

- **Protected-path note (override):** `scripts/cron-runtime.ts` is listed in
  `.claude/protected-paths.txt`. That gate targets **deletion or deprecation**;
  this change is purely **additive** (a new exported `reloadBody`, the
  `loadCrons` `filePath` join, and swapping two `entry.body` reads for
  `reloadBody(entry)`). No existing function, export, or behavior is removed.
  The entry stays on the protected list. Per the critic gate, this note
  authorizes the additive edit. See Rollback for the exact revert.
- `parseCronFile` is already exported from `scripts/cron-runtime.ts`; reuse it
  rather than writing a second parser. It returns `null` on a body with no
  `schedule:` frontmatter — treat `null` as a parse failure and fall back.
- `parseCronFile` takes `(content, file)`; pass `path.basename(entry.filePath)`
  as the second arg — only `body` is consumed here, so the derived `id` is
  irrelevant to `reloadBody`.
- `log()` is module-internal and `LOG_FILE` is bound at import time, so tests
  cannot redirect the log path via `CRONS_DIR` after import. Tests assert the
  `BODY_RELOAD_ERR` / `BODY_RELOADED` signals with `vi.spyOn(fs, "appendFileSync")`
  (capturing the log line argument), not by reading a tmp-dir log file. This is
  why US-001 exports `reloadBody`.
- **Synchronous read tradeoff:** `reloadBody` calls `fs.readFileSync` on the
  croner callback / event loop. This is acceptable for the harness's
  hourly-or-less cron cadence (heartbeat `0 * * * *`, autopilot `5 * * * *`,
  eval-weekly `0 6 * * 0`). If a future cron runs sub-minute or `crons/` moves
  to a slow remote mount, switch to async `fs.readFile`. Out of scope here.
- **Raw-content diff:** the `BODY_RELOADED` comparison is exact-string on the
  parsed body. Both the boot-time and the reloaded body are read with the same
  `utf-8` + `parseCronFile` path, so consistent line endings produce no
  spurious signal; a genuine content edit (the intended trigger) does.

## Rollback

There is no config flag. To revert hot-reload, drop the `reloadBody` helper and
restore the two `entry.body` usages in `fireTmux()` and `fire()`; optionally
revert the `loadCrons` `filePath` join (harmless to keep). The runtime returns
to boot-time-cached-body behavior. This is documented in `crons/README.md`.

## Success Metrics

- Editing a cron body and waiting for the next fire deploys the change with zero
  manual restart.
- A corrupted/removed cron file produces a logged `BODY_RELOAD_ERR` and a
  successful fire on the cached body (no missed fire, no crash).
- `crons/.cron.log` shows `BODY_RELOADED` entries when definitions change.

## Open Questions

- Should a future iteration add the `fs.watch` schedule-reconciler so
  schedule/enabled changes also hot-reload? (Tracked as future work, not this
  PRD.)

## Critic Review Synthesis (2026-06-11)

Two critics (implementer + user lens) reviewed this PRD before any GitHub state
existed. They raised 5 high-severity findings, all now mitigated in the ACs
above; the spec — the cheapest artifact — was revised rather than halting:

1. **`filePath` was a bare basename** (Critic A) → new **US-000** makes
   `loadCrons` store `path.join(dir, f)` so `reloadBody` can re-read it.
2. **`BODY_RELOAD_ERR` was untestable** because `LOG_FILE` is import-time bound
   (Critic A) → US-001 **exports `reloadBody`** and US-003 asserts log signals
   via `vi.spyOn(fs, "appendFileSync")`.
3. **Split diff/log responsibility** (Critic A) → US-001 makes `reloadBody` own
   read + diff + both log signals + fallback; call sites just use the return.
4. **US-004 false-affordance** ("unless the optional watcher is running",
   Critic B) → reworded to "schedule/enabled/timezone changes require a restart;
   no watcher is implemented."
5. **Protected-path flag** on `scripts/cron-runtime.ts` (Critic B) → the gate
   targets deletion/deprecation; this change is additive, so an explicit
   override note + a Rollback section were added (Technical Considerations).

Medium/low findings (sync-IO tradeoff, raw-content diff, recurring
`BODY_RELOADED`, property-test contract, manual-diff README QA) are
acknowledged in the ACs and Technical Considerations. **Recommendation:
PROCEED.**
