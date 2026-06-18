# PRD — Detect Codex zero-credit stuck sessions

## Summary

Extend the generic `/watchdog` stuck-session detector so autopilot tmux sessions frozen at Codex zero-credit / usage-limit prompts are treated the same as Claude usage-limit prompts: safe to kill, clearly logged, and guarded by eval coverage.

## Goals

- Recognize terminal Codex credit-exhaustion prompts in `cron-autopilot-*` and `autopilot-*` tmux panes.
- Keep the detector conservative: match known terminal stuck signatures (`usage_limit_reached`, HTTP 429, `Credits-Balance":"0"`) rather than arbitrary Codex output.
- Add a Tier-A eval probe so future edits cannot silently drop Codex stuck-session coverage.
- Record the user-visible watchdog reliability fix in `CHANGELOG.md`.

## Non-Goals

- Do not change autopilot selection, caps, issue filing, or PR finalization behavior.
- Do not change Codex fallback behavior in `scripts/cron-runtime.ts` or `scripts/ralph.sh`.
- Do not kill sessions based on age alone.
- Do not auto-merge or close any PR/issue.

## User Stories

### US-001 — Detect Codex zero-credit stuck prompts

As the harness operator, I want `/watchdog` to recognize Codex zero-credit stuck sessions so hourly autopilot does not wedge repeatedly when Codex is out of credits.

Acceptance criteria:

- `.claude/skills/watchdog/SKILL.md` documents Codex zero-credit / usage-limit prompts as terminal stuck-session signals.
- The stuck-session shell snippet matches `usage_limit_reached`, `status_code 429`, and `Credits-Balance":"0` in addition to the existing Claude resume/limit prompts.
- The snippet inspects enough pane tail context to catch multi-line Codex error banners while staying bounded.
- Existing stuck-session safety remains: only `cron-autopilot-*` and `autopilot-*` sessions are candidates, and age alone is not enough.

### US-002 — Guard the detector and changelog it

As a maintainer, I want regression coverage and release notes for the new watchdog signatures so the fix persists across future watchdog rewrites.

Acceptance criteria:

- Add `evals/probes/watchdog-stuck-sessions.sh` as a Tier-A source-text probe for the stuck-session contract.
- The probe fails unless `/watchdog` includes the existing Claude resume/limit patterns and the new Codex `usage_limit_reached`, `status_code 429`, and `Credits-Balance":"0` patterns.
- The probe passes with `bash evals/probes/watchdog-stuck-sessions.sh`.
- `CHANGELOG.md` records the fix under `## [Unreleased]` / `### Fixed` and links issue #240.

## Wiki Alignment

- **Impact**: NOT-APPLICABLE
- **Local entries**: none
- **Spec alignment**: This is a narrow watchdog text/probe reliability fix, not a new architecture, workflow, or reusable concept.
- **DeepWiki comparison**: Not required; no public subsystem model changes.
- **Acceptance criteria**: none

## Critique Synthesis

Critics found no high-severity issues. The main risk is over-broad killing; mitigated by preserving the existing autopilot-session-only candidate filter and requiring explicit terminal prompt signatures.
