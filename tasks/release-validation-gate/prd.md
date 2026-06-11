# PRD: Release Validation Gate

## Introduction

`.github/workflows/release.yml` currently builds and pushes the production
Docker image (`ghcr.io/mifunedev/openharness:<VERSION>` **and** `:latest`) and
creates a GitHub Release **with no lint/build/test gate first**. The job runs
checkout → parse tag → docker build → `docker push` with zero validation. A
broken commit sitting on a tag therefore ships an unvalidated image to GHCR and
overwrites `:latest`. This also contradicts `context/rules/git.md:130`, which
claims the workflow "runs lint + type-check + tests" — it does not today.

This feature adds a `validate` job to `release.yml` that mirrors the checks the
integration CI (`ci-harness.yml`) already runs, gates the publish job on it, and
reconciles the `git.md` documentation to match what actually executes.

## Goals

- Block the Docker build/push and GitHub Release whenever lint, format check,
  build, test, or root-scripts tests fail on the tagged commit.
- Mirror the exact checks already defined in `.github/workflows/ci-harness.yml`
  so the release gate and integration CI never diverge.
- Keep job permissions least-privilege: validation reads only; publishing keeps
  write/packages.
- Make `context/rules/git.md` accurately describe what the release workflow runs.
- Record the change in `CHANGELOG.md` under `[Unreleased]`.

## User Stories

### US-001: Add a `validate` job that gates the publish job in `release.yml`

**Description:** As the maintainer, I want the release workflow to run the
same lint/build/test checks as CI before it publishes anything, so that a broken
commit on a tag can never ship an image to GHCR.

**Acceptance Criteria:**

- [ ] `release.yml` defines a new job `validate` (`runs-on: ubuntu-latest`) with
      `permissions:` set to `contents: read` only.
- [ ] The `validate` job steps mirror `ci-harness.yml` exactly, in order:
      Checkout (`actions/checkout@v4`) → Setup Node 22.x (`actions/setup-node@v4`,
      `node-version: "22"`) → Install pnpm (`pnpm/action-setup@v4`) → Cache pnpm
      store (`actions/cache@v4`, **`path: ~/.local/share/pnpm/store/v3`**, key
      `pnpm-store-${{ hashFiles('pnpm-lock.yaml') }}`, restore-keys `pnpm-store-`)
      → Install (`pnpm install --frozen-lockfile`) → Lint
      (`pnpm --filter './packages/**' -r --if-present run lint`) → Format check
      (`pnpm --filter './packages/**' -r --if-present run format:check`) → Build
      (`pnpm --filter './packages/**' -r --if-present run build`) → Test
      (`pnpm --filter './packages/**' -r --if-present run test`) → Root tests
      (`pnpm test:scripts`). The `path:` is mandatory; omitting it causes a
      cache miss every run.
- [ ] The existing publish job (currently `release`, name "Build & Release")
      declares `needs: [validate]` so it runs only after `validate` succeeds.
      Verifiable: `grep -A2 'name: Build & Release' .github/workflows/release.yml`
      shows `needs:` referencing `validate`.
- [ ] The top-level `permissions:` block (`contents: write`, `packages: write`)
      is moved onto the publish job; it no longer applies workflow-wide.
- [ ] The publish job still carries `contents: write` and `packages: write`
      (grep-verifiable on the job body, not just the file).
- [ ] The publish job keeps its **own** Setup Node + Install pnpm steps —
      GitHub Actions jobs run on separate runners and do not share state, so
      `validate`'s setup does not carry over. The apparent duplication is
      expected and correct; it is not a step to deduplicate in this PR.
- [ ] No publish-side steps are removed or reordered: tag trigger
      (`on: push: tags:`), Parse tag, Extract release notes, Setup Node, Install
      pnpm, Buildx, GHCR login, Build & push, Create GitHub Release all remain.
- [ ] `release.yml` parses as valid YAML (`python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/release.yml'))"` exits 0).

### US-002: Reconcile the `git.md` release description

**Description:** As the maintainer, I want `context/rules/git.md`
to accurately describe what the release workflow runs, so the docs match reality.

> **[PROTECTED-PATH] override note:** `context/rules/git.md` is a protected path
> (listed as `.claude/rules/git.md` in `.claude/protected-paths.txt:50`;
> `.claude/rules` is a symlink to `context/rules`, so both paths resolve to the
> same file). This story is a **documentation correction** — it edits prose to
> match reality. It does **not** delete, deprecate, move, or remove any procedure
> the file encodes, so it does not trigger the protected-paths deletion gate.
> Edit the **canonical** file `context/rules/git.md` (never the symlink) and
> verify `diff context/rules/git.md .claude/rules/git.md` exits 0 afterward.

**Acceptance Criteria:**

- [ ] The phrase "runs lint + type-check + tests" on `context/rules/git.md:130`
      is replaced with wording matching the actual gate (lint, format check,
      build, test, root-scripts tests).
- [ ] The string `type-check` no longer appears on that line (no `type-check`
      script is invented — the wording describes only what the `validate` job runs).
- [ ] The surrounding sentence still reads correctly (tag push triggers
      `release.yml`, which now validates then builds/pushes to GHCR and creates a
      GitHub Release).
- [ ] The edit is made to `context/rules/git.md`; `diff context/rules/git.md .claude/rules/git.md` exits 0 (the symlink still resolves to the edited file).

### US-003: Add the CHANGELOG entry

**Description:** As the maintainer, I want the release-gate change recorded in the
changelog so it surfaces in the next release notes.

**Acceptance Criteria:**

- [ ] A new bullet exists under `## [Unreleased]` → `### Changed`:
      "Release pipeline now validates (lint, format check, build, test, root
      tests) before building/pushing the Docker image or creating the GitHub
      Release ([#24](https://github.com/ryaneggz/openharness/issues/24))."
- [ ] The bullet links issue #24 and is written in imperative mood.
- [ ] No existing `[Unreleased]` entries are removed or reordered.

## Functional Requirements

- FR-1: `release.yml` must run lint, format check, build, test, and root-scripts
  tests on the tagged commit before any Docker build or push occurs.
- FR-2: A failure in any `validate` step must abort the workflow before the
  publish job runs (enforced via `needs: [validate]` fail-fast).
- FR-3: The `validate` job must use `permissions: contents: read`; the publish
  job must retain `contents: write` and `packages: write`.
- FR-4: The release gate's checks must match `ci-harness.yml`'s `ci` job steps —
  identical in each step's `name:`, `uses:` (pinned version), and `run:` command.
  There is no automated drift detector; keeping them in sync is a manual
  obligation (see Technical Considerations).
- FR-5: `context/rules/git.md` must describe the gate accurately, without naming
  a non-existent `type-check` script.
- FR-6: `CHANGELOG.md` must carry an `[Unreleased]` / `### Changed` entry linking #24.

## Non-Goals (Out of Scope)

- No change to the CalVer scheme, the tag pattern (`on: push: tags:`), or the
  release-notes extraction logic.
- No change to the `/release` skill's promotion flow.
- No modification of `ci-harness.yml`.
- No new `type-check` script — the repo has none; the gate mirrors existing checks.
- No `:latest` rollback on gate failure — if `validate` fails, the publish job is
  skipped and never runs, so the prior good `:latest` is simply left untouched.
  Recovering from a *partial* publish (image pushed, Release failed) remains a
  manual concern, unchanged by this PR.
- Gate is **tag-only** — `validate` runs as part of the tag-triggered release
  workflow. It does not add validation to `release/*` branch pushes (those are
  covered by `ci-harness.yml` on `development`/`main` integration, and the branch
  is cut from already-CI-green `main`).
- No automated step-divergence detector between `release.yml` and
  `ci-harness.yml` — sync is a manual obligation for now.
- No sandbox application code.

## Technical Considerations

- The reference implementation is the `ci` job in
  `.github/workflows/ci-harness.yml` (lines ~42–83) — copy its step list verbatim.
- GitHub Actions allows per-job `permissions:`; removing the workflow-level block
  and adding per-job blocks is the standard least-privilege pattern.
- `needs:` produces fail-fast gating: if `validate` fails, dependent jobs are
  skipped and the workflow conclusion is `failure`, so nothing is published.
- **Manual sync obligation:** because the gate duplicates `ci-harness.yml`'s
  step list and there is no drift detector, any future change to `ci-harness.yml`'s
  `ci` job (e.g. bumping `actions/cache@v4` → `v5`, adding a check) must be
  mirrored into `release.yml`'s `validate` job by hand. Note this in the commit
  body so the coupling is discoverable.
- **Dependencies confirmed present:** `package.json` defines `test:scripts`
  (`vitest run`); `format:check`, `lint`, `build`, `test` are the same
  `--if-present` scripts `ci-harness.yml` already invokes, so the gate adds no
  new script requirements.

## Success Metrics

- A release tag placed on a commit that fails any check produces a failed
  workflow with no GHCR push and no GitHub Release.
- `git.md` no longer references a `type-check` step that doesn't exist.

## Open Questions

- None blocking. Confirmed during critic review: `test:scripts` exists in
  `package.json`; `ryaneggz/openharness` is the canonical repo namespace (all
  current `[Unreleased]` CHANGELOG links use it; historical `mifunedev` entries
  are left untouched); `context/rules/git.md` is editable as a doc correction
  under the protected-paths policy (deletion-only gate).

## Critic Review

Two critics (implementer + user lens) reviewed this PRD pre-scaffold. Findings
were medium/low after the protected-path finding on US-002 was resolved by an
explicit override note (the git.md edit is a documentation correction, not a
deletion). All high findings were AC-level mitigations now folded into US-001
(explicit cache `path:`, grep-verifiable `needs:`/permissions checks,
duplicate-setup clarification) and US-002 (override note + symlink diff check).
Recommendation: **PROCEED**. Full record in `critique.md`.
