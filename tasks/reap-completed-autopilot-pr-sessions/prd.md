# PRD — Reap Completed Autopilot PR Sessions

## Summary

Teach `/watchdog` to reap kept `autopilot-<branch>` tmux sessions after their associated PR is terminal and the pane is idle, preserving open or active sessions.

## Goals

- Reduce stale tmux/session clutter from completed autopilot runs.
- Preserve the manual-attach contract while a PR remains open or a pane is active.
- Make the terminal-PR + idle safety rule explicit in skill docs and eval coverage.

## Non-Goals

- Do not kill sessions solely because they are old.
- Do not change autopilot's keep-marker behavior for open PRs.
- Do not merge, close, or otherwise mutate PRs.
- Do not touch sandbox application code.

## User Stories

### US-001 — Map autopilot sessions to PR branches

As an operator, I want `/watchdog` to map `autopilot-feat-<issue>-<slug>` sessions back to the PR branch so it can determine whether the PR is still open.

Acceptance criteria:
- `/watchdog` documents the `autopilot-<branch>` sanitized session naming convention.
- The session cleanup logic derives candidate PR branch names from session names or compares session names against sanitized PR head refs.
- Sessions with matching open PRs are preserved.

### US-002 — Reap only terminal idle sessions

As an operator, I want completed autopilot sessions reaped only after the associated PR is closed or merged and the pane is idle.

Acceptance criteria:
- `/watchdog` treats `MERGED` and `CLOSED` PR states as terminal for this cleanup.
- `/watchdog` double-captures the pane over a short interval before killing a terminal-PR session.
- `/watchdog` skips candidates whose pane changes between captures.
- `/watchdog` removes `/tmp/<session>.keep` only after killing the session.

### US-003 — Report and guard the contract

As a future agent, I want the completed-session cleanup rule documented and guarded so it does not regress into age-only killing.

Acceptance criteria:
- `crons/heartbeat.md` reporting mentions terminal completed-session reaping when `/watchdog` performs it.
- An eval probe guards the terminal-PR + idle contract and the no-age-only rule.
- `CHANGELOG.md` records the behavior change under `## [Unreleased]`.

## Wiki Alignment

- **Impact**: NOT-APPLICABLE
- **Local entries**: none
- **Spec alignment**: This is a narrow watchdog skill behavior and probe update; existing skill docs are the authoritative operator-facing artifact.
- **DeepWiki comparison**: No relevant DeepWiki page was needed for this narrow session-cleanup contract.
- **Acceptance criteria**: N/A

## Critique Synthesis

Critics found no unmitigated high-severity issues. Medium risk is accidental killing of active sessions; mitigated by terminal PR state plus double-capture idle check and no age-only cleanup.
