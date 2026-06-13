# PRD: Boot-Lint Shellcheck Coverage

## Introduction

The CI **Boot Path Lint** job (`.github/workflows/ci-harness.yml:98-109`) shellchecks only
`.devcontainer/*.sh install/*.sh`. That glob expands to exactly two files
(`.devcontainer/entrypoint.sh`, `install/banner.sh`) and silently excludes five boot
scripts — including the 23 KB host-side installer `scripts/install.sh`, the Ralph runner
`scripts/ralph.sh` that autopilot depends on, and the in-sandbox `workspace/startup.sh`.
Because the job is green, it reads as "all boot shell scripts are linted" when it lints
only 2 of 7 — a silent coverage gap. A real latent warning already exists
(`SC2088` at `scripts/install.sh:225`) that this job would catch once the glob covers it.

This task fixes the one warning, extends the glob to all boot-script directories, and adds
an `evals/` probe so the coverage gap cannot silently reopen.

## Goals

- Resolve the existing `SC2088` warning in `scripts/install.sh` (display-string only; no installer behavior change).
- Extend the CI boot-lint shellcheck glob to cover `scripts/*.sh` and `workspace/*.sh` in addition to the current `.devcontainer/*.sh install/*.sh`.
- Guarantee all seven boot scripts pass `shellcheck -S warning` with zero warnings.
- Add a deterministic probe that fails if any boot-script directory is dropped from the glob.
- Record the change in `evals/RESULTS.md` and `CHANGELOG.md`.

## User Stories

### US-001: Fix the SC2088 warning in scripts/install.sh

**Description:** As a maintainer, I want `scripts/install.sh` to be shellcheck-clean so it can be added to CI lint without introducing a failure.

**Acceptance Criteria:**

- [ ] `scripts/install.sh:225` no longer triggers `SC2088`. **Approach (mandated):** add a scoped `# shellcheck disable=SC2088` comment with a one-line rationale immediately above the `die()` line, preserving the user-facing literal `~/.openharness` in the message text. Do NOT substitute `$HOME/.openharness` — the tilde is intentional display text and `$HOME` would change the message a user reads (e.g. to `/home/<user>/.openharness`), violating the no-behavior-change constraint.
- [ ] No installer logic or behavior changes — only the lint-disable comment is added; the `die()` message string is unchanged.
- [ ] `shellcheck -S warning scripts/install.sh` exits 0 with no output.

### US-002: Extend the CI boot-lint shellcheck glob and its trigger paths

**Description:** As a maintainer, I want the boot-lint job to shellcheck every boot script **and to actually fire when those scripts change**, so bugs in `scripts/` and `workspace/` are caught in CI.

**Acceptance Criteria:**

- [ ] The shellcheck invocation in `.github/workflows/ci-harness.yml` includes all four glob segments: `.devcontainer/*.sh`, `install/*.sh`, `scripts/*.sh`, `workspace/*.sh`.
- [ ] `workspace/**` is added to BOTH the `on.push.paths` and `on.pull_request.paths` arrays in `.github/workflows/ci-harness.yml` (so a `workspace/`-only commit triggers the workflow — the path filters are workflow-level and currently omit `workspace/**`, which would leave the new `workspace/*.sh` coverage dead). `scripts/**`, `.devcontainer/**`, and `install/**` are already present in both arrays — leave them as-is.
- [ ] The hadolint step and all `ci` job steps are unchanged.
- [ ] Running `shellcheck -S warning .devcontainer/*.sh install/*.sh scripts/*.sh workspace/*.sh` from the repo root exits 0 (all seven boot scripts clean) after US-001 lands.

### US-003: Add the boot-lint-glob coverage probe

**Description:** As a maintainer, I want a probe that fails if a boot-script directory is ever dropped from the lint glob, so the coverage gap cannot silently reopen.

**Acceptance Criteria:**

- [ ] `evals/probes/boot-lint-glob.sh` exists, is executable, starts with `#!/usr/bin/env bash` and `set -euo pipefail`, and carries the standard probe header comments (`# tier:`, `# source: issue #90`, `# desc:`).
- [ ] It locates the `shellcheck -S warning ...` invocation line in `.github/workflows/ci-harness.yml` and asserts that line contains each of `.devcontainer/`, `install/`, `scripts/`, `workspace/`. **Match the line unanchored** (e.g. `grep -E 'shellcheck -S warning'`) — the line is indented inside a `run: |` block, so a `^` line-start anchor would match nothing and produce a false verdict.
- [ ] Exit codes follow the 3-state oracle: `0` = PASS (all four present), `1` = REGRESSION (any missing — the missing dir(s) printed to stderr), `2` = SKIPPED (workflow file absent).
- [ ] No false PASS on a zero-match: if the workflow file EXISTS but no `shellcheck -S warning` invocation line is found, the probe exits `1` (REGRESSION), never `0`.
- [ ] SKIPPED path is real: renaming or removing `.github/workflows/ci-harness.yml` makes the probe exit `2` (not `0` and not `1`).
- [ ] `bash evals/probes/boot-lint-glob.sh` exits 0 against the repo after US-002; deleting one glob segment makes it exit 1.
- [ ] The probe asserts **directory-prefix presence in the glob**, not file count, and assumes the shellcheck invocation is a single shell line (a future multi-line YAML block-scalar reformat is an acknowledged, documented limitation — see Non-Goals — not a case the probe must handle).

### US-004: Refresh evals/RESULTS.md and CHANGELOG.md

**Description:** As a maintainer, I want the benchmark and changelog to reflect the new probe and fix so the work is traceable.

**Acceptance Criteria:**

- [ ] `evals/RESULTS.md` contains a row/entry for `boot-lint-glob` showing a PASS verdict (regenerated by the eval runner, not hand-faked).
- [ ] `CHANGELOG.md` has a one-line entry under `## [Unreleased]` → `### Fixed`, imperative mood, referencing issue #90.
- [ ] No unrelated probe rows are removed from `evals/RESULTS.md`.
- [ ] The pre-existing `next-dev-prod` REGRESSION row (red before this task started) is left untouched — it is out of scope and is NOT a regression introduced by this work; only the `boot-lint-glob` row is expected to change status (absent → PASS).

## Functional Requirements

- FR-1: `scripts/install.sh` must pass `shellcheck -S warning` with zero findings.
- FR-2: The `ci-harness.yml` boot-lint shellcheck command must lint `.devcontainer/*.sh`, `install/*.sh`, `scripts/*.sh`, and `workspace/*.sh`.
- FR-3: `evals/probes/boot-lint-glob.sh` must implement the PASS(0)/REGRESSION(1)/SKIPPED(2) contract and assert all four directory prefixes are present in the glob line.
- FR-4: `evals/RESULTS.md` must be regenerated by the eval runner to include the new probe.
- FR-5: `CHANGELOG.md` must record the fix under `[Unreleased] → Fixed` with an issue-#90 reference.

## Non-Goals

- Container end-to-end boot smoke test (build + run the entrypoint in CI).
- Linting shell scripts outside the boot path (e.g. ad-hoc scripts elsewhere in the tree).
- A cron-runtime watchdog or any other reliability finding from the same audit.
- Any change to installer logic or behavior beyond the SC2088 lint-disable comment.
- Changing the shellcheck severity level (`-S warning` stays as-is).
- **Pinning the shellcheck version in CI.** The runner installs shellcheck unpinned via `apt`; `ubuntu-latest` currently ships 0.9.0 (the verification baseline). Version-drift risk is an explicitly accepted, known risk — out of scope for this task.
- **Guarding the matched file count.** The probe asserts directory-prefix coverage in the glob, not "exactly N files". If `install/cloudflared-tunnel.sh` (protected but absent on disk) is ever restored, the existing `install/*.sh` glob picks it up automatically; the "7/7 scripts" figure in Success Metrics is descriptive of current disk state, not a guarded invariant.
- **Probe resilience to a multi-line reformat of the shellcheck step.** The probe assumes the invocation is a single shell line. A future YAML block-scalar reformat could produce a false REGRESSION; that is a documented limitation, not a supported case.

## Technical Considerations

- Probe format reference: `evals/probes/skill-paths.sh` and `evals/probes/owned-surface-guard.sh` (header comment block, `ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"`, stderr messages, `exit 0|1|2`).
- The eval runner discovers `evals/probes/*.sh` automatically; `evals/RESULTS.md` is produced by `/eval` — do not hand-edit verdict rows.
- Verified pre-work facts: only `scripts/install.sh` (the SC2088 at line 225) is non-clean among the five currently-unlinted scripts; `scripts/ablate.sh`, `scripts/harness-config.sh`, `scripts/ralph.sh`, and `workspace/startup.sh` already pass `shellcheck -S warning` cleanly (shellcheck 0.9.0, matching `ubuntu-latest`).
- `install/` already exists and contains `banner.sh`; the existing two-segment glob is correct, only incomplete.
- Path filters in `ci-harness.yml` are workflow-level (apply to both the `ci` and `boot-lint` jobs). `scripts/**`, `.devcontainer/**`, and `install/**` are already in both `push.paths` and `pull_request.paths`; only `workspace/**` is missing (added in US-002).
- The path filter uses `workspace/**` (recursive — fires on any workspace file change) while the shellcheck glob uses `workspace/*.sh` (flat — only top-level shell scripts). This level difference is intentional; do not "normalize" the path filter to `workspace/*.sh` or it stops triggering on subdirectory changes.
- **Rollback:** revert the shellcheck line in `ci-harness.yml` to the original two-segment glob (`.devcontainer/*.sh install/*.sh`); the `boot-lint-glob` probe will immediately exit 1 (REGRESSION), giving a visible signal that coverage was rolled back.

## Success Metrics

- Boot Path Lint covers 7/7 boot scripts instead of 2/7.
- `boot-lint-glob` probe is green and guards the glob against future regression.
- Zero new CI warnings introduced by the extended glob.

## Open Questions

- None — scope is fully specified by the plan and verified against live shellcheck output.

## Critic Review

Two adversarial critics (implementer + user lens) reviewed this PRD before any
GitHub state was created. Round 1 surfaced one SEVERITY:H finding — the boot-lint
glob extension is dead for `workspace/`-only commits unless `workspace/**` is also
added to the workflow `paths:` triggers — which was mitigated by adding an explicit
US-002 acceptance criterion. A re-review returned PROCEED with no remaining
high-severity findings; residual medium/low papercuts were either folded into the
acceptance criteria (probe `^`-anchor / false-PASS guards, single SC2088 fix
approach) or acknowledged as Non-Goals (shellcheck version-pin, file-count
guarding). See `critique.md` for the full record.
