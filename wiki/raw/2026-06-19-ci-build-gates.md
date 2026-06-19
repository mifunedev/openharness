# CI Build Gates source snapshot — 2026-06-19

This local provenance snapshot captures the source-backed facts used by `wiki/ci-build-gates.md` for issue #455.

## Source files

- `package.json`: root scripts define `setup`, `build`, `build:harness`, and explicit docs commands.
- `.github/workflows/ci-harness.yml`: Harness CI Build step calls the fast build path.
- `.github/workflows/docs.yml`: Docs build/deploy workflow triggers only on pushes to `main` or `master` with docs path filters, then runs Docusaurus from `packages/docs`.
- `.github/workflows/release.yml`: release validation Build step calls the fast build path.
- `.claude/skills/eval/run.sh`: eval runner executes probe scripts with short timeouts; docs build is not part of the runner.
- `evals/probes/docs-build-fast-path.sh`: regression guard for this split.

## Decision

Automatic docs builds belong only to the docs workflow on `main`/`master` pushes. Root build, Harness CI, release validation, and `/eval` use fast non-docs validation. Manual `pnpm docs:build` remains available when an operator intentionally wants to validate the Docusaurus site.
