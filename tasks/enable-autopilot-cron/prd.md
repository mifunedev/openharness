# PRD — Enable autopilot cron in source

## Summary
Enable the committed autopilot cron so a cron runtime restart preserves the documented hourly self-improvement loop.

## Goals
- Align `crons/autopilot.md` frontmatter with the documented hourly autopilot contract.
- Add a deterministic eval probe that fails if the committed cron is disabled while retaining the hourly schedule and required runtime safeguards.
- Record the harness-infra change for reviewers.

## Non-Goals
- Do not change cap math, issue selection, executor behavior, or session lifecycle.
- Do not touch sandbox application code.
- Do not restart the live cron runtime; this PR only changes source state.

## User Stories

### US-001 — Enable the committed cron
As a harness operator, I want `crons/autopilot.md` to be enabled in source so restarting `cron-system` does not silently stop hourly autopilot.

Acceptance criteria:
- `crons/autopilot.md` has `enabled: true`.
- Existing `schedule`, `tmux`, `worktree`, `agent`, `preflight`, and `repo` safeguards remain unchanged.

### US-002 — Guard the contract
As a future maintainer, I want an eval probe to catch accidental disabling or weakening of the autopilot cron.

Acceptance criteria:
- Add `evals/probes/autopilot-cron-enabled.sh`.
- The probe checks `enabled: true`, hourly schedule at minute 5, `tmux: true`, `worktree: true`, `agent: pi`, `preflight: scripts/autopilot-caps.sh`, and `repo: mifunedev/openharness`.
- The targeted probe passes.

### US-003 — Document and validate
As a reviewer, I want the change visible in release notes and validated by the harness suite.

Acceptance criteria:
- `CHANGELOG.md` records the fix under `[Unreleased]`.
- `/eval` is run and `evals/RESULTS.md` is refreshed if needed.

## Wiki Alignment

- **Impact**: NOT-APPLICABLE
- **Local entries**: none
- **Spec alignment**: This is a narrow source-config correction plus eval guard. The existing `wiki/cron-runtime.md` already documents that `enabled` frontmatter controls schedulability and that frontmatter changes require SIGHUP/restart.
- **DeepWiki comparison**: No new runtime mechanism or terminology; no DeepWiki update required.
- **Acceptance criteria**: No wiki artifact required for this narrow config fix.

## Critique acknowledgment
Critics were represented by the /harness-audit finding that selected this work: source cron disabled conflicts with documented hourly autopilot behavior and can stop the loop after restart. The PRD scopes the fix to enabling the cron and guarding the invariant without changing runtime behavior or caps.
