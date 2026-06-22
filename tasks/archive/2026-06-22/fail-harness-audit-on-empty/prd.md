# PRD — Fail /harness-audit closed on empty auditor outputs

## Summary

Teach `/harness-audit` to treat missing or empty required auditor output as a failed audit input rather than synthesizing from no evidence.

## Problem

During the autopilot research pass for issue #246, all four `/harness-audit` sub-agent calls completed with `No output` and zero tool uses. The skill currently instructs the orchestrator to synthesize after agents return, but it does not explicitly require a non-empty-output validation gate before ranking findings. A no-evidence audit can therefore look like a valid low-signal audit.

## Goals

- Fail closed when any required auditor output is absent, blank, or missing its expected sentinel shape.
- Preserve the Memory Protocol on the failure path so the run is diagnosable later.
- Add deterministic eval coverage that guards the skill instruction contract.

## Non-Goals

- Do not change the Agent/sub-agent runner implementation.
- Do not alter the four-auditor composition or auditor prompts beyond the output-validation contract.
- Do not implement a retry/backoff mechanism for failed auditors.

## Wiki Alignment

- **Impact**: NOT-APPLICABLE
- **Local entries**: `none`
- **Spec alignment**: This is a narrow skill reliability guard and eval probe; it does not introduce a reusable architecture model or user-facing concept.
- **DeepWiki comparison**: No relevant DeepWiki page is required; the change is confined to `/harness-audit` operational instructions.
- **Acceptance criteria**: No wiki update required.

## User Stories

### US-001 — Add the fail-closed auditor-output gate

As the harness orchestrator, I want `/harness-audit` to validate required auditor outputs before synthesis so that empty sub-agent returns cannot be mistaken for real findings.

**Acceptance Criteria**

- `.claude/skills/harness-audit/SKILL.md` adds a validation step before synthesis.
- The validation requires each required auditor block to include a non-empty expected start sentinel: `PM_FINDINGS`, `IMP_FINDINGS`, `CRITIC_FINDINGS`, `EXP_FINDINGS`.
- The validation requires each auditor block to include `END`.
- The failure path names missing or empty auditors, emits `FAIL-AUDITOR-OUTPUT`, skips tier ranking/recommended actions, and still appends the Memory Protocol log.
- No source changes are made to the Agent runner.

### US-002 — Guard the contract with an eval probe

As the maintainer, I want a deterministic eval probe for the `/harness-audit` empty-output gate so future skill edits cannot silently remove it.

**Acceptance Criteria**

- Add `evals/probes/harness-audit-empty-output-gate.sh` with Tier-A metadata.
- The probe resolves the repository root from `${BASH_SOURCE[0]}`.
- The probe returns REGRESSION when the skill lacks the expected sentinels, `FAIL-AUDITOR-OUTPUT`, the missing/empty-auditor language, or instructions to skip ranking on failure.
- Run the new probe and the eval runner; update `evals/RESULTS.md` if the runner rewrites it.
- Add a `CHANGELOG.md` entry under `## [Unreleased]`.
