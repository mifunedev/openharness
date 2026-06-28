# Smoke-test release image before GHCR publish

## Introduction

Harden the CalVer release workflow so the Docker image built for GHCR is boot-smoked before any tag is pushed. The existing PR sandbox boot guard proves a local image can start, but the release job currently builds and immediately publishes the release image without running that artifact.

## Goals

- Build the release image once and tag it both for GHCR and for a local smoke-run alias.
- Run the same bounded sandbox health smoke used by CI against the locally built release image before `docker push`.
- Keep release tags, notes, permissions, and cleanup behavior unchanged.

## Non-Goals

- Do not change the sandbox runtime image contents.
- Do not publish extra GHCR tags beyond the existing version and `latest` tags.
- Do not alter the PR-only sandbox boot guard workflow.

## User Stories

### US-001 — Gate release publish on boot smoke

As a release operator, I want the release workflow to boot-smoke the exact image built for GHCR before pushing so that a broken image is not published as a release artifact.

Acceptance criteria:
- `.github/workflows/release.yml` separates local image build, smoke, and push steps so `docker push` runs only after smoke succeeds.
- The local build tags the same image object as `ghcr.io/mifunedev/openharness:<version>`, `ghcr.io/mifunedev/openharness:latest`, and the `sandbox-${SANDBOX_NAME}` alias consumed by `.devcontainer/docker-compose.yml`.
- The smoke step runs `scripts/sandbox-boot-smoke.sh` with a release-specific `SANDBOX_NAME`, bounded timeout/interval values, and `--no-build` compose startup so it tests the already-built image rather than rebuilding.
- The smoke path always cleans up through `scripts/sandbox-boot-smoke.sh`'s existing teardown trap.

### US-002 — Document and verify release gate behavior

As a maintainer, I want the workflow intent to be obvious and locally reviewable so future release changes keep the smoke gate before publish.

Acceptance criteria:
- The workflow names/comments make the pre-push smoke gate explicit.
- `CHANGELOG.md` records the release workflow hardening under `[Unreleased]`.
- A syntax/logic validation command confirms the workflow still parses and contains build → smoke → push ordering.

## Wiki Alignment

- **Impact**: NOT-APPLICABLE
- **Local entries**: `none`
- **Spec alignment**: This is a narrow GitHub Actions release hardening change, not a reusable harness concept or runtime vocabulary change.
- **DeepWiki comparison**: No dedicated release workflow DeepWiki page was loaded; the relevant source files are `.github/workflows/release.yml`, `.github/workflows/sandbox-boot-guard.yml`, and `scripts/sandbox-boot-smoke.sh`.
- **Acceptance criteria**: No wiki update required; verify the workflow source and changelog only.

## Success Metrics

- A release job cannot push GHCR tags unless `scripts/sandbox-boot-smoke.sh` passes against the locally built image alias.
- Existing release metadata and GHCR tags remain unchanged.
