# Critique — make-harness-audit-load-shared-memory

Generated 2026-06-18; reviews `prd.md` post-/prd, pre-/ralph.

## Critic A — Implementer lens

CRITIC_A — IMPLEMENTER LENS
[SEVERITY: H] [STORY: US-001] `AUDIT_LOG_ROOT` contract is underspecified; PRD does not say whether `/harness-audit` must compute it, consume `AUTOPILOT_LOG_ROOT`, or require an exported env var, risking manual/root-mode breakage or empty tails. | [EVIDENCE: US-001 AC: “tails "$AUDIT_LOG_ROOT/memory/MEMORY.md"”; existing pattern uses `AUTOPILOT_LOG_ROOT` fallback] | Define required resolution order and fallback behavior, e.g. `AUDIT_LOG_ROOT="${AUTOPILOT_LOG_ROOT:-$AUDIT_ROOT}"`, plus worktree root derivation when `CRON_WORKTREE` is set.
[SEVERITY: M] [STORY: US-002] Eval AC is too broad about failing on `AUDIT_ROOT/memory/MEMORY.md`; `/harness-audit` may still mention that path in docs, prompts, or path tables, so a grep-only probe could create false failures. | [EVIDENCE: US-002 AC: “fails if the context snapshot tails `AUDIT_ROOT/memory/MEMORY.md` for long-term memory”] | Specify the probe checks the executable context-snapshot tail command only, not every textual mention of memory paths.
[SEVERITY: M] [STORY: US-003] Task-artifact AC asks `critique.md` to “reflect the completed task,” which conflicts with critique’s role as pre-implementation review evidence and may cause implementers to overwrite critic findings after the fact. | [EVIDENCE: US-003 AC: “prd.json, prompt.md, progress.txt, and critique.md reflect the completed task”] | Change to “critique.md records pre-implementation findings and synthesis; progress.txt records completion.”

## Critic B — User lens

CRITIC_B — USER LENS
[SEVERITY: M] [STORY: US-001] [AUDIT_LOG_ROOT fallback/missing-file behavior is undefined, so implementers may break manual `/harness-audit` runs outside cron or fail noisily when shared memory is absent.] | [EVIDENCE: PRD US-001 acceptance criteria] | [RECOMMENDATION: Specify expected behavior when `AUDIT_LOG_ROOT` is unset, missing, or lacks `memory/MEMORY.md`.]
[SEVERITY: L] [STORY: US-003] [`critique.md` “reflect the completed task” is circular before implementation and ambiguous for critics producing this review.] | [EVIDENCE: PRD US-003 acceptance criteria] | [RECOMMENDATION: Reword to require `critique.md` to preserve pre-implementation critic findings and task state artifacts to reflect completion after implementation.]
[SEVERITY: L] [STORY: *] [Wiki impact marked NOT-APPLICABLE despite introducing a reusable root-semantics distinction (`AUDIT_ROOT` source vs `AUDIT_LOG_ROOT` runtime memory) that future agents could misapply.] | [EVIDENCE: PRD Wiki Alignment; US-001] | [RECOMMENDATION: Either add/update a concise wiki note for audit root semantics, or explicitly justify why skill text plus eval is sufficient.]

## Synthesis

- **High-severity findings**: 1, mitigated in `prd.md` US-001 by specifying the required `AUDIT_LOG_ROOT` resolution order and missing-file fallback behavior.
- **Medium-severity findings**: 3, mitigated in `prd.md` by scoping the eval guard to the executable tail command, preserving critique as pre-implementation evidence, and defining fallback behavior.
- **Low-severity findings**: 2, mitigated by clarifying task-artifact roles and documenting why the root-semantics distinction lives in the skill text rather than a new wiki entry for this narrow internal fix.
- **Recommendation**: PROCEED — no unmitigated high-severity findings remain.
