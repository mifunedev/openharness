# PRD — Close autopilot no-PR sessions

## Summary

Make autopilot's no-PR terminal paths explicitly close their cron-created Pi tmux session after liveness and memory logs are written, so cap skips / nothing-new / critic-halt runs do not leave useless sessions and isolated cron worktrees alive.

## Problem

Autopilot's session lifecycle distinguishes PR-producing runs (keep the tmux session for manual review) from no-PR runs (no continuation state). The current prose assumes no-PR sessions auto-close when no keep marker exists. In practice, Pi's attachable TUI can remain alive after a terminal no-PR outcome, leaving sessions like `cron-autopilot-0615-0905` and their `.worktrees/cron/` checkouts around even though they completed `SKIPPED-CAP-DAILY`.

## Goals

- Add an explicit best-effort self-close helper for no-PR terminal paths.
- Preserve PR-producing session persistence unchanged.
- Add a lightweight regression probe so the contract stays visible in `/eval`.

## Non-Goals

- Do not change cron-runtime process launching.
- Do not reap existing historical sessions or worktrees in this task.
- Do not change cap math or selection behavior.
- Do not change sandbox application code.

## User Stories

### US-001 — Define no-PR session close helper

As the autopilot skill, I need a helper that closes the current cron tmux session only for no-PR terminal paths, so manual runs and PR-producing runs are unaffected.

Acceptance criteria:
- `.claude/skills/autopilot/SKILL.md` defines `close_no_pr_session()` near the existing session helper functions.
- The helper no-ops when `$SESSION` is empty.
- The helper skips closure when a keep marker exists.
- The helper removes the session-scoped overlap pidfile before closing.
- The helper uses a detached `tmux kill-session -t "$SESSION"` command so the skill can finish logging before tmux termination.

### US-002 — Call helper on no-PR exits

As an operator, I want no-PR terminal outcomes to self-close after logging, so only sessions with useful continuation state remain.

Acceptance criteria:
- The canonical no-PR terminal paths document calling `close_no_pr_session` after memory/liveness logging and active-marker cleanup.
- Covered paths include cap skips, duplicate/nothing-new exits, no-survivor research, critic HALT before PR, and preflight fail/owned-WIP exits.
- PR-producing paths still touch `$KEEP` and do not call the helper.

### US-003 — Guard the contract in evals

As a maintainer, I want `/eval` to catch regressions where the no-PR close contract disappears.

Acceptance criteria:
- Add `evals/probes/autopilot-no-pr-session-close.sh`.
- The probe passes only when the autopilot skill defines `close_no_pr_session`, uses `tmux kill-session -t "$SESSION"`, checks `$KEEP`, and documents no-PR paths using the helper.
- `bash evals/probes/autopilot-no-pr-session-close.sh` passes.

## Selection rationale

Research selection: queue was empty; the audit ranked current no-PR session/worktree accumulation as a high-impact, low-effort reliability finding. Filed as #209.
