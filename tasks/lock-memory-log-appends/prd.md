# PRD — Lock memory log appends

## Summary

Route remaining skill-documented writes to `memory/<today>/log.md` through `scripts/locked-append.sh` so concurrent autonomous sessions append whole records consistently.

## Problem

The harness already provides `scripts/locked-append.sh` and uses it for several shared memory/liveness logs, but two skill contracts still show direct `cat >> ...memory/$TODAY/log.md` heredocs. Those examples can be copied by future agents and can interleave with other cron or autopilot writes.

## Goals

- Replace direct memory-log append examples in `/context-audit` and `/health-check` with the locked append helper.
- Keep `.claude/skills/*` and `.pi/skills/*` copies synchronized.
- Add a deterministic probe that fails if these skill contracts regress to direct memory-log append redirection.
- Record the change in the changelog.

## Non-Goals

- Do not change `scripts/locked-append.sh` semantics.
- Do not rewrite unrelated cron liveness append guidance handled by separate work.
- Do not alter sandbox application logic.

## User Stories

### US-001 — Context audit uses locked memory append

As an autonomous harness operator, I want `/context-audit` memory-log guidance to use `scripts/locked-append.sh` so concurrent log writers do not interleave records.

Acceptance criteria:
- `.claude/skills/context-audit/SKILL.md` routes the Memory Protocol heredoc through `scripts/locked-append.sh "$HARNESS/memory/$TODAY/log.md"`.
- `.pi/skills/context-audit/SKILL.md` has the same content as the `.claude` copy.

### US-002 — Health check uses locked memory append

As an autonomous harness operator, I want `/health-check` memory-log guidance to use `scripts/locked-append.sh` so resource-check logs share the same append discipline as other skills.

Acceptance criteria:
- `.claude/skills/health-check/SKILL.md` routes the Memory Protocol heredoc through `scripts/locked-append.sh "memory/$TODAY/log.md"`.
- `.pi/skills/health-check/SKILL.md` has the same content as the `.claude` copy.

### US-003 — Regression probe and changelog

As a future maintainer, I want CI-visible coverage for the locked-memory-append invariant.

Acceptance criteria:
- `evals/probes/memory-log-locked-append.sh` fails on direct `cat >> ...memory/$TODAY/log.md` examples in the affected skill contracts.
- The new probe passes locally.
- `CHANGELOG.md` records the fix under `[Unreleased]`.

## Wiki Alignment

- **Impact**: NOT-APPLICABLE
- **Local entries**: none
- **Spec alignment**: This is a narrow consistency hardening of existing skill snippets and an eval probe; it does not introduce a new harness concept beyond the already-documented locked append helper.
- **DeepWiki comparison**: no relevant public DeepWiki page required for this narrow source-level guard.
- **Acceptance criteria**: N/A.
