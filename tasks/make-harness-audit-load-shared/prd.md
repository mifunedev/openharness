# PRD — Make Harness Audit Load Shared Memory

## Summary

`/harness-audit` must load durable long-term memory from the shared runtime log root when it runs inside an isolated cron worktree, while preserving source inspection against the active audit worktree. The change prevents autopilot research from losing recent lessons when the cron worktree's `memory/MEMORY.md` is template-empty or stale.

## Goals

- Use `AUDIT_LOG_ROOT/memory/MEMORY.md` for the context snapshot's recent long-term memory tail.
- Keep `AUDIT_ROOT` as the source checkout under audit for skills, agents, packages, workflows, wiki, and git worktree inspection.
- Add a deterministic eval probe that fails if the skill regresses to tailing `AUDIT_ROOT/memory/MEMORY.md` for long-term memory.
- Update changelog, eval results, and wiki reference material.

## Non-Goals

- Do not delete, rename, or deprecate the protected `/harness-audit` skill; only make targeted in-place edits.
- Do not change `/harness-audit` auditor prompts or ranking logic.
- Do not alter cron worktree creation, autopilot caps, or memory log write behavior.
- Do not delete or archive existing memory, wiki, or task artifacts.

## User Stories

### US-001 — Load long-term memory from the shared log root

As autopilot, when `/harness-audit` runs in a cron worktree, I want the context snapshot to tail the shared root's durable memory so research uses recent lessons.

**Acceptance criteria**
- `.claude/skills/harness-audit/SKILL.md` tails `"$AUDIT_LOG_ROOT/memory/MEMORY.md"` for recent long-term memory.
- Source inspection remains rooted at `AUDIT_ROOT` for repo files and `git worktree list`.
- The existing `AUDIT_LOG_ROOT` resolution contract remains explicit: `AUTOPILOT_LOG_ROOT` wins when set; otherwise a cron worktree falls back to the first shared root from `git worktree list --porcelain`; otherwise it stays at `AUDIT_ROOT` and missing memory remains non-fatal.
- Missing shared memory still behaves as a non-fatal missing tail (`2>/dev/null`).

### US-002 — Guard the memory-root split with an eval probe

As a maintainer, I want a probe to fail when `/harness-audit` reads long-term memory from the wrong root.

**Acceptance criteria**
- `evals/probes/harness-audit-memory-path.sh` asserts that the long-term memory tail uses `AUDIT_LOG_ROOT/memory/MEMORY.md` and fails if the skill tails `AUDIT_ROOT/memory/MEMORY.md` for recent long-term memory.
- The probe still asserts `AUDIT_ROOT`/`CRON_WORKTREE` source-root resolution and no hardcoded `/home/sandbox/harness` paths.
- The probe passes locally.

### US-003 — Record the behavior in release and wiki artifacts

As future agents, we need the durable-memory behavior documented where recurring harness mechanisms are indexed.

**Acceptance criteria**
- `CHANGELOG.md` records the fix under `## [Unreleased]`.
- `wiki/harness-audit.md` explains the `AUDIT_ROOT` vs `AUDIT_LOG_ROOT` split with source-file references and includes cron worktree troubleshooting symptoms, expected roots, and the probe to run.
- `wiki/README.md` is refreshed and `bash evals/probes/wiki-readme-index.sh` passes.
- `evals/RESULTS.md` is refreshed after running `/eval` or the eval runner.

## Wiki Alignment

- **Impact**: REQUIRED
- **Local entries**: create `wiki/harness-audit.md`; refresh `wiki/README.md`.
- **Spec alignment**: the wiki must capture that `/harness-audit` inspects source from `AUDIT_ROOT` but reads runtime observability and durable memory through `AUDIT_LOG_ROOT` when available.
- **DeepWiki comparison**: no directly relevant DeepWiki page is available in local context; use the DeepWiki-style local schema from `context/rules/wiki.md` with relevant source files, source-backed claims, relationships, and `## See Also`.
- **Acceptance criteria**: `wiki/harness-audit.md` includes relevant source files, a small relationship summary, and a cron worktree troubleshooting note; `wiki/README.md` passes `evals/probes/wiki-readme-index.sh`.

## Critique Mitigation

Critics found one high-severity AC-tightening issue: the shared-log-root behavior needed to prove the existing resolution contract, not just a string substitution. US-001 now explicitly preserves `AUTOPILOT_LOG_ROOT` precedence, cron-worktree fallback to the shared root via `git worktree list --porcelain`, and non-fatal fallback when memory is missing. Medium findings are mitigated by tightening the eval probe, adding protected-skill in-place edit constraints, and requiring wiki troubleshooting guidance.
