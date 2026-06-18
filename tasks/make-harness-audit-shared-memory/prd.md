# PRD — make-harness-audit-shared-memory

## Summary
Make `/harness-audit` load durable long-term memory from the runtime log root when it runs inside an isolated cron worktree, while preserving source inspection against the worktree under audit.

## Problem
`/harness-audit` already distinguishes `AUDIT_ROOT` (source checkout under audit) from `AUDIT_LOG_ROOT` (shared runtime observability checkout). Its context snapshot uses `AUDIT_LOG_ROOT` for daily memory logs, but still tails `AUDIT_ROOT/memory/MEMORY.md` for long-term memory. In cron worktree mode, `AUDIT_ROOT` can be a public/template checkout with an empty `memory/MEMORY.md`, so auditors lose durable lessons even though the real memory exists in the shared root.

## Goals
- Keep source inspection rooted at `AUDIT_ROOT`.
- Read durable long-term memory from `AUDIT_LOG_ROOT/memory/MEMORY.md`.
- Guard the contract with a deterministic eval probe.
- Document the behavior in the harness wiki.

## Non-goals
- Do not move, rewrite, or merge memory files.
- Do not change cron runtime worktree creation.
- Do not alter unrelated harness-audit auditor prompts.

## User stories

### US-001 — Read durable memory from the log root
As an autopilot audit, I want `/harness-audit` to tail `AUDIT_LOG_ROOT/memory/MEMORY.md`, so isolated cron worktrees still see the shared durable lessons.

Acceptance criteria:
- `.claude/skills/harness-audit/SKILL.md` tails `$AUDIT_LOG_ROOT/memory/MEMORY.md` for recent long-term memory.
- Source checkout listings and package/CI/worktree inspection still use `$AUDIT_ROOT`.
- The context snapshot comments explain why memory/log context can differ from source inspection.
- The context snapshot prints whether long-term memory was `loaded` or `missing-or-unreadable` from `AUDIT_LOG_ROOT`.
- Memory/log-related auditor instructions point to the Context Snapshot / `AUDIT_LOG_ROOT` while source inspections remain on `AUDIT_ROOT`.

### US-002 — Guard against memory-root regression
As a maintainer, I want a probe to fail if `/harness-audit` reverts to reading long-term memory from `AUDIT_ROOT`, so the worktree-mode bug cannot silently return.

Acceptance criteria:
- `evals/probes/harness-audit-memory-path.sh` asserts `$AUDIT_LOG_ROOT/memory/MEMORY.md` is used.
- The probe asserts `$AUDIT_ROOT/memory/MEMORY.md` is not used for long-term memory.
- The probe guards the memory load-status disclosure and auditor prompt direction.
- The probe passes locally.

### US-003 — Document the harness-audit root split
As a future agent, I want a source-backed wiki entry explaining `AUDIT_ROOT` vs `AUDIT_LOG_ROOT`, so I do not reintroduce the wrong-memory read during future audit changes.

Acceptance criteria:
- `wiki/harness-audit.md` documents the source/root split, missing-memory diagnostic, with relevant source files and system relationships.
- `wiki/README.md` indexes the new entry.
- `bash evals/probes/wiki-readme-index.sh` passes.

## Wiki Alignment

- **Impact**: REQUIRED
- **Local entries**: create `wiki/harness-audit.md`; refresh `wiki/README.md`.
- **Spec alignment**: The entry must explain that source inspection uses `AUDIT_ROOT`, while durable memory and runtime observability use `AUDIT_LOG_ROOT` when cron worktrees are ephemeral.
- **DeepWiki comparison**: No relevant DeepWiki page was available from the local corpus; use the repository source files and the existing `cron-runtime` entry's source-first style.
- **Acceptance criteria**: US-003 covers the wiki entry and index probe.

## Verification
- `bash evals/probes/harness-audit-memory-path.sh`
- `bash evals/probes/wiki-readme-index.sh`
- `bash .claude/skills/eval/run.sh --probe harness-audit-memory-path`
- `git diff --check`
