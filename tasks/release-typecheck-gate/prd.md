# PRD: Extend Typecheck Gate to release.yml Validate Job

## Introduction

The release workflow's `validate` job (`.github/workflows/release.yml`) does not
run a TypeScript typecheck, even though the PR-time CI workflow
(`.github/workflows/ci-harness.yml`) does. A type error that `ci-harness.yml`
catches on a pull request can therefore slip into a tagged release image
published to GHCR. This task closes that follow-up gap by mirroring the two
typecheck steps that merged PR #52 added to `ci-harness.yml` into the release
validate job, so the release pipeline becomes a strict superset of the PR
pipeline's correctness checks.

## Goals

- Add the workspace typecheck step (`pnpm --filter './packages/**' -r
  --if-present run typecheck`) to `release.yml`'s validate job.
- Add the `packages/oh` standalone typecheck step (`npm --prefix packages/oh ci`
  then `npm --prefix packages/oh run typecheck`) to the same job — closing the
  `pnpm-filter-workspace-trap` where `packages/oh` is silently skipped by the
  pnpm filter.
- Preserve exact step naming and ordering parity with `ci-harness.yml` so the
  two workflows read as parallel pipelines.
- Record the change in `CHANGELOG.md`.

## User Stories

### US-001: Add workspace typecheck step to release validate job

**Description:** As a release maintainer, I want `release.yml`'s validate job to
typecheck the workspace packages so a TypeScript error cannot ship in a tagged
image.

**Acceptance Criteria:**

- [ ] A step named `Typecheck (workspace packages)` exists in `release.yml`'s
      `validate` job, placed AFTER the `Format check` step and BEFORE the
      `Build` step.
- [ ] Its `run` is byte-identical to `ci-harness.yml`'s workspace typecheck:
      `pnpm --filter './packages/**' -r --if-present run typecheck`.
- [ ] YAML remains valid (workflow parses).

### US-002: Add packages/oh standalone typecheck step

**Description:** As a release maintainer, I want the npm-standalone `packages/oh`
package typechecked too, because the pnpm workspace filter silently skips it.

**Acceptance Criteria:**

- [ ] A step named `Typecheck (oh CLI — npm standalone)` exists immediately AFTER
      the US-001 step and BEFORE `Build`.
- [ ] Its `run` is a multi-line block containing, in order, `npm --prefix
      packages/oh ci` then `npm --prefix packages/oh run typecheck` — mirroring
      `ci-harness.yml` L83-86 exactly.
- [ ] The `npm --prefix packages/oh ci` install precedes the typecheck command
      (deps installed before typecheck runs).
- [ ] YAML remains valid (workflow parses).

### US-003: Verify step order and scope-guard parity

**Description:** As a release maintainer, I want the validate job's step order to
match the PR pipeline so the two stay legible, and I want assurance no other
check drifted.

**Acceptance Criteria:**

- [ ] `release.yml` validate step order is exactly: `Lint` → `Format check` →
      `Typecheck (workspace packages)` → `Typecheck (oh CLI — npm standalone)` →
      `Build` → `Test` → `Root tests (scripts + .pi extensions)` (use the full
      canonical step name as it appears in `release.yml`, not a truncation).
- [ ] Scope guard: confirm no OTHER step present in `ci-harness.yml`'s **validate
      job** (beyond the two typecheck steps) is missing from `release.yml`'s
      validate job. Note: `ci-harness.yml`'s `boot-lint` job (shellcheck +
      hadolint) is a SEPARATE job, not part of the validate job — it is out of
      scope for this guard. If a genuine validate-job gap is found, record it in
      Open Questions rather than fixing it in this task.

### US-004: Record the change in CHANGELOG.md

**Description:** As a maintainer, I want the change recorded so the release notes
reflect that the release validate job now typechecks before building.

**Acceptance Criteria:**

- [ ] One bullet exists under `### Changed` within the `## [Unreleased]` block of
      `CHANGELOG.md` stating that `release.yml`'s validate job now runs a
      typecheck (workspace + `packages/oh` standalone) before building the image.
- [ ] The bullet is APPENDED to the EXISTING `### Changed` subsection under
      `## [Unreleased]` (it already exists — do not create a second `### Changed`
      heading). Create the subsection only if it is genuinely absent.
- [ ] The entry links issue #53 (already filed) per the changelog convention;
      linking the PR number instead is also acceptable.

## Functional Requirements

- FR-1: `release.yml`'s `validate` job MUST run `pnpm --filter './packages/**' -r
  --if-present run typecheck` between `Format check` and `Build`.
- FR-2: `release.yml`'s `validate` job MUST run `npm --prefix packages/oh ci`
  followed by `npm --prefix packages/oh run typecheck` immediately after FR-1's
  step and before `Build`.
- FR-3: Step `name:` and `run:` values MUST match `ci-harness.yml` exactly — the
  workspace step mirrors L80-81 (name + single-line run) and the standalone step
  mirrors L83-86 (name + the two-line `run:` block `npm --prefix packages/oh ci`
  then `npm --prefix packages/oh run typecheck`). Do not copy the `name:` line
  into the `run:` block.
- FR-4: `CHANGELOG.md` MUST gain one `### Changed` bullet appended to the
  existing `[Unreleased]` `### Changed` subsection.
- FR-5: After editing, `release.yml` MUST parse as valid YAML — verify locally,
  e.g. `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/release.yml'))"`
  (a YAML error in a workflow file fails silently until a tag is pushed).

## Non-Goals

- Do NOT modify `ci-harness.yml` (it is already correct).
- Do NOT touch `scripts/`, `.devcontainer/`, or the `release.yml` build/release
  jobs.
- Do NOT add SHA-pinning of actions or buildx layer caching (separate concerns).
- Do NOT refactor or reorder existing `release.yml` steps beyond inserting the
  two new typecheck steps.

## Technical Considerations

- `packages/oh` is intentionally excluded from the pnpm workspace (it is
  npm-standalone); `pnpm --filter './packages/**'` therefore never reaches it.
  This is the documented `pnpm-filter-workspace-trap` in `memory/MEMORY.md` — the
  standalone `npm --prefix packages/oh` step is the only thing that typechecks
  it, so US-002 is not optional.
- Source of truth to mirror: `.github/workflows/ci-harness.yml` lines 80-86.
- Insertion target: `.github/workflows/release.yml`, between the `Format check`
  step and the `Build` step in the `validate` job.

## Success Metrics

- A TypeScript error introduced anywhere a typecheck script covers would fail the
  release `validate` job, preventing the image build — verifiable by inspecting
  the workflow run on a release tag.
- `release.yml` validate job is a superset of `ci-harness.yml` validate job's
  correctness checks.

## Open Questions

- None blocking. (If the US-003 scope guard surfaces an additional missing
  validate-job check, record it here for a follow-up ticket rather than
  expanding this task's scope.)
- Known parity gap (out of scope): `ci-harness.yml` has a `boot-lint` job
  (shellcheck + hadolint) with no release.yml counterpart. Candidate follow-up
  ticket; do NOT address here.
- Known parity gap (out of scope): neither workflow caches the `~/.npm` store for
  `packages/oh ci`. Candidate follow-up if release validate time grows.

## Critic Review

Two critics (implementer + user lens) reviewed this PRD before any GitHub state
was created — see `critique.md`. **0 high-severity, 3 medium (all PRD-clarity,
now folded in), remainder low.** Recommendation: **PROCEED.** The three medium
findings were resolved in-spec before proceeding (full canonical "Root tests"
step name in US-003; FR-3 line-range disambiguation; US-004 append-to-existing
`### Changed`). Low-severity risks (no npm cache, the `needs: [validate]` gate
already wired, the `boot-lint` parity gap) were acknowledged and deferred as
out-of-scope follow-ups.
