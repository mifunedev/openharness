# PRD — Harness Audit Shared Memory

## Summary
Make `/harness-audit` load durable long-term memory from the shared log root in cron worktree runs, while preserving source inspection against the active worktree.

## Goals
- Ensure `/harness-audit` context snapshots include the real durable `memory/MEMORY.md` lessons when invoked from isolated cron worktrees.
- Preserve `AUDIT_ROOT` for source checkout inspection so audits review the active worktree, not the shared root source tree.
- Add a deterministic eval guard that fails if long-term memory reads regress to `AUDIT_ROOT/memory/MEMORY.md`.

## Non-goals
- Do not change the auditor fan-out or ranking algorithm.
- Do not change runtime log routing beyond the existing `AUDIT_LOG_ROOT` behavior.
- Do not modify sandbox application code.

## Acceptance Criteria
- `harness-audit/SKILL.md` tails recent long-term memory from `AUDIT_LOG_ROOT/memory/MEMORY.md`.
- Source inspection commands continue to use `AUDIT_ROOT`.
- An eval probe guards the shared-memory path contract.
- Existing eval probes remain green.

## Wiki Alignment
- **Impact**: NOT-APPLICABLE
- **Local entries**: none
- **Spec alignment**: Narrow skill-path fix with an eval guard; no new reusable mechanism or conceptual vocabulary.
- **DeepWiki comparison**: no relevant public DeepWiki page needed for a one-line context snapshot path correction.
- **Acceptance criteria**: not applicable.
