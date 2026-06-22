# Critique — lock-shared-runtime-log-appends

Generated 2026-06-15; reviews `prd.md` post-/prd, pre-/ralph.

## Critic A — Implementer lens

CRITIC_A — IMPLEMENTER LENS
[SEVERITY: H] [STORY: US-004] [Existing Tier-A probe will fail after replacing raw autopilot appends unless it is updated in scope] | [EVIDENCE: `evals/probes/autopilot-worktree-log-root.sh` expects raw `>>` and `cat >>` snippets] | [RECOMMENDATION] Add an AC requiring updates to existing autopilot log-root probe so it validates `scripts/locked-append.sh` while preserving shared-root routing.
[SEVERITY: M] [STORY: US-004] [Script test suite location and invocation are underspecified; repo has no existing shell test suite convention] | [EVIDENCE: AC text: “The relevant script test suite passes.”] | [RECOMMENDATION] Specify exact test path and command.
[SEVERITY: M] [STORY: US-001] [Lockfile placement is unspecified and may create unignored runtime artifacts that dirty the shared root checkout] | [EVIDENCE: `.gitignore` ignores `crons/*.log` but not likely adjacent lock files such as `crons/.cron.log.lock`] | [RECOMMENDATION] Require a lock strategy that creates no unignored artifacts.

## Critic B — User lens

CRITIC_B — USER LENS
[SEVERITY: H] [STORY: *] [PRD promises shared runtime logs will be serialized, but adoption is limited to autopilot/caps while heartbeat, watchdog, and manual skills remain possible raw writers] | [EVIDENCE: PRD Summary, Background, Goals, US-002, Non-goals] | [RECOMMENDATION] Either narrow the promise to “critical autopilot/caps writes” or add explicit follow-up/acceptance for every shared writer; do not broaden into protected cron edits without explicit override.
[SEVERITY: M] [STORY: US-001] [`flock`-missing fallback directly appends, which violates the core user expectation of serialized records exactly when the helper is trusted as the convention] | [EVIDENCE: US-001 acceptance criteria] | [RECOMMENDATION] Specify fail-closed for shared runtime logs, or explicitly document/test the fallback as degraded best-effort with visible stderr and no guarantee.
[SEVERITY: M] [STORY: US-002] [Rollback behavior is undefined if `scripts/locked-append.sh` is missing, non-executable, or breaks under `set -e` in `scripts/autopilot-caps.sh`] | [EVIDENCE: US-002 acceptance criteria] | [RECOMMENDATION] Add acceptance criteria that cap checks still return the intended status on logging-helper failure, or require a safe inline fallback scoped to logging only.

## Synthesis

- **High-severity findings**: 2, both mitigated in `prd.md` before GitHub-side branch/PR state.
- **Medium-severity findings**: 4, all addressed with acceptance-criteria tightening.
- **Mitigations applied**:
  - US-004 now requires updating `evals/probes/autopilot-worktree-log-root.sh` and names exact test paths/commands.
  - US-001 now requires a no-unignored-artifact lock strategy and documents the `flock`-missing fallback as degraded/non-serialized.
  - US-002 now requires `scripts/autopilot-caps.sh` to preserve cap status even when helper logging fails.
  - Summary/goals/non-goals/docs now narrow the feature promise to the critical autopilot/caps path and explicitly leave broader writer migration as follow-up.
- **Recommendation**: PROCEED.
