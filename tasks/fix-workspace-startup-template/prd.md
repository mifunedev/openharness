# Remove Workspace Startup Hook

Issue: #120
PR: #122
Branch: `feat/120-fix-workspace-startup-template`

## Goal

Remove the stale `workspace/startup.sh` auto-start hook from the sandbox boot path. The current workspace template is intentionally minimal, and app/docs dev servers should be launched explicitly by the human or installed harness pack, not by a leftover root entrypoint hook.

## Acceptance Criteria

- `.devcontainer/entrypoint.sh` no longer invokes `/home/sandbox/harness/workspace/startup.sh`.
- `workspace/startup.sh` is deleted from the tracked workspace template.
- `workspace/AGENTS.md` no longer advertises `startup.sh` as part of the workspace contract.
- `.claude/skills/harness-audit/SKILL.md` no longer instructs auditors to inspect `workspace/startup.sh`; it checks for stale workspace auto-start hooks instead.
- `scripts/__tests__/workspace-startup.test.ts` is removed because the script no longer exists.
- `CHANGELOG.md` records the removal under `[Unreleased]` with issue #120.
- Same PR #122 is updated, validated, and left ready for review.
