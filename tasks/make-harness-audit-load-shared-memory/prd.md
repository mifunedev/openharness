# PRD — Make /harness-audit load shared memory

## Summary

Make `/harness-audit` read durable long-term memory from the shared runtime log root (`AUDIT_LOG_ROOT`) when running inside an isolated cron worktree, while preserving source inspection against the isolated checkout (`AUDIT_ROOT`).

## Goals

- Prevent autopilot research audits from using template-empty `memory/MEMORY.md` files in ephemeral cron worktrees.
- Keep harness source inspection worktree-local so audits still evaluate the branch under test.
- Add a deterministic eval guard that fails if the long-term memory tail reverts to `AUDIT_ROOT`.

## Non-Goals

- Do not change auditor prompts beyond the context snapshot path semantics.
- Do not alter autopilot selection, cap enforcement, or cron worktree creation.
- Do not move or rewrite memory files.

## User Stories

### US-001 — Read durable memory from `AUDIT_LOG_ROOT`

As the autopilot loop, I want `/harness-audit` to tail shared long-term memory in cron worktree mode so research uses durable lessons rather than template-empty worktree memory.

Acceptance criteria:
- The skill keeps the existing resolution order: `AUDIT_LOG_ROOT="${AUTOPILOT_LOG_ROOT:-$AUDIT_ROOT}"`, then derives the shared worktree-list root when `CRON_WORKTREE` is set and no explicit log root was provided.
- Manual/root-mode runs remain safe: when `AUDIT_LOG_ROOT` is unset, missing, or lacks `memory/MEMORY.md`, the `tail ... 2>/dev/null` behavior stays non-fatal.
- The executable context-snapshot command tails `"$AUDIT_LOG_ROOT/memory/MEMORY.md"`, not `"$AUDIT_ROOT/memory/MEMORY.md"`, for recent long-term memory.
- Source inspection paths continue to use `AUDIT_ROOT` for skills, agents, crons, wiki, package files, CI definitions, and worktree listing.
- The skill text explains that long-term memory is a durable/runtime artifact while source inspection remains worktree-local.

### US-002 — Guard the memory-root contract with eval

As a maintainer, I want a deterministic eval probe to catch regressions in the `/harness-audit` memory path contract.

Acceptance criteria:
- `evals/probes/harness-audit-memory-path.sh` fails if the executable context-snapshot tail command uses `AUDIT_ROOT/memory/MEMORY.md` for long-term memory.
- The probe may allow explanatory prose or tables to mention `memory/MEMORY.md`; it must guard the live tail command, not every textual mention.
- The probe passes only when the skill still resolves `AUDIT_ROOT` from `CRON_WORKTREE` and uses `AUDIT_LOG_ROOT/memory/MEMORY.md` for the memory tail.
- The probe remains free of hardcoded checkout paths.

### US-003 — Update release notes and task state

As a reviewer, I want the task artifacts and changelog to document the behavioral fix.

Acceptance criteria:
- `CHANGELOG.md` records the fix under `## [Unreleased]`.
- `critique.md` preserves the pre-implementation critic findings and mitigation synthesis; `prd.json`, `prompt.md`, and `progress.txt` reflect implementation completion.
- `/eval` is run and `evals/RESULTS.md` is refreshed.

## Wiki Alignment

- **Impact**: NOT-APPLICABLE
- **Local entries**: none
- **Spec alignment**: This is a narrow internal path-root bug fix guarded by an eval probe and explicit skill prose; it does not introduce a new public operator workflow. The reusable root-semantics distinction (`AUDIT_ROOT` = source checkout, `AUDIT_LOG_ROOT` = runtime/durable logs and memory) is documented in the skill itself where future auditors read it before execution.
- **DeepWiki comparison**: no relevant DeepWiki page required for this narrow source-path correction.
- **Acceptance criteria**: changelog + eval guard are sufficient documentation for reviewers and future agents.

## Critique Synthesis

Critics flagged one high-severity ambiguity: `AUDIT_LOG_ROOT` fallback behavior was underspecified. Mitigation is encoded directly in US-001: keep the existing resolution order (`AUTOPILOT_LOG_ROOT` override, then shared worktree-list root in cron worktree mode, otherwise `AUDIT_ROOT`) and preserve non-fatal missing-file behavior. Medium/low findings were also mitigated: US-002 now scopes the grep to the executable tail command, US-003 preserves critique as pre-implementation evidence, and the Wiki Alignment section explains why skill-local prose plus the eval guard is sufficient for this narrow internal fix.
