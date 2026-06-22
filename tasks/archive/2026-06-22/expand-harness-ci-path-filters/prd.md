# PRD: Expand Harness CI Path Filters

## Introduction/Overview

Ensure the harness CI workflow runs when core sandbox configuration files change. Today, `Makefile` and `harness.yaml` affect sandbox startup and configuration, but they are not covered by the `ci-harness.yml` trigger path filters. This creates a blind spot where important harness changes can miss the fast CI feedback loop.

## Goals

- Make `.github/workflows/ci-harness.yml` run for changes to `Makefile` and `harness.yaml`.
- Add a lightweight regression guard so future edits cannot silently drop these core paths from the CI trigger set.
- Keep the change scoped to harness-infra workflow coverage and tests.

## User Stories

### US-001: Cover core sandbox config in harness CI triggers

**Description:** As the harness maintainer, I want harness CI to trigger on core sandbox config changes so that provisioning regressions receive automatic feedback.

**Acceptance Criteria:**

- [ ] Add `Makefile` to both `push.paths` and `pull_request.paths` in `.github/workflows/ci-harness.yml`.
- [ ] Add `harness.yaml` to both `push.paths` and `pull_request.paths` in `.github/workflows/ci-harness.yml`.
- [ ] Preserve existing workflow path filters and job behavior.
- [ ] Typecheck passes.

### US-002: Guard core path-filter coverage with a probe

**Description:** As the harness maintainer, I want a regression probe for core CI path filters so that future workflow edits cannot silently remove coverage.

**Acceptance Criteria:**

- [ ] Add an executable eval probe under `evals/probes/` that checks `.github/workflows/ci-harness.yml` for `Makefile` and `harness.yaml` under both `on.push.paths` and `on.pull_request.paths` (quote/indent agnostic; not a naive file-wide grep).
- [ ] The probe follows existing eval conventions: required `# tier:`, `# source:`, and `# desc:` headers; repo-root resolution via `${BASH_SOURCE[0]}`; PASS/REGRESSION/SKIPPED output; one-line diagnostic reason; non-zero exit only for an actionable regression.
- [ ] Do not modify `.claude/skills/eval/**` or the eval runner; current probe discovery is via `evals/probes/*.sh`.
- [ ] Run `bash evals/probes/harness-ci-core-paths.sh` successfully.
- [ ] Run the relevant existing script/eval validation locally.

## Functional Requirements

- FR-1: The workflow trigger configuration must include `Makefile` for both push and pull request events.
- FR-2: The workflow trigger configuration must include `harness.yaml` for both push and pull request events.
- FR-3: The regression probe must fail when either core path is missing from either `push.paths` or `pull_request.paths` in the harness CI trigger set.
- FR-4: The implementation must not alter sandbox runtime behavior, compose files, or application code.
- FR-5: The implementation must not rename, move, delete, or change the behavior of `Makefile` or `harness.yaml`; it may only reference those paths from CI trigger filters and the probe.

## Non-Goals (Out of Scope)

- Do not redesign the CI workflow or add new jobs.
- Do not change Docker, compose, sandbox startup, or harness configuration behavior.
- Do not broaden CI triggers to all repository paths.
- Do not cover additional root config files in this ticket; scope is intentionally only `Makefile` and `harness.yaml`.
- Do not touch sandbox application code.

## Technical Considerations

- Existing eval probes live under `evals/probes/`; match their style and runner expectations.
- Keep the workflow change minimal so it is easy to review and unlikely to affect unrelated CI behavior.

## Success Metrics

- A pull request changing `Makefile` or `harness.yaml` would match `ci-harness.yml` path filters.
- The regression probe passes on the updated workflow and would fail if either path is removed later.

## Rollback / Escape Hatch

If the new probe blocks a PR incorrectly, rerun the probe first to rule out transient filesystem/tooling issues. If it is a real false positive, unblock with a follow-up fix to the probe or a temporary SKIPPED condition in the same branch, with a PR comment explaining why. Reverting the probe is acceptable only if the workflow path-filter coverage remains in place.

## Critic Mitigations

Critics raised high-severity concerns that the probe was underspecified and lacked an escape hatch. The acceptance criteria now require checking both `push.paths` and `pull_request.paths`, avoiding naive file-wide grep semantics, matching explicit eval probe conventions, avoiding eval-runner changes, preserving protected `Makefile` behavior, narrowing scope to `Makefile` and `harness.yaml`, and documenting rollback/unblock behavior.

## Open Questions

- None.
