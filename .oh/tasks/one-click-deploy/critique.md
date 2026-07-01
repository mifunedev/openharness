# Critique — one-click-deploy

Generated 2026-06-30; reviews `prd.md` post-/prd, pre-implementation.

## Critic A — Implementer lens

CRITIC_A — IMPLEMENTER LENS
[SEVERITY: M] [STORY: US-001] [FINDING] Railway one-click URLs can be syntactically present but not guarantee a published Railway marketplace template exists. | [EVIDENCE: US-001 asks for "Railway deploy button or equivalent one-click hosted deploy link".] | [RECOMMENDATION] Treat a repo-backed Railway new-template link as the MVP and document that marketplace publication is a follow-up if Railway requires manual template approval.
[SEVERITY: M] [STORY: US-002] [FINDING] A Railway-specific image can drift from the full local sandbox image if it duplicates too much devcontainer setup. | [EVIDENCE: US-002 asks for a minimal hosted-smoke image, not full parity.] | [RECOMMENDATION] Keep Railway assets explicitly minimal, document non-parity, and guard only the hosted-smoke contract with the eval probe.
[SEVERITY: L] [STORY: US-004] [FINDING] Refreshing `evals/RESULTS.md` may create broad timestamp churn. | [EVIDENCE: US-004 requires refreshed results.] | [RECOMMENDATION] Run the eval runner once after adding the probe and keep the generated scoreboard coherent.

## Critic B — User lens

CRITIC_B — USER LENS
[SEVERITY: M] [STORY: US-003] [FINDING] Users may read "Deploy on Railway" as full Open Harness parity, including Docker socket, compose lifecycle, and long-running agent auth. | [EVIDENCE: issue #553 requests dead-easy deployment; PRD intentionally scopes hosted-smoke mode.] | [RECOMMENDATION] Put the limitation directly in README and the detailed docs before the button over-promises.
[SEVERITY: L] [STORY: US-003] [FINDING] Credential handling could be under-specified for new users. | [EVIDENCE: US-003 names env vars and safe credential handling but does not enumerate examples.] | [RECOMMENDATION] Document `GH_TOKEN` as optional for GitHub operations and keep agent/provider tokens optional and user-supplied via Railway variables.

## Synthesis

- **High-severity findings**: 0
- **Medium-severity findings**: 3
- **Low-severity findings**: 2
- **Recommendation**: PROCEED

All medium findings are mitigated by the PRD's explicit hosted-mode limitation, non-goal against runtime redesign, and US-004 drift guard. No protected-path deletion is proposed.

## Gate verdict

APPROVED
