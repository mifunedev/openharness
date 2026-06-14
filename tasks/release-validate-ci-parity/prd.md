# PRD: Mirror CI boot-lint and eval-probes gates into release.yml

## Introduction

`.github/workflows/release.yml` runs a `validate` job before the `release` job
publishes an immutable image to GHCR (`ghcr.io/mifunedev/openharness:<VERSION>`)
and cuts a GitHub Release. That `validate` job today replicates only the steps of
`ci-harness.yml`'s `ci` job (lint / format / typecheck / build / test / root-tests).
It **omits** the two other gates that `ci-harness.yml` enforces on every branch and
PR: `boot-lint` (shellcheck over boot scripts + hadolint over `.devcontainer/Dockerfile`)
and `eval-probes` (the context-fitness probe regression gate). Because the `release`
job depends on `needs: [validate]` only, a tag can publish an image whose own
Dockerfile and boot scripts were never linted and whose eval probes never ran.

This task brings the release validate gate to parity with CI by adding the missing
two jobs to `release.yml` and gating the `release` job on all three. It also corrects
`context/rules/git.md`, which already (falsely) claims the validate job runs
"mirroring CI".

## Goals

- Add a `boot-lint` job to `release.yml` matching `ci-harness.yml`'s `boot-lint`.
- Add an `eval-probes` job to `release.yml` matching `ci-harness.yml`'s `eval-probes`.
- Gate the `release` (GHCR publish + GitHub Release) job on all three jobs.
- Make `context/rules/git.md`'s description of the validate gate accurate.
- Record the change in `CHANGELOG.md` under `[Unreleased]`.
- Introduce **no** change to `ci-harness.yml` behavior and **no** sandbox application code.

## User Stories

### US-001: Add boot-lint job to release.yml

**Description:** As a release engineer, I want the release pipeline to shellcheck the boot scripts and hadolint the Dockerfile it is about to build, so a lint regression cannot ship in a published image.

**Acceptance Criteria:**

- [ ] `.github/workflows/release.yml` defines a top-level job `boot-lint` whose steps match `.github/workflows/ci-harness.yml`'s `boot-lint` job: a "Shellcheck boot scripts" step running `shellcheck -S warning .devcontainer/*.sh install/*.sh scripts/*.sh workspace/*.sh` (with the same shellcheck-install guard) and a "Hadolint Dockerfile" step using the same SHA-pinned `hadolint/hadolint-action`, `dockerfile: .devcontainer/Dockerfile`, `config: .hadolint.yaml`, `failure-threshold: warning`.
- [ ] The job runs on `ubuntu-latest` and checks out the repo (`actions/checkout@v4`).
- [ ] The job declares `permissions:` with `contents: read` (least-privilege; matches the `validate` job's job-level convention and ci-harness's effective workflow-level permission). [critic A/B H]
- [ ] Structural validity (deterministic, no extra deps — PyYAML/js-yaml/ruby are NOT in the sandbox): `grep -E '^  boot-lint:' .github/workflows/release.yml` matches; the shellcheck glob and the SHA-pinned hadolint step are present (`grep -F 'hadolint/hadolint-action' …`, `grep -F '.hadolint.yaml' …`, `grep -F 'failure-threshold: warning' …`). GitHub's parse-on-push is the authoritative YAML check.
- [ ] No change to `ci-harness.yml`.

### US-002: Add eval-probes job to release.yml

**Description:** As a release engineer, I want the release pipeline to run the eval probe regression gate, so a probe regression is caught before the image and Release ship.

**Acceptance Criteria:**

- [ ] `.github/workflows/release.yml` defines a top-level job `eval-probes` whose steps match `.github/workflows/ci-harness.yml`'s `eval-probes` job: checkout (`actions/checkout@v4`) then a single step running `bash .claude/skills/eval/run.sh`.
- [ ] The job runs on `ubuntu-latest` and declares `permissions:` with `contents: read`. [critic A/B H]
- [ ] Structural validity: `grep -E '^  eval-probes:' .github/workflows/release.yml` matches and `grep -F 'bash .claude/skills/eval/run.sh' …` matches.
- [ ] No change to `ci-harness.yml` and no change to `.claude/skills/eval/run.sh`.

### US-003: Gate the release job on all three gate jobs

**Description:** As a release engineer, I want the GHCR publish + GitHub Release step blocked unless validate, boot-lint, and eval-probes all pass, so the publish never proceeds on a partially-green pipeline.

**Acceptance Criteria:**

- [ ] The `release` job's `needs:` lists exactly `validate`, `boot-lint`, and `eval-probes` (order not significant). GitHub's `needs:` semantics require all three to **succeed** (not merely finish) before `release` starts.
- [ ] The `validate` job is unchanged in its steps.
- [ ] Every job named in any `needs:` is defined in the file (no dangling dependency): assert with a grep that each of `validate`, `boot-lint`, `eval-probes` exists as a top-level job key.

### US-004: Update git.md rule and CHANGELOG

**Description:** As a maintainer, I want the release documentation to accurately describe the validate gate and the change recorded in the changelog.

**Acceptance Criteria:**

- [ ] The sentence in `context/rules/git.md` that currently says the validate job runs "lint, format check, build, test, and the root-scripts tests (mirroring CI)" is updated to enumerate the now-true gate set: lint, format check, build, test, root-scripts tests, boot-path lint (shellcheck + hadolint), and eval-probe regression — still ending "(mirroring CI)".
- [ ] The git.md change is made with a **targeted edit** to that one sentence (no whole-file rewrite). `context/rules/git.md` is on `.claude/protected-paths.txt` (as the `.claude/rules/git.md` symlink) — this is a documentation-accuracy edit, NOT a deletion, so it does not violate the protected-path gate; the targeted-edit constraint guards against accidental truncation. [critic A/B M, PROTECTED-PATH]
- [ ] `CHANGELOG.md` has a new bullet under `## [Unreleased]` > `### Changed` describing the release-gate parity change and linking `#111` (issue confirmed to exist).
- [ ] No other behavioral content in `git.md` is altered (verify with `git diff` that only the one sentence changed).

## Functional Requirements

- FR-1: `release.yml` MUST define jobs `boot-lint` and `eval-probes` that are step-faithful copies of the same-named jobs in `ci-harness.yml`.
- FR-2: The `release` job MUST declare `needs: [validate, boot-lint, eval-probes]`.
- FR-3: All jobs referenced by any `needs:` MUST be defined in `release.yml`.
- FR-4: `release.yml` MUST remain valid YAML and a valid GitHub Actions workflow.
- FR-5: `context/rules/git.md` MUST accurately enumerate the validate-time gates.
- FR-6: `CHANGELOG.md` MUST record the change under `[Unreleased]`.

## Non-Goals (Out of Scope)

- No change to `ci-harness.yml` behavior, triggers, or jobs.
- No change to the release versioning, tagging, or promotion flow (`release` job's build/push/Release steps unchanged except its `needs:`).
- No new or modified eval probes; no change to `eval/run.sh`.
- No sandbox application code.
- No change to the hadolint SHA pin or `.hadolint.yaml` content.

## Technical Considerations

- The reference jobs live at `.github/workflows/ci-harness.yml:101-131`. Copy them faithfully; do not "improve" them — divergence between the two files is itself a future drift hazard.
- The three gate jobs (`validate`, `boot-lint`, `eval-probes`) run in parallel; only `release` waits on all three via `needs:`. GitHub's `needs:` requires every listed job to **succeed** before the dependent job starts.
- These jobs already run green on clean `ubuntu-latest` GitHub runners in `ci-harness.yml`, so mirroring them carries no host-state risk (e.g. runtime-state probes that flip red on a developer host are not a concern on a fresh runner). **Empirically verified**: the `Eval Probe Regression Gate` and `Boot Path Lint` jobs both succeeded on the `development` branch runner (ci-harness run 27486297602, 2026-06-14T02:46Z).
- **Why the eval-probes gate will not jam releases** (critic A/B H): `.claude/skills/eval/run.sh` exits non-zero only on a green→red *delta* — the regression fires (run.sh:106) **only** when a probe's prior status in the committed `evals/RESULTS.md` was `PASS` and its fresh status is non-PASS and non-SKIPPED. `next-dev-prod` is committed as `REGRESSION` (a developer-host artifact), so its prior is not `PASS` and it can **never** trigger a block. A newly-added probe committed as `(not run)`/`REGRESSION` likewise cannot block; only a probe committed as `PASS` that is genuinely red on a fresh runner would — so validate any new probe in `ci-harness.yml` before committing its `PASS` row.
- `run.sh` writes `evals/RESULTS.md` to the ephemeral runner workspace and is not committed (identical to ci-harness's `eval-probes` job) — the write is benign.
- **YAML validation**: no YAML parser ships in the sandbox (no PyYAML, js-yaml, or ruby), so local AC verification uses deterministic structural grep; GitHub parses `release.yml` authoritatively on push (a malformed workflow surfaces on the Actions page / `gh workflow view "Release"`).
- **CI coverage of this PR**: `ci-harness.yml` triggers on `context/**`, so editing `context/rules/git.md` runs CI for this branch. Note `release.yml` itself is *not* in ci-harness's path filters; adding it would be a change to `ci-harness.yml`, which is a Non-Goal here (tracked as an Open Question).

## Escape hatch / rollback

- The `release` job becomes a hard dependency on all three gate jobs. If a gate fails for an infrastructure reason (action download flake, apt-get timeout, probe timeout), the publish is blocked. Recovery does **not** require deleting/re-pushing the tag: use GitHub Actions → the failed run → **"Re-run failed jobs"**. (`release.yml` intentionally has no `workflow_dispatch` trigger; it fires on tag push only.)
- Full rollback of this change is a one-commit revert of `release.yml` (+ git.md/CHANGELOG); no GitHub-side state is created by the gate jobs themselves.
- There is no unit-test harness for workflow YAML; verification is YAML-parse + grep-based AC checks.

## Success Metrics

- A release tag cannot publish to GHCR unless shellcheck, hadolint, and the eval probe suite all pass.
- `context/rules/git.md`'s "mirroring CI" claim is literally true.

## Open Questions / Deferred follow-ups

- **Drift guard (deferred — out of scope here):** `evals/probes/eval-ci-gate.sh` asserts `bash .claude/skills/eval/run.sh` appears in `ci-harness.yml` only; after this change the same invocation also lives in `release.yml` but is unguarded, so the two files can silently re-diverge. Adding a probe to assert the release.yml copy is a sensible follow-up but is a Non-Goal here (no new probes). File a separate `autopilot` ticket if desired.
- **ci-harness path coverage (deferred):** `release.yml` is not in `ci-harness.yml`'s path filters, so a future edit to `release.yml` alone would not run CI. Adding it is a `ci-harness.yml` change (Non-Goal). Tracked here for visibility.

## Critic gate

Two critics (implementer + user lens) reviewed this PRD before scaffolding. They raised 4 high-severity findings across 2 themes — eval-probes-as-a-hard-release-gate and missing per-job `permissions:` — both fully mitigated at the acceptance-criteria level (eval-probes proven safe empirically + by the `run.sh` delta logic; `permissions: contents: read` added per job). All medium/low findings were folded into the ACs, Technical Considerations, or the deferred follow-ups above. The `context/rules/git.md` protected-path flag is an edit, not a deletion, and is gated to a targeted edit. Recommendation: **PROCEED**. Full review in `critique.md`.
