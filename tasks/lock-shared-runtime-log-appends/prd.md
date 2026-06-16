# PRD — Lock shared runtime log appends

## Summary

Add a tiny locked append helper and adoption guard so critical autopilot/caps multi-line writes to shared harness runtime logs (`memory/<today>/log.md` and `crons/.cron.log`) are serialized instead of relying on raw append snippets.

## Background

`/harness-audit` identified shared append files as the top fresh, non-duplicated harness reliability risk. Autopilot, heartbeat, watchdog, and manual skills can run concurrently from isolated worktrees and kept tmux sessions, but they append multi-line memory/liveness records to shared files in the root checkout. `context/rules/memory.md` currently documents no locking mechanism, and recent logs show malformed entries. The fix should be small: source-controlled helper, tests, targeted skill/rule adoption, and a guard probe.

## Goals

- Serialize whole-record appends for the critical autopilot/caps shared-log writes without introducing a service or database.
- Make the convention discoverable for future skills and cron snippets.
- Guard the critical autopilot path against regressions to raw multi-line append snippets.

## Non-goals

- Do not redesign the memory system or change daily-log storage semantics.
- Do not modify `scripts/cron-runtime.ts` or protected cron definitions.
- Do not migrate historical log entries.
- Do not claim every existing heartbeat/watchdog/manual writer is migrated in this change; unmigrated writers remain a documented follow-up surface.
- Do not add a background daemon, database, or cross-host locking.

## User Stories

### US-001 — Provide a locked append helper

As the orchestrator, I want a tiny helper for shared runtime log writes so concurrent agents append complete records rather than interleaving lines.

Acceptance criteria:

- `scripts/locked-append.sh` exists, is executable, and appends stdin to a target path.
- The helper creates the target parent directory when missing.
- The helper serializes writes with `flock` when available and falls back to a best-effort direct append with a clear warning when `flock` is unavailable; the degraded fallback is documented as non-serialized.
- The helper writes each caller's stdin as one record while preserving exact bytes.
- The helper uses a lock strategy that creates no unignored runtime artifacts in the repository checkout.
- The helper rejects missing target arguments with a non-zero exit and usage message.

### US-002 — Adopt the helper in critical autopilot log snippets

As a maintainer reading autopilot instructions, I want the highest-frequency shared runtime log snippets to use the helper so future runs follow the locking convention.

Acceptance criteria:

- `.claude/skills/autopilot/SKILL.md` and `.pi/skills/autopilot/SKILL.md` define their liveness helper using `scripts/locked-append.sh` rather than raw `printf >>`.
- The autopilot memory-log example pipes the complete heredoc record through `scripts/locked-append.sh` rather than raw `cat >>`.
- `scripts/autopilot-caps.sh` uses `scripts/locked-append.sh` for both memory and liveness appends because it can run before an agent session starts.
- If the helper is missing, non-executable, or fails inside `scripts/autopilot-caps.sh`, cap status selection still returns the intended status; logging failure is visible but must not turn a cap preflight into a hard failure.
- The adoption preserves existing status tokens and log text byte-for-byte aside from serialization mechanics.

### US-003 — Document the shared-log append convention

As a future skill author, I want the memory rule to name the locked append contract so new shared runtime logs do not reintroduce raw multi-line appends.

Acceptance criteria:

- `context/rules/memory.md` states that shared runtime logs should use `scripts/locked-append.sh` or an equivalent `flock`-guarded helper when the writer runs from cron/worktree/shared-root paths.
- The rule distinguishes local scratch writes from shared root runtime logs.
- The docs mention that the helper is record-level serialization, not a durable queue or cross-host lock.
- The docs explicitly state this change migrates the autopilot/caps critical path first and leaves broader heartbeat/watchdog/manual-writer migration as follow-up work.

### US-004 — Test and guard the contract

As the harness, I want automated coverage for the helper and a regression probe for critical autopilot paths.

Acceptance criteria:

- `scripts/__tests__/locked-append.test.ts` covers missing argument failure, parent directory creation, exact byte preservation, multi-line records, and concurrent writer serialization.
- The existing `evals/probes/autopilot-worktree-log-root.sh` is updated to validate `scripts/locked-append.sh` adoption while preserving the shared-root routing invariant.
- A Tier-A eval probe exists under `evals/probes/` and fails if the critical autopilot/caps paths use raw shared-log append snippets instead of `scripts/locked-append.sh`.
- `bash -n scripts/locked-append.sh scripts/autopilot-caps.sh evals/probes/<probe>.sh evals/probes/autopilot-worktree-log-root.sh` passes.
- `pnpm vitest run scripts/__tests__/locked-append.test.ts` passes.
- `CHANGELOG.md` records the locked append helper under `## [Unreleased]`.

## Critic-mitigation notes

- Protected-path avoidance: this PRD explicitly forbids editing `scripts/cron-runtime.ts` and protected cron definitions. It does not delete or deprecate protected paths.
- Existing-probe mitigation: update `evals/probes/autopilot-worktree-log-root.sh` in the same change so it checks helper-mediated writes and does not fail on the intentional removal of raw append snippets.
- Scope control: adoption is limited to the critical autopilot/caps path plus docs/tests; broader heartbeat/watchdog/manual-writer migration is explicitly documented as follow-up, so the feature promises only critical-path serialization.
