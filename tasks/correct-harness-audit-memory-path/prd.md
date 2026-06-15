# PRD — Correct harness-audit memory path

## Summary

Fix `/harness-audit` so its context snapshot reads the real long-term memory file at `memory/MEMORY.md`, then guard the path with a Tier-A eval probe.

## Goals

- Restore long-term memory context to empty-queue autopilot research runs.
- Prevent regressions where `/harness-audit` points at a nonexistent root `MEMORY.md`.
- Keep the change limited to harness-infra docs/skills/evals/changelog.

## Non-Goals

- Do not redesign `/harness-audit` ranking or auditor prompts.
- Do not alter sandbox application code.
- Do not migrate the memory directory layout.

## User Stories

### US-001 — Correct the harness-audit memory reference

As the orchestrator, I need `/harness-audit` to read the actual long-term memory file so research-mode autopilot selections include durable lessons.

**Acceptance criteria**

- `.claude/skills/harness-audit/SKILL.md` tails `/home/sandbox/harness/memory/MEMORY.md` in the context snapshot.
- Other long-term-memory references in the harness-audit skill use `memory/MEMORY.md` where they point at the canonical file.

### US-002 — Guard the memory path with an eval probe

As the orchestrator, I need a deterministic guard so stale root-memory references cannot silently return.

**Acceptance criteria**

- `evals/probes/harness-audit-memory-path.sh` fails if the harness-audit skill references root `MEMORY.md` instead of `memory/MEMORY.md`.
- The probe passes after the fix.
- `CHANGELOG.md` records the user-visible harness-infra correction under `## [Unreleased]`.
