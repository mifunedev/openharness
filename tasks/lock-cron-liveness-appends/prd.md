# PRD — Lock Cron Liveness Appends

## Introduction

Cron liveness logs are the harness flight recorder. This change makes all tracked cron/runtime `.cron.log` writers use the existing `scripts/locked-append.sh` helper so concurrent fires write whole records instead of raw, potentially interleaved appends.

## Goals

- Route runtime-owned `.cron.log` writes through a locked append helper.
- Replace raw liveness append snippets in weekly cron prompts with locked append snippets.
- Add a deterministic guard so future cron/runtime edits cannot reintroduce raw `.cron.log` appends.
- Update operator-facing docs/wiki to describe the invariant.

## Non-Goals

- Do not change cron schedules, enabled state, overlap/worktree policy, or agent selection.
- Do not rewrite the locked append helper or introduce a new log format.
- Do not clean existing `.cron.log` history or stale worktrees.

## User Stories

### US-001 — Runtime liveness uses locked append

As an operator, I want in-process runtime events and shell-wrapper agent events to write `.cron.log` records through the existing locked append helper so concurrent runtime writes remain whole-line records.

**Acceptance Criteria**

- `scripts/cron-runtime.ts` defines a single locked append helper path for `.cron.log` writes.
- In-process `log()` writes pipe complete tab-separated records through `scripts/locked-append.sh`.
- Shell-wrapper liveness emitted by `buildCronAgentCommand`/`cronLogCommand` pipes complete records through `scripts/locked-append.sh` instead of `>> LOG_FILE`.
- Existing timestamp, id, status, and message formatting semantics remain unchanged.

### US-002 — Cron prompt liveness guidance uses locked append

As a future cron author, I want tracked cron prompts to show the locked append convention so prompt-authored liveness snippets do not teach raw shared-log appends.

**Acceptance Criteria**

- `crons/cleanup-tasks.md` uses `scripts/locked-append.sh crons/.cron.log` for both blocked and success liveness snippets.
- `crons/eval-weekly.md` uses `scripts/locked-append.sh crons/.cron.log` for its mandatory closing liveness snippet.
- Repository grep shows no raw `.cron.log` append guidance in tracked cron prompts except guard probes that search for regressions.

### US-003 — Regression coverage and docs

As a maintainer, I want tests, eval probes, and docs to lock the cron liveness invariant so it is not re-derived or regressed.

**Acceptance Criteria**

- `scripts/__tests__/cron-runtime.test.ts` verifies runtime/shell liveness is observable via the locked append path and that generated shell commands contain `scripts/locked-append.sh` rather than raw appends.
- `evals/probes/locked-append-critical-path.sh` guards runtime, autopilot/caps, and weekly cron prompt liveness paths.
- `crons/README.md`, `wiki/cron-runtime.md`, `wiki/README.md`, and `CHANGELOG.md` document the invariant/update.
- Targeted cron runtime tests and the locked append probe pass.

## Wiki Alignment

- **Impact**: REQUIRED
- **Local entries**: `wiki/cron-runtime.md` to update, `wiki/README.md` to refresh.
- **Spec alignment**: The wiki must explain that both runtime-side `log()` and shell-wrapper agent liveness records are serialized through `scripts/locked-append.sh`, matching prompt-level cron guidance.
- **DeepWiki comparison**: No live DeepWiki fetch was performed in this cron run; the local wiki entry follows the existing DeepWiki-style structure with relevant source files, line-cited claims, system relationships, and See Also.
- **Acceptance criteria**: US-003 must update the wiki entry/index and pass `bash evals/probes/wiki-readme-index.sh`.
