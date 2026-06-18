# PRD — Detect Cron Frontmatter Drift

## Introduction

`/drift-check` currently detects cron staleness by comparing schedulable `crons/*.md` mtimes against the running `cron-system` start time. That catches many stale-runtime cases, but the skill text frames the gap as newly-merged cron files and does not explicitly guard restart-required frontmatter changes such as `agent`, `tmux`, `worktree`, `preflight`, `schedule`, and `enabled`. The detector should surface stale cron runtime configuration whenever a schedulable cron's restart-required frontmatter has changed after the runtime was armed.

## Goals

- Detect restart-required cron frontmatter drift, not just generic mtime drift.
- Keep the existing schedulable-cron qualification so README-style docs, disabled crons, missing schedules, and invalid schedules are not false positives.
- Make `/drift-check` guidance explicit that cron body edits hot-reload while frontmatter/config changes require restart or reschedule.
- Add a deterministic eval probe that fails when a non-schedule frontmatter drift is missed.

## Non-Goals

- Do not change `scripts/cron-runtime.ts` runtime behavior.
- Do not restart, signal, or mutate the live cron runtime from `/drift-check`.
- Do not broaden the detector to non-cron host resource checks; `/health-check` remains the host-resource tool.
- Do not create an always-on runtime snapshot database.
- Do not introduce new cron frontmatter fields, schema validation, migration, or normalization layers.

## Protected-Path Override Note

This task intentionally edits the protected `.claude/skills/drift-check/SKILL.md` skill because the bug is in that skill's documented detector contract. The override is limited to additive/targeted documentation and shell-snippet changes for `/drift-check`; it does not delete, deprecate, rename, or restructure the protected skill. `scripts/cron-runtime.ts` remains read-only for this task.

## User Stories

### US-001 — Detect restart-required frontmatter drift

As the harness operator, I want `/drift-check` to name restart-required cron frontmatter drift so I know when the live runtime is using stale cron configuration.

**Acceptance criteria**

- `.claude/skills/drift-check/SKILL.md` Section C explains that cron body text is hot-reloaded by `reloadBody`, while frontmatter/config fields are loaded when crons are scheduled and require SIGHUP reschedule or runtime restart.
- The Step C-2 shell block extracts a documented restart-required field set including at least `schedule`, `enabled`, `agent`, `tmux`, `worktree`, and `preflight` from each schedulable cron's leading frontmatter.
- The detector is explicitly conservative: without a runtime snapshot, it does not prove which field changed; it warns that restart-required config may be stale when a schedulable cron file changed after `RUNTIME_START`.
- A schedulable cron whose file mtime is newer than `RUNTIME_START` emits a `DRIFT-CHECK (C)` line that explicitly says restart-required frontmatter/config may be stale until SIGHUP reschedule or runtime restart.
- The aggregate `DRIFT:` wording still counts only schedulable cron files.
- The implementation remains read-only and does not execute the recommended restart.

### US-002 — Preserve the schedulable-cron predicate

As a maintainer, I want the expanded drift detector to preserve existing false-positive protections.

**Acceptance criteria**

- README-style markdown in `crons/`, disabled crons (`enabled: false`), crons with missing or empty `schedule`, Croner-invalid schedules, invalid cron ids, basename/id mismatches, and unsafe `agent` overrides remain excluded before the mtime/frontmatter comparison when those runtime predicates are represented in the drift-check shell block.
- The predicate stays property-based rather than hard-coding cron names.
- Existing probe coverage for `drift-check-cron-staleness-glob.sh` still passes.

### US-003 — Update operator documentation

As a future agent, I want drift-check's skill docs and wiki reference to teach the same body-vs-frontmatter model.

**Acceptance criteria**

- `.claude/skills/drift-check/SKILL.md` states that body-only edits hot-reload, but changes to `schedule`, `enabled`, `agent`, `tmux`, `worktree`, or `preflight` require SIGHUP reschedule or runtime restart for the live scheduler configuration.
- `wiki/cron-runtime.md` exists or is updated after implementation with DeepWiki-style source-file citations for cron frontmatter parsing, body hot-reload, SIGHUP reschedule, preflight/worktree behavior, and drift-check detection.
- `wiki/README.md` is refreshed so the new or updated wiki entry appears in the index.

### US-004 — Guard the contract in evals

As the harness, I want a Tier-A eval probe that catches regressions where non-schedule frontmatter drift is not reported.

**Acceptance criteria**

- Add or update an eval probe under `evals/probes/` that extracts the drift-check Step C-2 block and verifies the source text includes the restart-required field set (`schedule`, `enabled`, `agent`, `tmux`, `worktree`, `preflight`).
- The probe is a deterministic source-shape contract probe, not a live runtime simulation; it fails if the Step C-2 block regresses to schedule-only or mtime-only wording.
- `bash evals/probes/drift-check-cron-staleness-glob.sh` passes.
- The new or updated probe passes.
- `bash .claude/skills/eval/run.sh` exits 0 with no new green→red regression.
- `CHANGELOG.md` records the drift-check frontmatter detection fix under `## [Unreleased]`.

## Wiki Alignment

- **Impact**: REQUIRED
- **Local entries**: create or update `wiki/cron-runtime.md`; refresh `wiki/README.md`.
- **Spec alignment**: The wiki entry must explain the final cron control-plane model: frontmatter is parsed into `CronEntry` scheduling/config fields, body text is hot-reloaded at fire time, SIGHUP can reschedule crons, and `/drift-check` conservatively reports possible stale restart-required frontmatter/config after runtime start without mutating host state.
- **DeepWiki comparison**: DeepWiki's repository overview is available at `https://deepwiki.com/mifunedev/openharness`, but no dedicated cron-runtime page was found during PRD drafting; the local wiki entry should therefore use DeepWiki-style shape (relevant source files, source-backed claims, system relationships, and see-also links) based on local files.
- **Acceptance criteria**: `wiki/cron-runtime.md` includes relevant source files and line-cited claims; `wiki/README.md` is refreshed; `bash evals/probes/wiki-readme-index.sh` passes.
