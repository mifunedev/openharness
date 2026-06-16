# PRD — Align Workspace Onboarding Inventory

## Summary

Align the default workspace onboarding documentation with the current minimal `workspace/` template so newly provisioned agents do not see stale seed-file instructions.

## Goals

- Make `workspace/AGENTS.md` describe only files that actually ship in `workspace/`.
- Remove references to retired template files and startup-hook behavior.
- Keep the orchestrator/agent ownership boundary accurate and concise.
- Keep `/harness-audit` prompts aligned with the current workspace template shape.

## Non-Goals

- Do not add new workspace seed files or directories.
- Do not change sandbox startup behavior.
- Do not modify application code.
- Do not remove or rename any protected skill/rule paths.

## User Stories / Acceptance Criteria

### US-001 — Workspace inventory matches tracked template

As a newly provisioned workspace agent, I need `workspace/AGENTS.md` to describe the files that actually exist so I can start from a truthful map.

Acceptance criteria:
- `workspace/AGENTS.md` lists the shipped template files: `AGENTS.md` and the `CLAUDE.md -> AGENTS.md` compatibility symlink.
- It does not claim that `.claude/rules/`, `.claude/.example.env.claude`, or `.claude/settings.local.json` ship in the minimal template.
- It does not describe any `workspace/startup.sh` or startup-hook behavior.

### US-002 — Ownership guidance stays accurate

As the orchestrator, I need the workspace doc to preserve the boundary between root-owned harness infrastructure and agent/pack-owned runtime state.

Acceptance criteria:
- The doc states that packs/agents may create runtime identity, memory, skills, settings, and routines after provisioning.
- The doc keeps root-owned scheduled tasks and memory paths pointed at repo-root `crons/` and `memory/`.
- The doc does not instruct workspace agents to edit harness-infra root files as normal application work.

### US-003 — Audit prompts stop expecting removed workspace skill inventory

As a future auditor, I need `/harness-audit` to stop implying that `workspace/.claude/skills/` is expected in a minimal workspace.

Acceptance criteria:
- `.claude/skills/harness-audit/SKILL.md` asks auditors to inspect workspace pack/runtime skills only if that directory exists.
- Its reference table describes workspace skills as optional pack/runtime artifacts, not default template content.
- The harness-audit edit is copy-only and targeted: preserve frontmatter, decision flow, auditor roles, output formats, and skill behavior; do not delete, deprecate, or restructure the protected `/harness-audit` skill.

### US-004 — Change is documented and validated

Acceptance criteria:
- `CHANGELOG.md` has an `## [Unreleased]` entry for this fix.
- Targeted grep over `workspace/AGENTS.md` and `.claude/skills/harness-audit/SKILL.md` returns no stale default-template claims for removed seed files; historical changelog and pack/runtime docs may keep intentional `workspace/.claude/*` references.
- `find workspace -maxdepth 1` and `test -L workspace/CLAUDE.md && test "$(readlink workspace/CLAUDE.md)" = AGENTS.md` verify the actual template inventory.
- Lightweight relevant checks pass; do not add new evals/tests for this docs-only fix unless an existing guard already covers this surface.

## Implementation Plan

1. Update `workspace/AGENTS.md` to describe the current minimal template and where pack-created runtime files may appear later.
2. Adjust `/harness-audit` skill text so optional workspace skills are treated as optional.
3. Add a changelog bullet under `Fixed`.
4. Validate with targeted `rg`, format check, and available tests.
