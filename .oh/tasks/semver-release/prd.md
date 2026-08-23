# PRD: CalVer to SemVer release versioning

Issue: [#814](https://github.com/mifunedev/openharness/issues/814)

## Introduction

The release workflow versions Open Harness with UTC CalVer: `YYYY.M.D` for the first
release of a push date, then `YYYY.M.D-1`, `-2`, and onward. The version is never stored
in a file. It is derived at release time from `github.event.repository.pushed_at`.

A clock-derived version says *when* a release happened and nothing about *what changed*.
There is no way to signal "this is the pre-refinement state" or "this release removed
things". The harness has accreted 38 skills, a triple-implemented spec pipeline, and four
parallel execution paths. That sprawl was useful to find out what works. It now needs
refinement, and refinement needs a versioning scheme that can make compatibility claims.

This change moves the release path to SemVer, makes root `package.json` the single source
of truth for the version, and cuts an annotated `v0.0.0` tag that freezes the current
state as the end of the discovery era. The first SemVer release is `v0.1.0`.

## Goals

- Root `package.json` `version` is the one place the release version is written.
- A push to `main` publishes the version that file names, or skips cleanly when that
  version already shipped.
- Git tags and the GitHub Release name carry a `v` prefix; GHCR image tags stay bare.
- An unbumped push to `main` gives a **green** run, not a failure.
- The atomic tag-ref reservation and same-SHA retry recovery keep working unchanged.
- The 42 existing CalVer tags stay as history and are not rewritten.

## Design decisions

Three decisions shape the whole change.

1. **`package.json:version` is the source of truth.** The release workflow reads it
   instead of computing a version from the clock. This mirrors the pattern
   `.github/workflows/publish-cli.yml:47-57` already uses for the CLI package
   (`node -p "require('./.oh/cli/package.json').version"`, then skip if already
   published), so the repo has one release idiom instead of two.

2. **`releaseVersion` stays bare (`0.1.0`).** The git tag is `v${releaseVersion}`; GHCR
   stays `ghcr.io/mifunedev/openharness:0.1.0`. `release.yml:296` already names the
   GitHub Release `v${releaseVersion}`, and `release.yml:188` and `:206-207` already tag
   GHCR with the bare `${RELEASE_VERSION}`. Keeping the output bare means only the
   ref-create path changes and every downstream consumer is untouched.

3. **The reservation mechanism survives; only its collision policy changes.** Creating
   `refs/tags/vX.Y.Z` stays the atomic reservation, and same-SHA retry recovery is kept
   as it is. What changes: a foreign collision no longer advances a `-N` suffix. It means
   the version already shipped, which is a clean `publishedNoop` skip, not an error and
   not an automatic bump.

### Release behavior after the change

| Push to `main` | Reserve step | Downstream |
|---|---|---|
| version bumped, tag absent | creates `refs/tags/vX.Y.Z` and its draft | build, GHCR, CLI, publish release |
| same SHA retried, draft exists | reuses the draft | resumes |
| same SHA, already published | `publishedNoop=true` | all skipped |
| version unchanged, tag on another SHA | logs `X.Y.Z already released`, `publishedNoop=true` | all skipped, run stays **green** |

The last row is the new case. It reuses the existing `publishedNoop` wiring
(`release.yml:130`, `:151`, `:221`, `:234`), so it needs no new workflow plumbing.

## User Stories

### US-001: SemVer state machine

**Description:** As a release engineer, I want the pure reservation state machine to
validate a supplied SemVer version instead of deriving a CalVer version from a clock, so
that the version is a deliberate input and not a side effect of the push time.

**Acceptance Criteria:**

- [ ] `.oh/scripts/release-reservation.mjs` no longer exports `formatUtcCalVerBase` or
      `buildUtcCalVerCandidate`.
- [ ] A new `parseSemVer(version)` accepts `0.1.0`, `1.2.3`, and `10.0.0`.
- [ ] `parseSemVer` rejects `01.2.3`, `1.2`, `2026.8.7`, `v1.2.3`, and the empty string,
      throwing `ReleaseReservationError` with code `INVALID_SEMVER_VERSION`.
- [ ] `reserveReleaseVersion` calls `attemptCreate` exactly once. There is no collision
      loop, no `maxForeignCollisions` option, and no `MAX_COLLISIONS_EXCEEDED` code.
- [ ] An `attemptCreate` outcome of `foreign-collision` returns
      `{ kind: "already-released", version }` instead of advancing to a next candidate.
- [ ] The `created`, `same-sha-draft`, `same-sha-published`, and `invalid-state` outcomes
      keep their existing result shapes.
- [ ] `ReleaseReservationError` keeps its existing constructor signature.
- [ ] `pnpm test:scripts` passes.

### US-002: GitHub bridge reads the version and prefixes the tag

**Description:** As a release engineer, I want the GitHub bridge to take the version from
the environment and create a `v`-prefixed tag ref, so that the reservation names the tag
the repository convention expects while the bare version keeps flowing downstream.

**Acceptance Criteria:**

- [ ] `.oh/scripts/reserve-github-release.mjs` no longer exports or uses
      `parseReleaseTimestamp`, and `reserveGitHubRelease` no longer takes
      `releaseTimestamp` or `maxForeignCollisions`.
- [ ] `reserveGitHubRelease` takes a `releaseVersion` argument and validates it through
      `parseSemVer`.
- [ ] Reserving `0.1.0` POSTs to `/git/refs` with body ref `refs/tags/v0.1.0`.
- [ ] `ensureDraftRelease` sets `tag_name` to `v0.1.0`; `assertRelease`,
      `resolveTagCommit`, `getPublishedRelease`, and `findExactDraftRelease` all compare
      against the same `v`-prefixed tag.
- [ ] An existing `v0.1.0` tag on a different SHA returns `publishedNoop: true` and
      `reservationKind: already-released`. It does not throw and does not bump.
- [ ] `githubOutputLines` still emits `releaseVersion=0.1.0` (bare) along with
      `releaseSha`, `releaseId`, `publishedNoop`, and `reservationKind`.
- [ ] `main()` reads `RELEASE_VERSION` from the environment in place of
      `RELEASE_TIMESTAMP`, and fails with a clear message when it is absent.
- [ ] The `already-released` path prints a log line naming the version and telling the
      reader to bump `package.json` to cut a new release.

### US-003: latest-promotion accepts SemVer and rejects CalVer

**Description:** As a release engineer, I want the `latest` promotion helper to validate
a SemVer version, so that a malformed version cannot reach the registry.

**Acceptance Criteria:**

- [ ] `.oh/scripts/promote-release-latest.sh` validates `RELEASE_VERSION` against
      `^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$` and its error text names
      SemVer.
- [ ] Feeding it `2026.8.3` exits non-zero with that error.
- [ ] Feeding it `0.1.0` passes validation.
- [ ] The digest-based `latest` promotion and the canonical `main`-else-`master` check are
      unchanged.
- [ ] `.oh/scripts/__tests__/release-latest.test.ts` uses `0.1.0` and carries the CalVer
      rejection case.

### US-004: release workflow reads the version from package.json

**Description:** As a maintainer, I want the release workflow to read the version from
root `package.json`, so that cutting a release is an explicit commit rather than a side
effect of the push clock.

**Acceptance Criteria:**

- [ ] The `reserve` job in `.github/workflows/release.yml` reads
      `node -p "require('./package.json').version"` and passes it as `RELEASE_VERSION`.
- [ ] The `RELEASE_TIMESTAMP` env var and its immutable-timestamp comment are gone.
- [ ] The job name names SemVer, not CalVer.
- [ ] `publish-image`, `publish-cli`, and `finalize` are unchanged and still gate on
      `needs.reserve.outputs.publishedNoop != 'true'`.
- [ ] No `push: tags:` trigger is added. The branch push stays the only trigger.
- [ ] The GHCR tag stays bare and the GitHub Release name stays `v${releaseVersion}`.

### US-005: docs and skills describe SemVer

**Description:** As a contributor, I want every document that describes the release
scheme to describe SemVer, so that no reader follows an obsolete CalVer procedure.

**Acceptance Criteria:**

- [ ] `CHANGELOG.md:5` names SemVer and `v`-prefixed tags.
- [ ] `.oh/skills/git/SKILL.md` § Releases describes the bump-driven flow, states that an
      unbumped push is a clean skip, and its artifact sequence names SemVer.
- [ ] `.oh/skills/release/SKILL.md` pre-flight requires a bumped `package.json` version
      with a matching CHANGELOG section, and its tag-discovery regex is
      `^v[0-9]+\.[0-9]+\.[0-9]+$`.
- [ ] `.oh/docs/contributing.md` replaces both the CalVer definition and the stale manual
      "create a release branch and tag" procedure that already contradicts the workflow.
- [ ] `AGENTS.md`, `.oh/templates/AGENTS.md`, `SECURITY.md`,
      `.oh/docs/deployment-prebuilt-image.md`, `.oh/scripts/README.md`,
      `.oh/skills/sync/SKILL.md`, `.oh/skills/strategic-proposal/SKILL.md`, and
      `.oh/evals/probes/oh-npm-package.sh` no longer describe the release scheme as
      CalVer.
- [ ] A repo-wide case-insensitive `calver` grep over `*.md`, `*.mjs`, `*.sh`, `*.yml`,
      and `*.ts` returns only the four `CHANGELOG.md` history entries that describe past
      releases.
- [ ] Prose follows `/ste`.

### US-006: wiki entry for the release versioning contract

**Description:** As an agent reading the corpus, I want one entry that states how a
release is versioned and published, so that the contract is discoverable without reading
the workflow.

**Acceptance Criteria:**

- [ ] `.oh/skills/wiki/corpus/release-versioning.md` exists and satisfies
      `.oh/skills/wiki/references/schema.md` (frontmatter fields, `## Relevant Source
      Files`, `## Summary`, `## Detail`, `## System Relationships`, `## See Also`).
- [ ] The entry states the source of truth, the tag prefix rule, the four reserve
      outcomes, and the `v0.0.0` checkpoint.
- [ ] Claims about repository behavior cite concrete source paths.
- [ ] `bash .oh/skills/wiki/scripts/*lint*` (or `/wiki lint`) reports no new findings.

### US-007: changelog and version for the first SemVer release

**Description:** As a maintainer, I want `package.json` and `CHANGELOG.md` to agree on
`0.1.0`, so that the first SemVer release publishes with real notes.

**Acceptance Criteria:**

- [ ] Root `package.json` version is `0.1.0`.
- [ ] `CHANGELOG.md` has a `## [0.1.0] - <date>` section describing the versioning
      switch.
- [ ] The `finalize` job's awk extraction finds that section for `RELEASE_VERSION=0.1.0`,
      verified by running the same awk locally.

### US-008: verification of the whole path

**Description:** As a maintainer, I want the change proved rather than assumed, so that
the first real release does not discover a defect.

**Acceptance Criteria:**

- [ ] `pnpm test:scripts` passes, and each new assertion is proved to earn its failure by
      mutation: deleting the SemVer regex turns the rejection cases red.
- [ ] `pnpm run typecheck` passes.
- [ ] `bash .oh/skills/eval/run.sh` shows no green-to-red probe regression against the
      recorded baseline.
- [ ] A local dry run calls `reserveGitHubRelease` with a stub `fetchImpl` for all four
      rows of the behavior table and asserts the exact `refs/tags/v0.1.0` request body and
      the `publishedNoop` value in each.

## Functional Requirements

- FR-1: The release version must be read from root `package.json`, never derived from a
  clock.
- FR-2: A version must match `^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$`. Prerelease and
  build metadata are out of scope.
- FR-3: Creating `refs/tags/v<version>` must remain the atomic reservation act.
- FR-4: A same-SHA retry must reuse an existing draft, and a retry of an already-published
  same-SHA release must be a successful no-op.
- FR-5: A tag that already exists on a different SHA must produce `publishedNoop=true`, a
  green run, and a log line telling the reader to bump `package.json`.
- FR-6: The `releaseVersion` step output must stay bare. Only the tag ref and the GitHub
  Release name carry the `v` prefix.
- FR-7: Existing CalVer tags and the CHANGELOG entries describing past CalVer releases
  must not be rewritten.

## Non-Goals (Out of Scope)

- Skill, agent, or cron pruning. This change is the versioning machinery only. The
  refinement it enables is separate work.
- Prerelease or build-metadata SemVer identifiers (`1.0.0-rc.1`, `1.0.0+build.5`).
- Rewriting the 42 existing CalVer tags or the GitHub Releases attached to them.
- Changing the CLI package's independent npm versioning in `.oh/cli/package.json`.
- Automatic version bumping. Cutting a version stays a deliberate human commit.
- Adding a `push: tags:` trigger to the release workflow.

## Technical Considerations

- `.oh/scripts/release-reservation.mjs` is pure and does no I/O. Keep it that way: the
  version arrives as an argument, and the workflow, not this module, reads the file.
- `reserveGitHubRelease` must stay testable without a filesystem, so it takes
  `releaseVersion` as a parameter rather than reading `package.json` itself.
- `.oh/scripts/__tests__/*.ts` runs under vitest through `pnpm test:scripts`.
- The `v` prefix is introduced in exactly one module. Every tag-shaped string in
  `reserve-github-release.mjs` must derive from one helper so the prefix cannot drift
  between the create path and the recovery path.
- The `v0.0.0` checkpoint is a hand-cut annotated tag with no GitHub Release and no GHCR
  image, so it never enters the workflow path.
- Push to `upstream` (`mifunedev/openharness`). `origin` is a stale fork.

## Success Metrics

- One place names the release version: root `package.json`.
- A docs-only push to `main` gives a green run with the image, CLI, and finalize jobs
  skipped.
- `v0.1.0` publishes with a GHCR image at `:0.1.0` whose digest matches `:latest`.

## Open Questions

- None. The five binding decisions (checkpoint at `v0.0.0` then start at `v0.1.0`;
  `package.json` as source of truth; versioning-only scope; green skip on an unbumped
  push; `v` prefix in git and GitHub, bare in GHCR) are settled.

## Wiki Alignment

**Impact: REQUIRED**

- **Local entries:** `.oh/skills/wiki/corpus/` has no entry describing the release
  pipeline or its versioning contract. The closest neighbours are
  `oh-cli-portable-lifecycle.md` (the CLI package, which versions independently) and
  `build-executor-ladder.md` (a different harness subsystem).
- **Spec alignment:** the release pipeline is a harness subsystem with a cross-file
  mechanism (workflow, two `.mjs` modules, one shell script), which the schema's boundary
  table places squarely in the wiki rather than in a skill or in memory. The change
  rewrites that subsystem's contract, so the entry is written against the new behavior.
- **DeepWiki comparison:** the public DeepWiki for `mifunedev/openharness` documents the
  release workflow as CalVer-based. After this change the local entry is the accurate
  source and DeepWiki lags until it re-indexes. The entry states the SemVer contract
  explicitly so the divergence is unambiguous to a reader who has seen both.
- **Wiki acceptance criteria:** carried by US-006.
