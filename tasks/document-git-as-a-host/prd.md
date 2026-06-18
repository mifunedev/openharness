# PRD — Document Git as a Host Dependency

## Summary

Open Harness onboarding must accurately name host prerequisites. The README and docs currently claim Docker is the only host dependency even though `scripts/install.sh` requires `git` to clone, pull, and inspect the repository.

## Goals

- Replace Docker-only host-dependency claims with Docker + Git language across primary onboarding docs.
- Keep Node, pnpm, Python, and agent CLIs documented as sandbox-contained, not host requirements.
- Make the installer help and missing-git diagnostic explain why Git is required.
- Add a regression test that catches future Docker-only prerequisite wording.

## Non-goals

- Do not change sandbox runtime dependencies or Docker socket behavior.
- Do not add a new installer transport or host package manager.
- Do not restructure onboarding flows beyond correcting prerequisite truthfulness.

## User stories

### US-001 — Correct onboarding prerequisite docs

As a new operator, I want README and docs prerequisite language to identify Docker and Git, so I do not start from a false Docker-only promise.

Acceptance criteria:
- `README.md`, `docs/intro.md`, `docs/quickstart.md`, and `docs/installation.md` no longer claim Docker is the only host dependency.
- Those docs state Docker with Compose and Git are required host dependencies.
- The docs still state Node.js, pnpm, Python, and AI CLIs live inside the sandbox.

### US-002 — Clarify installer Git preflight

As an installer user, I want the help text and missing-Git error to explain Git's purpose, so a failed preflight is actionable.

Acceptance criteria:
- `scripts/install.sh --help` text lists Docker with Compose and Git prerequisites.
- The missing-Git diagnostic says Git is required to clone or update Open Harness.
- Existing Docker preflight behavior is unchanged.

### US-003 — Guard prerequisite wording

As a maintainer, I want test coverage for onboarding prerequisite claims, so Docker-only wording cannot silently return.

Acceptance criteria:
- A script test checks key onboarding docs for Docker+Git prerequisite language.
- The test fails on common Docker-only prerequisite phrases.
- `pnpm vitest run scripts/__tests__/install-prereqs.test.ts` passes.
- `CHANGELOG.md` records the onboarding correction under `## [Unreleased]`.
