# Critique — make-harness-audit-load-shared

Generated 2026-06-18; reviews `prd.md` post-/prd, pre-/ralph.

## Critic A — Implementer lens
CRITIC_A — IMPLEMENTER LENS
[SEVERITY: M] [STORY: US-001] [PRD only requires changing the tail command, but leaves other harness-audit memory references ambiguous, so auditors may still be instructed to read `memory/MEMORY.md` from `AUDIT_ROOT`.] | [EVIDENCE: AC text: “`.claude/skills/harness-audit/SKILL.md` tails `"$AUDIT_LOG_ROOT/memory/MEMORY.md"`”; current skill also contains prompt/source references to `memory/MEMORY.md`] | [RECOMMENDATION: Require updating the context snapshot label/source table and any auditor prompt references so durable memory is explicitly read from `AUDIT_LOG_ROOT`, while source inspection remains `AUDIT_ROOT`.]
[SEVERITY: M] [STORY: US-002] [Eval AC can be satisfied by a brittle static string check and may not catch multiple tails or stale `AUDIT_ROOT/memory/MEMORY.md` references still present elsewhere in the skill.] | [EVIDENCE: AC text: “asserts that the long-term memory tail uses `AUDIT_LOG_ROOT/memory/MEMORY.md`”] | [RECOMMENDATION: Specify that the probe must fail if the long-term-memory section tails `AUDIT_ROOT/memory/MEMORY.md`, and should check for exactly one long-term memory tail rooted at `AUDIT_LOG_ROOT`.]
[SEVERITY: L] [STORY: US-003] [Protected-path risk is implicit: `harness-audit` is protected, but the PRD does not remind implementers that the protected skill must be edited in place, not renamed/deleted/recreated.] | [EVIDENCE: `.claude/protected-paths.txt` lists `harness-audit`; PRD Non-Goals only says “Do not delete or archive existing memory, wiki, or task artifacts.”] | [RECOMMENDATION: Add an implementation constraint: do not delete, rename, or deprecate the protected `harness-audit` skill; only make targeted in-place edits.]

## Critic B — User lens
CRITIC_B — USER LENS
[SEVERITY: H] [STORY: US-001] [Core behavior can pass as a string edit without proving the shared log root is actually selected when cron worktree env is missing or stale] | [EVIDENCE: PRD US-001 acceptance criteria] | [RECOMMENDATION: Define the `AUDIT_LOG_ROOT` resolution contract explicitly: env var precedence, fallback from isolated cron worktree to main/shared root, and expected behavior when fallback cannot be resolved.]
[SEVERITY: M] [STORY: US-003] [Wiki acceptance asks for a new reference page but does not require operational examples for future agents diagnosing stale/template-empty memory] | [EVIDENCE: PRD Wiki Alignment / US-003] | [RECOMMENDATION: Require `wiki/harness-audit.md` to include a short “cron worktree troubleshooting” section naming symptoms, expected roots, and the probe to run.]

## Synthesis
- **High-severity findings**: 1
- **Medium-severity findings**: 3
- **Recommendation**: PROCEED after AC mitigation

The single high-severity finding is an AC-tightening issue, not a protected-path or architecture halt. It is mitigated in `prd.md` by explicitly requiring the `AUDIT_LOG_ROOT` resolution contract (env var precedence, cron-worktree fallback, non-fatal unresolved fallback) and in `prd.json` by adding the same acceptance criterion to US-001. Medium findings are mitigated by requiring source-table/prompt wording alignment, a stricter probe that rejects `AUDIT_ROOT/memory/MEMORY.md` tails for long-term memory, targeted in-place edits to the protected skill, and a wiki troubleshooting section.
