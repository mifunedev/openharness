# PRD: Fix stale path references in harness-audit & skill-lint skills

## Introduction

The `/harness-audit` and `/skill-lint` skills instruct their sub-agents to inspect directories that no longer exist after the wiki/cron restructure. The wiki now lives at `wiki/` (not `docs/wiki/`) and heartbeats are cron definitions under `crons/` (not `workspace/heartbeats/`). Because the skill instructions still point at the retired directories, sub-agents `ls` phantom paths and reason over empty results — producing false-negative findings such as "no wiki pages" or "no heartbeats configured". This is a self-referential reliability defect: every `/harness-audit` run silently degrades its own audit. This PRD corrects the stale references and adds a guard probe so the drift cannot return unnoticed.

## Goals

- Replace every stale `docs/wiki/` reference with `wiki/` and every stale `workspace/heartbeats/` reference with `crons/` in the two affected skill files.
- Reword surrounding prose so "heartbeat files" reads correctly against cron `.md` definitions under `crons/`.
- Leave the false-positive prose reference in `harness-context/SKILL.md:31` untouched.
- Add an `evals/probes/` guard probe that REGRESSES if either retired path token reappears in `.claude/skills/`.
- Record the fix in `CHANGELOG.md`.

## User Stories

### US-001: Correct stale paths in harness-audit/SKILL.md

**Description:** As an orchestrator running `/harness-audit`, I want the audit sub-agents to inspect the real `wiki/` and `crons/` directories so the audit reports accurate findings instead of false negatives.

**Acceptance Criteria:**

- [ ] All 4 `docs/wiki/` occurrences (lines ~61, 129, 205, 309) replaced with `wiki/` in `.claude/skills/harness-audit/SKILL.md`.
- [ ] All 4 `workspace/heartbeats/` occurrences (lines ~59, 179, 207, 306) replaced with `crons/`, with surrounding prose reworded so "heartbeat files" reads as "cron definitions in `crons/`" where the phrasing would otherwise be wrong.
- [ ] `grep -E 'docs/wiki/|workspace/heartbeats/' .claude/skills/harness-audit/SKILL.md` returns zero matches.
- [ ] The audit-area intent is preserved (wiki-utilization and heartbeat/cron-health checks still make sense against the new paths).

### US-002: Correct stale path in skill-lint/SKILL.md

**Description:** As an orchestrator running `/skill-lint`, I want the heartbeat-coverage bonus signal to look at the real `crons/` directory so the lint scoring is not permanently short-circuited.

**Acceptance Criteria:**

- [ ] The single `workspace/heartbeats/` occurrence (line ~216) replaced with `crons/` in `.claude/skills/skill-lint/SKILL.md`.
- [ ] `grep -E 'workspace/heartbeats/' .claude/skills/skill-lint/SKILL.md` returns zero matches.
- [ ] `.claude/skills/harness-context/SKILL.md` is left unchanged (its "docs/wiki/changelog" is prose, not a directory path).

### US-003: Add a guard probe for retired path tokens

**Description:** As a maintainer, I want a deterministic probe that fails if the two retired *renamed-directory* tokens reappear in the skills tree, so the drift this PRD fixes cannot silently return.

**Scope note:** the probe guards ONLY `docs/wiki/` and `workspace/heartbeats/` — the two directory renames from the wiki/cron restructure that have NO legitimate use anywhere in `.claude/skills/`. It deliberately does NOT guard `apps/docs/`, bare `MEMORY.md`, or `workspace/.claude/skills/`, because those tokens have legitimate or intentional uses in other skills (see Non-Goals) and a broad guard would false-positive.

**Acceptance Criteria:**

- [ ] `evals/probes/skill-paths.sh` exists, is executable (`chmod +x`), and follows the 3-state oracle convention of `evals/probes/eval-gate.sh` (PASS=0 / REGRESSION=1 / SKIPPED=2), including repo-root detection via `${BASH_SOURCE[0]}` (no hardcoded `/home/sandbox/harness`) and `set -euo pipefail`.
- [ ] The probe's match command is exactly: `grep -rnE 'docs/wiki/|workspace/heartbeats/' "$ROOT/.claude/skills/" | grep -v 'harness-context/SKILL.md'` (full-path exclusion via piped `grep -v`, NOT GNU `--exclude` which matches basenames only). A non-empty result → exit 1 (REGRESSION) listing the offending lines.
- [ ] If `.claude/skills/` does not exist, the probe exits 2 (SKIPPED) and prints `SKIPPED` (mirrors `eval-gate.sh` absent-target handling).
- [ ] On the clean post-fix tree the probe exits 0 and prints `PASS`.
- [ ] Reintroducing a retired token into any skill file makes the probe exit 1 and print `REGRESSION` (verified by a temporary injection during implementation, then reverted; after reversion the probe must exit 0 again — confirm before commit).
- [ ] The probe is picked up by the `/eval` runner (lives in `evals/probes/*.sh`). A newly-added probe that is green on the branch cannot be a green→red regression (no prior-green baseline exists), so it does not block the autopilot §6 gate.

### US-004: Record the fix in CHANGELOG.md

**Description:** As a reviewer, I want the change recorded in the changelog so the fix is discoverable in release notes.

**Acceptance Criteria:**

- [ ] A new bullet APPENDED to the EXISTING `### Fixed` block under `## [Unreleased]` in `CHANGELOG.md` (the block already exists — do NOT create a second `### Fixed` heading), one line, imperative mood, links issue #43.

## Functional Requirements

- FR-1: The system must replace all `docs/wiki/` tokens in `harness-audit/SKILL.md` with `wiki/`.
- FR-2: The system must replace all `workspace/heartbeats/` tokens in `harness-audit/SKILL.md` and `skill-lint/SKILL.md` with `crons/`, rewording adjacent prose to remain grammatically and semantically correct.
- FR-3: The system must NOT modify `harness-context/SKILL.md`.
- FR-4: The system must add `evals/probes/skill-paths.sh` implementing a PASS/REGRESSION/SKIPPED oracle that detects retired path tokens in `.claude/skills/` (excluding `harness-context/SKILL.md`).
- FR-5: The system must add a `### Fixed` CHANGELOG entry under `## [Unreleased]` referencing #43.

## Non-Goals

- No change to the audit/lint logic or scoring beyond pointing at the correct directories.
- No edits to `harness-context/SKILL.md` or any skill other than `harness-audit` and `skill-lint`.
- No sandbox application code.
- No retroactive correction of past audit reports.
- **Deferred phantom-path candidates (named, not silently ignored):** an investigation during this PRD found additional candidate-stale tokens that are intentionally LEFT for a separate, larger task because they are either legitimate or span many skills:
  - `apps/docs/` — appears in `harness-audit`, `ci-status` (quoting the `docs.yml` workflow filter), and `strategic-proposal`. The docs app is at `packages/docs/`, but resolving this correctly requires confirming whether `docs.yml`'s path filter itself moved; out of scope here.
  - bare `MEMORY.md` (root) — appears in `harness-audit`, `delegate`, and `strategic-proposal` as a "see-also" pointer (actual file is `memory/MEMORY.md`). Low-impact pointers; a separate cleanup sweep.
  - `workspace/.claude/skills/` — this is an **intentional, guarded dual-scope** (orchestrator `.claude/skills/` + a workspace skills location) used by `context-audit` (`2>/dev/null` / `[ -d ]` guards) and `skill-lint`. It is NOT a restructure bug and must NOT be removed.
  These are excluded from both the edits and the guard probe to keep this PR tight, correct, and green-able.

## Technical Considerations

- The `docs/wiki/changelog` string in `harness-context/SKILL.md:31` is a prose enumeration of surfaces ("compose mounts… `.gitignore`, docs/wiki/changelog…"), not a literal path — it must be excluded from both the edits and the guard probe.
- The new probe must mirror the existing probe convention in `evals/probes/eval-gate.sh` (shebang, `set -euo pipefail`, repo-root detection, 3-state exit codes) so the `/eval` runner consumes it uniformly.
- Heartbeat prose in `harness-audit/SKILL.md` (e.g. "Read all files in `workspace/heartbeats/`") should become "Read all cron definitions in `crons/`" so the auditor mandate stays coherent.

## Success Metrics

- A subsequent `/harness-audit` run inspects `wiki/` and `crons/` (non-empty) rather than phantom directories.
- `grep -rE 'docs/wiki/|workspace/heartbeats/'` over the two skill files returns zero matches.
- `evals/probes/skill-paths.sh` is green in the `/eval` benchmark and flips red on token reintroduction.

## Open Questions

- None — scope is fully specified by the plan file.

---

## Critic synthesis (post-review, pre-/ralph)

Two critics (implementer + user lens) reviewed this PRD. 1 high-severity finding (probe exclusion mechanism) and 3 medium findings were raised; all are mitigated at the AC level (exact grep command pinned, prose-reword map enumerated, CHANGELOG append clarified, scope investigation resolved into named Non-Goals). 0 protected-path deletions. Recommendation: **PROCEED**. See `critique.md`.
