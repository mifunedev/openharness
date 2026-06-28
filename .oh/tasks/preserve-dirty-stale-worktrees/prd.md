# PRD — Preserve Dirty Stale Worktrees During Cleanup

## Summary

Preserve dirty, unpushed, or otherwise unrecoverable stale `.worktrees/` checkouts during the weekly cleanup cron instead of force-removing them by age alone.

## Goals

- Make `.oh/crons/cleanup-tasks.md` require a salvage/preservation gate before deleting stale registered worktrees.
- Ensure dirty, staged, untracked, unpushed, missing-upstream, or suspicious worktrees are skipped and logged for human review.
- Replace recursive orphan-directory deletion guidance with safe empty-directory removal or preservation/reporting.
- Add static eval coverage so the documented cleanup procedure cannot silently regress.

## Non-Goals

- Implementing a full runtime cleanup script; this change hardens the executable cron prompt and its static guard probes.
- Deleting existing stale worktrees in this run.
- Changing `.worktrees/agent/` or `.worktrees/project/` cleanup policy.

## User Stories

### US-001 — Registered worktree salvage gate

As an operator, I want stale registered worktrees checked for local or unpushed work before removal so unattended cleanup cannot destroy the only copy of work.

Acceptance criteria:
- The cleanup prompt checks each stale registered candidate for unstaged, staged, untracked, unpushed, or missing-upstream/branch metadata before removal.
- Any candidate with preservation risk is skipped and logged with a distinct reason.
- Only candidates that pass the preservation checks may be removed with `git worktree remove --force`.

### US-002 — Orphan directory preservation

As an operator, I want orphan `.worktrees/` folders preserved unless they are provably empty, so corrupt metadata does not justify deleting unknown files.

Acceptance criteria:
- The cleanup prompt no longer instructs unconditional recursive `rm -rf "$path"` for orphan folders.
- Non-empty or suspicious orphan folders are skipped and logged for manual review.
- Empty orphan folders may be removed with a non-recursive command.

### US-003 — Regression probe

As a maintainer, I want eval coverage that guards cleanup preservation semantics so future edits cannot reintroduce destructive cleanup guidance.

Acceptance criteria:
- `evals/probes/cleanup-tasks-worktree-grooming.sh` requires dirty/staged/untracked/unpushed preservation checks.
- The probe fails if cleanup guidance authorizes recursive orphan deletion.
- The targeted probe passes locally.

## Wiki Alignment

- **Impact**: NOT-APPLICABLE
- **Local entries**: none
- **Spec alignment**: This is a narrow cron-prompt safety hardening; it does not introduce a reusable architecture concept beyond the existing cleanup task procedure.
- **DeepWiki comparison**: No relevant public DeepWiki page is required for this prompt-level cleanup guard.
- **Acceptance criteria**: Changelog and eval probe coverage are sufficient; no wiki update required.

## Critique Resolution

Critics found no high-severity blockers before implementation. Medium/low risks are mitigated by keeping the change scoped to cleanup prompt semantics plus a static eval probe.
