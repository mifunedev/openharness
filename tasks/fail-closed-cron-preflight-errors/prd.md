# PRD — Fail-closed cron preflight errors

## Summary

Cron `preflight:` gates must fail closed when the gate cannot be evaluated, so a missing/invalid/timed-out safety check cannot spawn a worktree, tmux session, or agent.

## Selection rationale

Research selection: the autopilot queue had no actionable unlinked issue; `/harness-audit` ranked the cron preflight fail-open behavior as the top non-duplicated harness-infra reliability finding because it can bypass the autopilot cap gate before any model/runtime work starts. Filed as #206.

## Goals

- Preserve the existing green-path and cap-trip `runPreflight()` behavior.
- Convert preflight infrastructure errors from fail-open to fail-closed.
- Keep the failure non-destructive: log `PREFLIGHT_ERROR`, then `SKIPPED_PREFLIGHT`, with no worktree/tmux/agent spawn.
- Add regression coverage in both unit tests and the eval probe.

## Non-goals

- Do not change `scripts/autopilot-caps.sh`'s own GitHub/API fail-open policy (`PROCEED-GH-ERROR`).
- Do not change cron scheduling, overlap policy, or the autopilot PR caps.
- Do not touch sandbox application code.

## User stories

### US-001 — Fail closed on preflight infrastructure errors

As the cron runtime, I want invalid/missing/timed-out configured preflight gates to return a non-zero status so unsafe runs are skipped before spawn.

Acceptance criteria:
- `runPreflight()` returns `status !== 0` for invalid preflight paths.
- `runPreflight()` returns `status !== 0` for missing/unexecutable preflight scripts and spawn timeouts.
- Each infrastructure error still logs `PREFLIGHT_ERROR` for liveness/debugging.
- `fire()` logs `SKIPPED_PREFLIGHT` and does not spawn tmux/worktree/agent when `runPreflight()` reports one of these errors.

### US-002 — Preserve valid gate behavior

As the autopilot cap gate, I want normal green/skip outcomes to remain unchanged.

Acceptance criteria:
- A preflight script exiting `0` still returns `status: 0` and the final stdout line as the reason.
- A preflight script exiting non-zero still returns that exit code and final stdout line.
- `scripts/autopilot-caps.sh` still emits and tests `PROCEED-GH-ERROR` for GitHub/API failures.

### US-003 — Guard the contract

As a maintainer, I want tests and eval coverage that prevent regression to fail-open runtime preflight errors.

Acceptance criteria:
- `scripts/__tests__/cron-runtime.test.ts` asserts invalid, missing, and timeout preflight cases fail closed.
- `evals/probes/autopilot-preflight-gate.sh` checks for the fail-closed runtime contract.
- Targeted tests and the preflight eval probe pass.
