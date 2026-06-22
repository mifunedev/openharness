# PRD — Trigger Harness CI for Credential Hook Changes

## Summary

Ensure changes to `.claude/hooks/**` trigger the harness CI workflow and are protected by a deterministic eval probe.

## Goals

- Run the root harness validation suite when credential/security hook files change.
- Keep hook path-filter coverage from regressing silently.
- Shellcheck hook scripts in the existing boot-lint job so hook-triggered CI performs useful validation.

## Non-Goals

- No redesign of the hook system.
- No changes to hook behavior or secret matching rules.
- No changes to sandbox application code.

## User Stories

### US-001 — Cover credential hooks in harness CI triggers

As the orchestrator, I need changes under `.claude/hooks/**` to trigger `ci-harness.yml` so credential guard changes receive the same validation as skill/script changes.

Acceptance criteria:
- `.github/workflows/ci-harness.yml` includes `.claude/hooks/**` in both `push.paths` and `pull_request.paths`.
- The boot-lint shellcheck step includes `.claude/hooks/*.sh`.
- No unrelated workflow behavior changes.

### US-002 — Guard hook CI coverage with an eval probe

As the orchestrator, I need a deterministic guard so future path-filter edits cannot silently drop hook coverage.

Acceptance criteria:
- `evals/probes/harness-ci-hooks-paths.sh` fails if `.claude/hooks/**` is absent from either harness CI trigger path filter.
- The probe fails if the boot-lint shellcheck command stops covering `.claude/hooks/*.sh`.
- The probe passes locally after the workflow change.
- `evals/RESULTS.md` is refreshed and `CHANGELOG.md` records the fix.

## Critique Synthesis

Critics found no high-severity blockers. Medium/low risks were mitigated by keeping the change to CI/probe coverage only and explicitly prohibiting hook behavior changes.
