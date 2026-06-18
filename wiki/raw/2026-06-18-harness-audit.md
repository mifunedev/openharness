# Harness Audit Shared Memory Root Finding — 2026-06-18

Source: hourly autopilot `/harness-audit` run in isolated cron worktree `/home/sandbox/harness/.worktrees/cron/cron-autopilot-0618-0005`.

Explorer Auditor finding:

> [MEMORY] [SEVERITY: H] [EFFORT: M] `/harness-audit` reads long-term memory from isolated `AUDIT_ROOT`, but this cron worktree has template-empty `memory/MEMORY.md`; real lessons live in shared root, so auditors lose durable context. Evidence: `.claude/skills/harness-audit/SKILL.md:91`; worktree `memory/MEMORY.md`; shared-root `memory/MEMORY.md`.

Resolution in issue #432:

- Keep source inspection rooted at `AUDIT_ROOT`.
- Read durable long-term memory from `AUDIT_LOG_ROOT/memory/MEMORY.md`.
- Guard the split with `evals/probes/harness-audit-memory-path.sh`.
