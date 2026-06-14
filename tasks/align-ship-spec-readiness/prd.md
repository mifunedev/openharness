# PRD — Align ship-spec readiness guidance

## Summary
Update `/ship-spec` so its executable instructions match the durable operator requirement: draft PR creation is an observability checkpoint, while successful runs continue through implementation, `/eval`, `/ci-status`, and `gh pr ready`.

## Goals
- Remove stale draft-only/manual-finalization language from the active ship-spec skill.
- Update the root skill table so future agents see the ready-for-review terminal state.
- Add eval coverage that fails if draft-only `/ship-spec` guidance returns.

## Non-goals
- Do not rewrite the `/ship-spec` implementation model beyond readiness/finalization guidance.
- Do not auto-merge PRs.
- Do not modify sandbox application code.

## User stories

### US-001 — Correct ship-spec finalization contract
As the harness maintainer, I want `/ship-spec` to describe implementation, eval, CI, and ready finalization so agents do not leave successful PRs draft-only.

Acceptance criteria:
- `.claude/skills/ship-spec/SKILL.md` no longer says v1 stops at draft PR creation.
- Stage 9 remains a draft PR checkpoint for observability.
- New finalization stages document executor completion, `/eval`, `/ci-status`, and `gh pr ready`.
- Draft status is reserved for blocked gates; successful terminal state is ready-for-review.

### US-002 — Align root skill summary
As the orchestrator, I want `AGENTS.md` to summarize `/ship-spec` accurately so the always-loaded contract matches the skill.

Acceptance criteria:
- The `/ship-spec` row says draft PR is a checkpoint, not the end.
- The row includes the ready-for-review terminal state.

### US-003 — Guard the correction with eval coverage
As the maintainer, I want a deterministic probe so stale draft-only guidance cannot silently return.

Acceptance criteria:
- `evals/probes/ship-spec-ready-finalization.sh` fails on the retired draft-only phrases.
- The probe requires ready-finalization tokens in the skill and root skill table.
- The probe passes locally and under the `/eval` runner.

## Critique synthesis
Audit finding is documentation/process-contract drift only. No protected-path deletion or application-code change is involved. Recommendation: PROCEED.
