# PRD: Pi Langfuse Upstream Shutdown Fix

## Introduction / Overview

Open Harness PR #716 now uses a pinned fork of `pi-langfuse@1.5.9`:
when the extension's bounded shutdown controller aborts an in-flight REST fallback
request, the package's upstream fix classifies that expected cancellation without
printing a misleading `Failed to flush/shutdown cleanly` stack.

This PRD prepares and records the corresponding upstream fix for
[`gooyoung/pi-langfuse`](https://github.com/gooyoung/pi-langfuse). Until the
maintainer reviews and releases it, Open Harness installs the exact
`ryaneggz/pi-langfuse` commit used by upstream PR #14. After release, the
installer can migrate from the fork pin to the upstream release directly.

### Current state

- Upstream package: `pi-langfuse@1.5.9`
- Published upstream commit: `3243208ea89d6fdc2b5f0e66660a4a626880ebd0`
- Source target: `src/langfuse.ts`, `doShutdownRuntime()` catch branch
- Upstream fix PR: [gooyoung/pi-langfuse#14](https://github.com/gooyoung/pi-langfuse/pull/14)
- Interim source: `ryaneggz/pi-langfuse@51a59c854859bbb08a43baad98f0b9eb4a94588c`
- Open Harness consumer: PR #716, issue #715
- Current behavior: bounded best-effort shutdown remains unchanged; expected
  timeout noise is suppressed, while unrelated failures remain visible

## Goals

- Eliminate the misleading shutdown stack at the upstream source.
- Preserve the existing bounded shutdown deadline and telemetry semantics.
- Keep real shutdown, network, ingestion, and cleanup errors diagnosable.
- Add a regression test that exercises the real upstream shutdown path.
- Publish a patched upstream release and provide a safe migration path from
  Open Harness's interim fork pin.

## User Stories

### US-001: Reproduce the controller-owned abort in upstream

**Description:** As an upstream maintainer, I want a deterministic regression
fixture for the shutdown timeout so that the fix is tied to the real failure
mode rather than a source-text proxy.

**Acceptance Criteria:**

- [ ] A test imports the real `doShutdownRuntime()` path through the package's
      existing test hooks (`__setRuntimeForTest()` and
      `forceShutdownRuntime()`).
- [ ] The test supplies a runtime with a fallback trace and a signal-aware
      mocked `fetch` that rejects with the abort signal's reason.
- [ ] The test uses a short shutdown timeout and deterministically reaches the
      controller abort without external credentials or a live Langfuse service.
- [ ] The test proves the rejected error is the same reason owned by the
      shutdown controller.

### US-002: Classify only the package's own shutdown abort

**Description:** As a Pi user, I want an extension-owned shutdown timeout to be
quiet so that normal Pi exits do not look like telemetry failures.

**Acceptance Criteria:**

- [ ] `doShutdownRuntime()` treats an error as expected only when the shutdown
      controller is aborted, the caught error is `controller.signal.reason`,
      and its name is `AbortError`.
- [ ] The expected path does not call `rememberRuntimeError()` or
      `console.warn()`.
- [ ] With the existing debug flag enabled, the expected path emits a concise
      bounded-timeout debug message.
- [ ] The existing shutdown deadline, operation ordering, and cleanup behavior
      are unchanged.

### US-003: Preserve diagnostics for real failures

**Description:** As a maintainer, I want unrelated shutdown failures to remain
visible so that the noise fix cannot hide broken telemetry.

**Acceptance Criteria:**

- [ ] An `AbortError` from another source whose identity is not the shutdown
      signal's reason still updates runtime error state and warns.
- [ ] A non-abort network or cleanup error still updates runtime error state and
      warns with the existing message.
- [ ] Existing score-ingestion and REST-fallback error behavior remains green.
- [ ] The new regression tests fail if the controller-identity check is removed.

### US-004: Publish and document the upstream fix

**Description:** As an upstream consumer, I want a released package and clear
release notes so that downstream integrations can stop carrying local patches.

**Acceptance Criteria:**

- [ ] The upstream repository's test suite and typecheck pass.
- [ ] The upstream change is submitted against `gooyoung/pi-langfuse` with a
      focused issue/PR description linking the shutdown reproduction.
- [ ] The maintainer publishes the next patch release after review.
- [ ] Release notes state that only the extension-owned bounded shutdown abort is
      reclassified; timeout duration and telemetry guarantees do not change.

### US-005: Remove the Open Harness workaround after release

**Description:** As an Open Harness maintainer, I want to migrate to the
upstream fix without losing the integrity guarantees added by PR #716.

**Acceptance Criteria:**

- [ ] Open Harness verifies the published upstream tarball, source behavior,
      and regression test before changing its pin.
- [ ] The installer switches to the fixed upstream version and passes the
      existing npm audit gate.
- [ ] The installer switches from the fork commit to the reviewed upstream
      release and its source-registration tests are updated for that migration.
- [ ] Integration docs explain that the upstream release contains the fix and
      no local source mutation is needed.
- [ ] Full Open Harness tests, typecheck, security audit, CI, and PR audit pass.

## Functional Requirements

- **FR-1:** The upstream catch branch must distinguish the shutdown controller's
  own abort reason from unrelated errors using signal state, reason identity,
  and `AbortError` name.
- **FR-2:** Expected controller-owned aborts must be debug-only and must not
  populate the package's last runtime error state.
- **FR-3:** All other errors must retain the current `rememberRuntimeError()` and
  warning behavior.
- **FR-4:** The fix must not increase the shutdown deadline, retry failed
  telemetry, alter REST fallback ordering, or claim that timed-out telemetry was
  delivered.
- **FR-5:** Tests must execute the real upstream shutdown function with a
  signal-aware mock rather than only asserting that source text contains a
  branch.
- **FR-6:** The upstream package must publish a new patch release from the
  reviewed source after tests pass.
- **FR-7:** Open Harness must keep the immutable fork pin until the released
  upstream package is verified; migration must be a separate, auditable change.

## Non-Goals

- No increase to Pi exit latency or shutdown timeout budget.
- No global `console.warn` interception or filtering.
- No OpenTelemetry dependency change in the upstream fix.
- No credential, privacy-preset, Langfuse deployment, Docker Compose, or Pi
  configuration changes.
- No UI changes and no browser verification requirement.
- No automatic merge or release action from Open Harness.
- No promise that a telemetry event completes after the bounded deadline.

## Design / Upstream Fix Details

The upstream change is intentionally small and remains in
`src/langfuse.ts`: `withShutdownDeadline()` receives the shutdown controller
signal only for REST fallback ingestion, then catches an error as expected only
when the signal is aborted, the error is exactly `signal.reason`, it is an
`Error`, and its name is `AbortError`. It emits a debug-only deadline message;
all other errors retain the existing runtime-error and warning path.

The upstream test mocks `fetch` so its rejection follows the supplied
`AbortSignal` and uses `signal.reason`. It asserts both observable outcomes:
expected aborts do not warn or update `getLastRuntimeError()`; unrelated aborts
still warn.

## Technical Considerations

- The upstream package is TypeScript and runs through Pi's package loader.
- The current package engine requires Node 22 or newer.
- Open Harness PR #716 verifies the fork source commit in the npm lockfile,
  user-scoped registration, expected-vs-real error behavior in the upstream
  tests, and the existing OpenTelemetry audit override.
- The interim fork pin is intentionally immutable and fail-closed; a newer
  upstream source must be reviewed before the installer pin changes.
- The upstream PR should include the exact reproduction, the focused test
  command, and the bounded-best-effort caveat.

## Success Metrics

- The original `DOMException [AbortError]` shutdown stack is absent when the
  package's own deadline aborts its request.
- Real shutdown errors remain visible in runtime status and warning output.
- Upstream tests and typecheck pass on the new release.
- Open Harness can remove its local source patch without changing user-visible
  shutdown behavior.
- No regression appears in Open Harness's full test, audit, CI, or security
  gates during migration.

## Proposed Upstream Issue / PR Summary

**Title:** `fix: classify shutdown-controller AbortError as expected timeout`

`doShutdownRuntime()` passes an `AbortSignal` to REST fallback ingestion. When
its bounded shutdown deadline fires, the signal aborts and the resulting
`AbortError` is caught by the generic shutdown handler, which records a runtime
error and prints `Failed to flush/shutdown cleanly`. This is expected deadline
behavior, not evidence of an independent runtime failure.

Please preserve the current bounded best-effort behavior, suppress only the
controller-owned abort by checking `e === controller.signal.reason`, and add a
real shutdown-path regression test covering both expected aborts and unrelated
errors.

## Open Questions

- Which next patch version will the upstream maintainer publish?
- Should the upstream issue be opened before the PR, or should the focused PR
  serve as the issue discussion?
- Does the upstream project prefer `node:test` coverage in an existing test file
  or a new shutdown-focused test file?
- After release, should Open Harness remove the patcher immediately in a
  follow-up PR or retain it for one release cycle as a compatibility fallback?
