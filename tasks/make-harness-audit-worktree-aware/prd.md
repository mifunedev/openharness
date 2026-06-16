# PRD — make-harness-audit-worktree-aware

## Summary

Make `/harness-audit` inspect the active cron worktree instead of a hardcoded shared root checkout, and pin the behavior with an eval probe.

## Goals

- Preserve autopilot source isolation when research runs from `$CRON_WORKTREE`.
- Keep runtime log access explicit and separate from source inspection.
- Prevent future hardcoded `/home/sandbox/harness` source paths in the harness-audit skill.

## Non-goals

- Do not change the auditor roles, ranking matrix, or GitHub issue/PR selection behavior.
- Do not change cron runtime worktree creation.
- Do not modify sandbox application code.

## User stories

### US-001 — Resolve audit root dynamically

As an autopilot cron run, I need `/harness-audit` to inspect the active worktree so findings reflect the candidate checkout.

Acceptance criteria:
- `.claude/skills/harness-audit/SKILL.md` defines `AUDIT_ROOT` from valid `$CRON_WORKTREE` when present.
- Standalone/manual runs fall back to `git rev-parse --show-toplevel`.
- Source-inspection commands use `$AUDIT_ROOT` or repo-relative paths, not `/home/sandbox/harness`.

### US-002 — Separate runtime log root from source root

As an operator, I need daily runtime logs to remain discoverable while source inspection stays isolated.

Acceptance criteria:
- The context snapshot documents `AUDIT_LOG_ROOT` for runtime observability logs.
- Long-term tracked memory reads use `$AUDIT_ROOT/memory/MEMORY.md`.
- The only log-root exception is documented near the snapshot commands.

### US-003 — Guard the contract

As the harness, I need a deterministic probe so the hardcoded root path cannot return silently.

Acceptance criteria:
- `evals/probes/harness-audit-memory-path.sh` requires `AUDIT_ROOT` and `CRON_WORKTREE` handling.
- The probe fails on any `/home/sandbox/harness` literal in the harness-audit skill.
- The probe passes against the updated skill, and `/eval` has no new green→red regression.
- `CHANGELOG.md` records the fix under `## [Unreleased]`.
