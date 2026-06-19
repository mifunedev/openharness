# Docs Build Decoupling PRD

## Introduction

Open Harness currently treats Docusaurus documentation builds as part of broad workspace build gates. The adversarial review found that `/eval` itself does not run a docs build, but root `pnpm build`, Harness CI, and release validation all use broad `packages/**` build filters that include `@openharness/docs`. This makes fast harness validation wait on Docusaurus even when the change is not a docs-site change.

This task decouples slow docs builds from fast development and Harness CI paths while preserving explicit docs validation in the docs workflow and release validation.

## Goals

- Keep `/eval` and fast Harness CI free of Docusaurus build work.
- Make root `pnpm build` a fast non-docs build path, with an explicit `pnpm run build:all` command for release-style validation.
- Preserve docs build coverage in `.github/workflows/docs.yml` and release validation.
- Document the new gate split for operators and future agents.
- Add a lightweight eval probe that prevents docs builds from silently re-entering the fast path.

## Non-Goals

- Do not remove the docs workflow or weaken docs PR validation for `packages/docs/**`, `docs/**`, or `blog/**` changes.
- Do not remove docs build from release validation.
- Do not change Docusaurus configuration or docs content beyond describing the gate split.
- Do not add `packages/oh` to the pnpm workspace; it remains npm-standalone and is built through `npm --prefix packages/oh run build`.
- Do not vendor or modify third-party tooling.

## User Stories

### US-001 — Split fast and full build scripts

As a harness operator, I want `pnpm build` to represent the fast non-docs harness build so routine validation does not run Docusaurus unless requested.

Acceptance criteria:

- Root `package.json` changes `build` to run the fast non-docs build path: all future buildable pnpm workspace packages except `@openharness/docs`, plus the npm-standalone `packages/oh` build via `npm --prefix packages/oh run build`.
- Root `package.json` adds `build:all`, which runs all pnpm workspace package builds including `@openharness/docs`, then builds the npm-standalone `packages/oh` package.
- Root `setup` uses the fast build path and does not invoke `@openharness/docs` / `docusaurus build` by default; install lifecycle behavior is allowed as long as Docusaurus is not run.
- Existing root `docs:build`, `docs:dev`, and `docs:serve` scripts remain available, and `packages/docs` `build`, `start`, and `serve` scripts remain intact.
- `pnpm run build` succeeds without running `docusaurus build`.
- Typecheck passes.
- Tests pass.

### US-002 — Keep docs builds in intentional CI gates only

As a maintainer, I want Harness CI to use the fast non-docs build while docs and release workflows retain full docs build coverage.

Acceptance criteria:

- `.github/workflows/ci-harness.yml` Build step calls the fast non-docs build path and cannot run `@openharness/docs` build through `packages/**`.
- `.github/workflows/docs.yml` continues to run `pnpm run build` from `packages/docs`.
- `.github/workflows/release.yml` calls `pnpm run build:all` so release validation continues to include docs.
- `.claude/skills/ci-status/SKILL.md` and `.pi/skills/ci-status/SKILL.md` document the revised Harness CI build command and distinguish it from docs/release build coverage.
- Operator escape hatch is documented: run `pnpm run docs:build` for docs-only validation and `pnpm run build:all` for full release-style validation; rollback is restoring Harness CI Build to the broad `pnpm --filter './packages/**' -r --if-present run build` command.
- Typecheck passes.
- Tests pass.

### US-003 — Add a regression probe for build-gate separation

As a future agent, I want a fast deterministic eval probe that flags accidental Docusaurus build reintroduction into `/eval`, root fast build, or Harness CI.

Acceptance criteria:

- Add `evals/probes/docs-build-fast-path.sh`.
- The probe uses exact static invariants rather than vague runtime inference: root `build`/`setup` must not contain `docusaurus`, `docs:build`, `packages/docs`, or `@openharness/docs`; Harness CI Build must call the fast build path; eval runner/probes must not invoke `docusaurus build`, `pnpm run docs:build`, or `pnpm --dir packages/docs build` outside this probe's own forbidden-pattern checks.
- The probe passes when root `pnpm build` and `.github/workflows/ci-harness.yml` exclude `@openharness/docs`/Docusaurus from the fast build path.
- The probe passes only if `.github/workflows/docs.yml` still runs `pnpm run build` from `packages/docs` and release validation calls `pnpm run build:all`.
- `bash evals/probes/docs-build-fast-path.sh` passes.
- `/eval` passes.
- Tests pass.

### US-004 — Document the gate split in docs and wiki

As an operator and future agent, I want the docs-build gate split recorded in human docs and the source-backed wiki so the tradeoff is not re-derived.

Acceptance criteria:

- Add or update human-facing docs to say `pnpm build` is fast/non-docs, `pnpm docs:build` validates the docs site, and `pnpm run build:all` performs full release-style validation.
- Add a `CHANGELOG.md` Unreleased entry for the build-gate change.
- Add `wiki/raw/<yyyy-mm-dd>-ci-build-gates.md` provenance and `wiki/ci-build-gates.md` with relevant source files, line-cited claims, a quick command/gate table, system relationships, and `## See Also`.
- Refresh `wiki/README.md` using canonical `/wiki-lint`-equivalent deterministic ordering so the wiki index includes the new/updated entry.
- `bash evals/probes/wiki-readme-index.sh` passes.
- Typecheck passes.
- Tests pass.

## Wiki Alignment

- **Impact**: REQUIRED
- **Local entries**: create `wiki/ci-build-gates.md` and refresh `wiki/README.md`.
- **Spec alignment**: The wiki entry must explain the split between fast harness validation (`pnpm build`, Harness CI, `/eval`) and intentional docs validation (`pnpm docs:build`, docs workflow, release validation). It must preserve the goals and non-goals above, especially that docs/release gates stay intact.
- **DeepWiki comparison**: No dedicated public DeepWiki page for this narrow CI/build-gate split was found during local review. The entry should follow the DeepWiki-style shape from `context/rules/wiki.md`: relevant source files first, concrete source-backed claims, a system relationship diagram/table, and `## See Also` navigation.
- **Acceptance criteria**: US-004 must create or update the local wiki entry, include relevant source files and line-cited claims, record the DeepWiki comparison gap, include system relationships, and pass `bash evals/probes/wiki-readme-index.sh`.

## Critique resolution

Critics will review this PRD before implementation. Medium/low findings are resolved in `tasks/docs-build-decoupling/critique.md`; high findings halt before implementation.
