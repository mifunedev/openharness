# Critique — make-harness-audit-shared-memory

Generated 2026-06-18; reviews `prd.md` post-/prd, pre-/ralph.

## Critic A — Implementer lens

CRITIC_A — IMPLEMENTER LENS
[SEVERITY: M] [STORY: US-001] [FINDING] PRD only requires the parent context snapshot to tail `$AUDIT_LOG_ROOT/memory/MEMORY.md`, but existing auditor mandates still direct sub-agents to inspect `AUDIT_ROOT` and read `memory/` / `memory/MEMORY.md`, so implementers can satisfy AC while auditors still re-read template-empty worktree memory. | [EVIDENCE: tasks/make-harness-audit-shared-memory/prd.md US-001 AC; .claude/skills/harness-audit/SKILL.md:221-235] | [RECOMMENDATION] Add explicit AC that memory/log-related auditor instructions use the context snapshot or `$AUDIT_LOG_ROOT`, while source inspections remain `$AUDIT_ROOT`; clarify that the “Do not alter unrelated auditor prompts” non-goal does not forbid memory-path prompt fixes.
[SEVERITY: L] [STORY: US-002] [FINDING] Probe requirement is vulnerable to brittle string-grep implementations that fail on explanatory comments or docs mentioning the forbidden path, rather than actual long-term-memory reads. | [EVIDENCE: tasks/make-harness-audit-shared-memory/prd.md US-002 AC: “asserts `$AUDIT_ROOT/memory/MEMORY.md` is not used for long-term memory”] | [RECOMMENDATION] Specify the probe should check executable context-snapshot/read commands, not all prose occurrences, or define the allowed comment/documentation pattern.
END

## Critic B — User lens

CRITIC_B — USER LENS
[SEVERITY: M] [STORY: US-001] Missing user-visible failure state when `AUDIT_LOG_ROOT/memory/MEMORY.md` is absent or unreadable | [EVIDENCE: PRD § US-001 acceptance criteria] | Require the context snapshot to show resolved `AUDIT_LOG_ROOT` and an explicit `loaded/missing/unreadable` memory status instead of silently continuing.
[SEVERITY: M] [STORY: US-002] Probe requirement can be satisfied by static path checks without proving the audit actually loads log-root memory content | [EVIDENCE: PRD § US-002 acceptance criteria] | Require a fixture/sentinel test with distinct `AUDIT_ROOT` and `AUDIT_LOG_ROOT` memory files, asserting only the log-root sentinel appears.
[SEVERITY: L] [STORY: US-003] Wiki acceptance does not require documenting the failure/diagnostic behavior users should expect when roots differ or memory is missing | [EVIDENCE: PRD § US-003 acceptance criteria] | Add a short troubleshooting note to `wiki/harness-audit.md` covering root mismatch, missing memory, and how to verify which root was used.
END

## Synthesis
- **High-severity findings**: 0
- **Medium-severity findings**: 3
- **Low-severity findings**: 2
- **Recommendation**: PROCEED

Medium findings were mitigated in the PRD and implementation: memory/log-related Explorer instructions now explicitly use the Context Snapshot / `AUDIT_LOG_ROOT`, the context snapshot emits `long_term_memory: loaded` or `missing-or-unreadable`, the eval probe guards both the load-status line and auditor-prompt direction, and `wiki/harness-audit.md` includes troubleshooting for missing/unreadable log-root memory. The fixture/sentinel recommendation was addressed with executable text guards rather than a shell fixture because the skill artifact is markdown instructions, not a standalone shell program.
