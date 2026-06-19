# Docs Build Decoupling PRD

## Introduction

Open Harness currently lets Docusaurus documentation builds enter broad validation paths. The adversarial review found that `/eval` itself does not run a docs build, but root build scripts, Harness CI, release validation, and the docs workflow can all pull Docusaurus into routine development feedback. The operator clarified the product rule: docs builds should happen automatically **only on merges to `main` or `master`**.

This task removes docs builds from fast development, pull-request, and release validation gates while keeping the docs site build/deploy on `main`/`master` pushes. Explicit local `pnpm docs:build` remains available for a human who intentionally wants to validate the docs site.

## Goals

- Keep `/eval`, root `pnpm build`, Harness CI, pull-request checks, and release validation free of automatic Docusaurus build work.
- Make `.github/workflows/docs.yml` build docs only on `push` to `main` or `master`, i.e. after a merge/promote to the release branch.
- Preserve explicit local docs commands (`pnpm docs:build`, `pnpm docs:dev`, `pnpm docs:serve`) for intentional human use.
- Document the new gate split for operators and future agents.
- Add a lightweight eval probe that prevents docs builds from silently re-entering fast or release gates.

## Non-Goals

- Do not remove local docs build/dev/serve commands.
- Do not change Docusaurus configuration or docs content beyond describing the gate split.
- Do not add `packages/oh` to the pnpm workspace; it remains npm-standalone and is built through `npm --prefix packages/oh run build`.
- Do not try to prove docs correctness in `/eval`; the automatic docs build belongs only to the `main`/`master` push docs workflow.

## User Stories

### US-001 — Split fast build from docs build

As a harness operator, I want `pnpm build` to represent the fast non-docs harness build so routine validation does not run Docusaurus unless I explicitly request it.

Acceptance criteria:

- Root `package.json` changes `build` to run the fast non-docs build path: all future buildable pnpm workspace packages except `@openharness/docs`, plus the npm-standalone `packages/oh` build via `npm --prefix packages/oh run build`.
- Root `setup` uses the fast build path and does not invoke `@openharness/docs` / `docusaurus build` by default; install lifecycle behavior is allowed as long as Docusaurus is not run.
- Existing root `docs:build`, `docs:dev`, and `docs:serve` scripts remain available, and `packages/docs` `build`, `start`, and `serve` scripts remain intact.
- `pnpm run build` succeeds without running `docusaurus build`.
- Typecheck passes.
- Tests pass.

### US-002 — Run docs build only on main/master-push docs workflow

As a maintainer, I want automatic docs builds to run only after merge/promote to `main` or `master`, not during PR, Harness CI, or release validation.

Acceptance criteria:

- `.github/workflows/ci-harness.yml` Build step calls the fast non-docs build path and cannot run `@openharness/docs` build through `packages/**`.
- `.github/workflows/docs.yml` has no `pull_request` trigger and no `workflow_dispatch` trigger; it builds docs only on `push` to `main` or `master` with its existing docs path filters.
- `.github/workflows/release.yml` Build step calls the fast non-docs build path and does not run Docusaurus.
- `.claude/skills/ci-status/SKILL.md` and `.pi/skills/ci-status/SKILL.md` document that PR/Harness CI and release validation use the fast build, while docs build/deploy happens only on `main`/`master` pushes through `docs.yml`.
- Operator escape hatch is documented: run `pnpm docs:build` only when intentionally validating docs locally; rollback path is restoring the docs workflow PR/manual triggers and broad build gating.
- Typecheck passes.
- Tests pass.

### US-003 — Add a regression probe for build-gate separation

As a future agent, I want a fast deterministic eval probe that flags accidental Docusaurus build reintroduction into `/eval`, root fast build, Harness CI, release validation, or PR docs workflows.

Acceptance criteria:

- Add `evals/probes/docs-build-fast-path.sh`.
- The probe uses exact static invariants: root `build`/`setup` must not contain `docusaurus`, `docs:build`, `packages/docs`, or `@openharness/docs`; Harness CI and release Build steps must call the fast build path; eval runner/probe files must not invoke `docusaurus build`, `pnpm run docs:build`, or `pnpm --dir packages/docs build` outside this probe's own forbidden-pattern checks.
- The probe passes only if `.github/workflows/docs.yml` builds docs on `push` to `main` or `master` and has no `pull_request` or `workflow_dispatch` trigger.
- `bash evals/probes/docs-build-fast-path.sh` passes.
- `/eval` passes.
- Tests pass.

### US-004 — Document the gate split in docs and wiki

As an operator and future agent, I want the docs-build gate split recorded in human docs and the source-backed wiki so the tradeoff is not re-derived.

Acceptance criteria:

- Human-facing docs say `pnpm build` is fast/non-docs, `pnpm docs:build` is manual/explicit, and automatic docs build/deploy happens only on `main`/`master` pushes through `docs.yml`.
- Add a `CHANGELOG.md` Unreleased entry for the build-gate change.
- Add `wiki/raw/<yyyy-mm-dd>-ci-build-gates.md` provenance and `wiki/ci-build-gates.md` with relevant source files, line-cited claims, a quick command/gate table, system relationships, and `## See Also`.
- Refresh `wiki/README.md` using canonical deterministic ordering so the wiki index includes the new/updated entry.
- `bash evals/probes/wiki-readme-index.sh` passes.
- Typecheck passes.
- Tests pass.

## Wiki Alignment

- **Impact**: REQUIRED
- **Local entries**: create `wiki/ci-build-gates.md` and refresh `wiki/README.md`.
- **Spec alignment**: The wiki entry must explain the split between fast harness validation (`pnpm build`, Harness CI, release validation, `/eval`) and docs validation (`docs.yml` on `main`/`master` push only; local `pnpm docs:build` only by explicit operator choice). It must preserve the goals and non-goals above, especially that PR and release gates no longer build docs automatically.
- **DeepWiki comparison**: No dedicated public DeepWiki page for this narrow CI/build-gate split was found during local review. The entry should follow the DeepWiki-style shape from `context/rules/wiki.md`: relevant source files first, concrete source-backed claims, a system relationship diagram/table, and `## See Also` navigation.
- **Acceptance criteria**: US-004 must create or update the local wiki entry, include relevant source files and line-cited claims, record the DeepWiki comparison gap, include system relationships, and pass `bash evals/probes/wiki-readme-index.sh`.

## Critique resolution

Critics reviewed the first PRD draft before implementation. Medium/low findings are resolved in `tasks/docs-build-decoupling/critique.md`. The operator's clarification that docs builds should run automatically only on merges to `main` or `master` supersedes the earlier release/docs-PR coverage assumption and is reflected in this revised PRD.
