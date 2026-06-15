# PRD: ralph.sh Runner Test Coverage

## Introduction

`scripts/ralph.sh` is the Ralph loop runner that the autopilot loop (`/autopilot` §5) depends on as its throttle-resilient implementation executor. Today it has **zero automated tests** — `scripts/__tests__/` covers `cron-runtime.ts` and `harness-config.sh` but not `ralph.sh`. A regression in the runner is caught only in production, on the next autopilot run.

This task adds hermetic vitest coverage for `ralph.sh`'s deterministic, side-effect-free surface: argument parsing, taskdesc validation, the four-file contract, and (optionally, behind a behavior-preserving source guard) the resilience functions that the throttle-fallback story relies on. The proven pattern is `scripts/__tests__/harness-config.test.ts`, which invokes a shell script via `spawnSync` and asserts on stdout/stderr/exit-status.

## Goals

- Add `scripts/__tests__/ralph.test.ts` exercising `ralph.sh`'s validation contract black-box (no harness/network/tmux required).
- Assert exact exit codes: `2` for usage/arg errors, `1` for missing task dir / missing contract files.
- Optionally unit-test the resilience functions (`claude_limit_detected`, `fallback_after_harness`, `normalize_harness`, `resolve_initial_harness`) via a behavior-preserving source guard.
- Keep every real `ralph.sh` invocation path byte-for-byte behaviorally unchanged.
- Tests run under the existing `pnpm test:scripts` / `ci-harness.yml` job — no CI workflow change.

## User Stories

### US-001: Black-box argument-validation tests

**Description:** As a harness maintainer, I want `ralph.sh`'s argument parsing covered by tests so that a regression in `parse_args`/`normalize_harness` fails CI instead of breaking the next autopilot run.

**Acceptance Criteria:**

- [ ] `scripts/__tests__/ralph.test.ts` exists, modeled on `harness-config.test.ts` (vitest, `spawnSync`, temp-dir fixtures).
- [ ] A `run(args: string[], opts?: { env?: NodeJS.ProcessEnv, cwd?: string })` helper invokes `bash scripts/ralph.sh` (MUST be `bash`, not `sh` — `ralph.sh` uses `[[ … ]]`, `BASH_SOURCE`, arrays, `PIPESTATUS`) and returns `{ stdout, stderr, status }`.
- [ ] Asserts `--harness=foo` (unknown) → exit `2`, stderr matches `/unknown harness/` (message confirmed at `scripts/ralph.sh:69`).
- [ ] Asserts `--harness` with no value AND no `RALPH_HARNESS` in the child env → exit `2`, stderr matches `/requires a value/` (the empty-value check at `scripts/ralph.sh:86-88` fires, not a `set -e` crash).
- [ ] Asserts zero positional args → exit `2` (usage printed to stderr).
- [ ] Asserts more than one positional arg → exit `2`.
- [ ] Asserts taskdesc not matching `^[a-z0-9-]+$` (e.g. `Bad_Name`) → exit `2`, stderr matches `/must match/` (message at `scripts/ralph.sh:354`).
- [ ] `pnpm test:scripts` passes; no pre-existing suite regresses.

### US-002: Four-file contract tests

**Description:** As a harness maintainer, I want the four-file contract enforcement tested so that a silent change to the required-files check is caught.

**Acceptance Criteria:**

- [ ] **Hermeticity mechanism (load-bearing):** the child MUST be spawned with `cwd` set to a non-git temp dir, e.g. `spawnSync("bash", [SCRIPT, ...args], { cwd: tmpDir, env: { ...process.env, REPO_ROOT: tmpDir } })`. Normal mode re-derives `REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"` at `scripts/ralph.sh:358` and **ignores** the env var, so `cwd` (a dir where `git rev-parse` fails and falls back to `pwd`) is what actually points the task-dir lookup at the fixture. `mkdtempSync(os.tmpdir())` is non-git, satisfying this.
- [ ] Using `mkdtempSync` fixtures, a valid taskdesc with a **missing** `tasks/<desc>/` dir → exit `1`, stderr matches `/does not exist/`.
- [ ] With the task dir present but each one of `{prd.md, prd.json, prompt.md, progress.txt}` omitted in turn → exit `1`, stderr matches `/is missing/`. May be implemented as a sub-loop over the four filenames; the required outcome is four separate assertions, one per missing file.
- [ ] **No harness stub required:** the task-dir check (`scripts/ralph.sh:361`) and four-file check (`:369`) execute BEFORE harness resolution (`:375`) — verified empirically that these branches return exit `1` with no `claude`/`codex` on `PATH`. Do NOT add a harness stub for these cases.
- [ ] Tests are hermetic — no network, no `claude`/`codex`/`pi`/`tmux` dependency; the temp `cwd` keeps the real repo untouched.
- [ ] `pnpm test:scripts` passes.

### US-003: Behavior-preserving source guard (conditional)

**Description:** As a harness maintainer, I want to `source` `ralph.sh` to call its functions in isolation, without launching the loop, so that the resilience functions can be unit-tested.

**Acceptance Criteria:**

- [ ] `ralph.sh` is modified so that `source`-ing it defines its functions WITHOUT executing the top-level normal-mode body (standard `[ "${BASH_SOURCE[0]}" = "$0" ]` idiom, or equivalent).
- [ ] The guard is a strict no-op for all three real invocation paths, each verified: (1) direct `scripts/ralph.sh <slug>` — `bash scripts/ralph.sh Bad_Name` still exits `2`; (2) the internal `bash "$SCRIPT_PATH" --loop …` re-entry (`scripts/ralph.sh:279`) still enters loop mode; (3) the no-tmux foreground fallback (`scripts/ralph.sh:389`, `exec bash "$SCRIPT_PATH" --loop …`) still transitions to `--loop` mode.
- [ ] If a clean guard proves infeasible (e.g. `set -euo pipefail` fires noisily on source), this story is dropped, **US-004 is skipped entirely**, and `ralph.sh` is left unchanged (see Non-Goals).

### US-004: Resilience-function unit tests (depends on US-003)

**Description:** As a harness maintainer, I want the throttle-detection and fallback logic unit-tested so that the autopilot's documented resilience guarantee (memory 2026-06-12) is regression-guarded.

**Gate:** This story is implemented ONLY if US-003's source guard lands cleanly. If US-003 is dropped, **skip US-004 entirely** — do not attempt partial coverage.

**Acceptance Criteria:**

- [ ] `claude_limit_detected`: the function ANDs two greps (`scripts/ralph.sh:182`: `hit (your |the )?limit` AND `resets?`). Positive fixture MUST contain BOTH phrases (e.g. "hit your limit … resets now") → success (exit 0). Include a negative case where only ONE of the two phrases is present → failure (exit 1), proving the AND-logic (not just the empty-input boundary). Ordinary output with neither phrase → failure (exit 1).
- [ ] `fallback_after_harness`: with a fake `codex` on `PATH`, `claude`→`codex` and `pi`→`codex`; with `codex` absent, non-zero return + stderr matches `/not on PATH/`; an unsupported harness (e.g. `opencode`) → non-zero return + stderr matches `/no fallback/`.
- [ ] `normalize_harness`: each of `claude|pi|codex|opencode|deepagents` echoes the value; an invalid value → exit `2`, stderr matches `/unknown harness/`.
- [ ] PATH stubs use an executable shell file named `codex` (`#!/usr/bin/env bash` + `exit 0`) in a temp dir prepended to `PATH`.
- [ ] At least one positive and one negative assertion per function.
- [ ] `pnpm test:scripts` passes.

## Functional Requirements

- FR-1: Add a new test file `scripts/__tests__/ralph.test.ts` using vitest and `node:child_process` `spawnSync`, mirroring `harness-config.test.ts`.
- FR-2: All tests MUST be hermetic — pass a temp `REPO_ROOT` env var so `git rev-parse` / task-dir lookups resolve inside the fixture, never the live repo.
- FR-3: Black-box cases MUST assert the exact integer exit code, not merely non-zero.
- FR-4: Any edit to `scripts/ralph.sh` MUST be limited to a source guard that preserves runtime behavior for all three documented invocation paths.
- FR-5: No new dependencies; no change to `ci-harness.yml` (it already runs `test:scripts`).

## Non-Goals

- Integration tests that actually launch a harness (`claude`/`codex`/`pi`/`opencode`/`deepagents`) or a real tmux session/loop.
- Any change to `ralph.sh`'s CLI contract, flags, output text, or runtime behavior. The ONLY permitted `ralph.sh` edit is the US-003 behavior-preserving source guard.
- **Conditional-drop branch (documented, not an in-flight judgment call):** if `source`-ing `ralph.sh` with `set -euo pipefail` active produces noise or any behavior change that cannot be cleanly isolated, US-003 and US-004 are BOTH dropped and US-001/US-002 (black-box) ship alone — `ralph.sh` is left unchanged. This is the accepted fallback, not a failure.
- Testing the `--loop` iteration body end-to-end, and the `--loop` re-entry path's argument handling beyond confirming the US-003 guard does not break it (it requires a live harness).
- Coverage of `require_harness_command` (`scripts/ralph.sh:122-130`) and `resolve_initial_harness`'s on-PATH success branch — both depend on real/stubbed harness binaries on `PATH` and are deferred; US-004 covers the pure resilience functions only.
- CI workflow / GitHub Actions changes (`ci-harness.yml` already runs `test:scripts`).
- Coverage of `cron-runtime.ts` or `harness-config.sh` (already tested).

## Technical Considerations

- **Pattern to reuse:** `scripts/__tests__/harness-config.test.ts` — `spawnSync("sh", [SCRIPT, ...args])`, `mkdtempSync`/`rmSync` fixtures in `beforeEach`/`afterEach`.
- **Invoke with bash, not sh:** `ralph.sh` uses bash-only features (`[[ … ]]`, `BASH_SOURCE`, arrays, `PIPESTATUS`); invoke via `spawnSync("bash", [SCRIPT, ...])`.
- **REPO_ROOT injection:** normal mode resolves `REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"`. Pass `REPO_ROOT` in the child env and run with `cwd` set to the temp dir so the four-file/task-dir checks resolve against the fixture.
- **Avoid tmux side effects:** all targeted black-box cases bail (exit 1/2) *before* the tmux launch at line 379+, so no tmux session is ever created. Do not add a case that passes all validation (it would launch a session).
- **Fake binaries for PATH stubs (US-004):** create an executable shell stub named `codex` in a temp dir and prepend it to `PATH` for the relevant assertions.

## Success Metrics

- `ralph.sh`'s validation contract is regression-guarded: a change that alters an exit code or removes a check fails `pnpm test:scripts`.
- New tests add < ~2s to the `test:scripts` run and require no network or external CLI.
- Zero behavioral change to `ralph.sh` for production invocations (verified by the black-box suite still passing against the guarded script).

## Open Questions

- None blocking. US-003/US-004 are explicitly conditional: if the source guard cannot be made a clean no-op, ship US-001/US-002 (black-box) alone — they already cover the full CLI validation contract.

## Critique Resolution

Two critics (implementer + user lens) reviewed this PRD before any issue/branch was created; full output in `critique.md`. Result: **PROCEED** — no protected-path violations, no destructive operations.

- **2 high-severity findings**, both resolved at the AC level: (1) US-002 harness-ordering claim — **REFUTED empirically** (task-dir/four-file checks at `ralph.sh:361/369` precede harness resolution at `:375`; verified exit `1` with no harness on `PATH`, so no stub is needed); (2) US-002 `REPO_ROOT` hermeticity — **CONFIRMED and mitigated** (the child must run with `cwd` = a non-git temp dir because `ralph.sh:358` re-derives `REPO_ROOT` and ignores the env var; folded into US-002 AC).
- **8 medium + 5 low findings** folded into revised ACs: message-locking (`/requires a value/`, `/must match/`, `/unknown harness/`, `/no fallback/`), `bash`-not-`sh` constraint, explicit `run()` signature, third invocation-path verification for US-003, US-004 skip-gate when US-003 is dropped, `claude_limit_detected` AND-logic with a one-phrase negative case, and the conditional-drop branch + deferred-coverage notes added to Non-Goals.
