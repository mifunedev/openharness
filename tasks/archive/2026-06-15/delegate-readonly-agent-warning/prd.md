# PRD: Read-only sub-agent-type warning in /delegate + guard probe

## Introduction

`/delegate` (`.claude/skills/delegate/SKILL.md`) lists **Agent: Implementer**, **Agent: Critic**, and **Agent: PM** as worker resources in its §Reference table (~lines 242–244) but never warns that these sub-agent types are **read-only**. Their definitions grant `tools: Read, Glob, Grep, Bash` only — no `Write`/`Edit` (verified in `.claude/agents/{implementer,critic,pm}.md`). A worker spawned with one of these `subagent_type`s to create or modify files **silently produces zero file changes**. File-writing workers must use `subagent_type: general-purpose` (or `claude`), which the skill never mentions.

This is a recurring, documented failure (`memory/MEMORY.md` 2026-06-10, tagged `rl-delegation`, promised probe `rl-delegation-20260610`) with no enforcement path. This feature adds the missing warning to the skill at both the point-of-use and the reference table, and adds a deterministic `/eval` probe that guards the warning against regression.

## Goals

- Make the read-only constraint of `implementer`/`pm`/`critic` sub-agent types impossible to miss when reading `/delegate`.
- Tell the reader exactly what to use instead (`subagent_type: general-purpose` / `claude`) for any worker that writes or edits files.
- Add a deterministic 3-state probe that fails if the warning regresses out of the skill, closing the promised `rl-delegation` probe debt.
- Change only two files; touch no agent definitions and no `/delegate` execution logic.

## User Stories

### US-001: Warn at the point of use (Worker configuration)

**Description:** As an orchestrator reading `/delegate` while spawning workers, I want the read-only constraint stated in the Worker-configuration section so that I pick the right `subagent_type` before a wave silently no-ops.

**Acceptance Criteria:**

- [ ] In `.claude/skills/delegate/SKILL.md`, locate the **"Worker configuration:"** block under §Execute waves (the bullet list currently containing `Model` and `run_in_background` — find by heading/anchor text, NOT line number). Add a new bullet there.
- [ ] The new bullet states that `implementer`, `pm`, and `critic` sub-agent types are **read-only** (tools: Read, Glob, Grep, Bash) and silently make **zero** file changes.
- [ ] The bullet is actionable: it tells the reader to set `subagent_type: general-purpose` (or `claude`) in the `Agent` tool call for any worker that must `Write`/`Edit` files.
- [ ] After the edit, `grep -n "read-only" .claude/skills/delegate/SKILL.md` returns a hit within the Worker-configuration block, and `general-purpose` appears in that same bullet.
- [ ] No other section's meaning is changed; no agent definition files edited.

### US-002: Annotate the Key Resources table

**Description:** As a reader scanning the §Reference resource table, I want the read-only agent types annotated so the constraint is visible where the agents are listed.

**Acceptance Criteria:**

- [ ] In the §Reference **"Key Resources"** table (find by heading text), annotate the Implementer / Critic / PM rows as `read-only — no Write/Edit` using an **inline note appended to the existing `Path` cell** (do NOT add a new column; the table is 2-column and adding a column would require rewriting all rows).
- [ ] Add a note (a new row or a sentence directly under the table) naming `general-purpose` (or `claude`) as the type to use for any worker that writes or edits files, noting `general-purpose` is a built-in type with no agent-definition file (so no `.claude/agents/general-purpose.md` path is referenced).
- [ ] Do NOT modify or "fix" the existing `Agent: Council` row (a pre-existing stale reference, out of scope).
- [ ] After the edit, `grep -n "read-only" .claude/skills/delegate/SKILL.md` returns a hit in the §Reference table region.
- [ ] Table markdown still renders: every row still has exactly 2 pipe-delimited cells.

### US-003: Add the guard probe

**Description:** As the harness eval suite, I want a deterministic probe that verifies the `/delegate` read-only warning is present so a future edit cannot silently strip it.

**Acceptance Criteria:**

- [ ] New file `evals/probes/rl-delegation-write-worker.sh`, executable (`chmod +x`), mirrors the existing probe convention in `evals/probes/clean-restore.sh` (shebang `#!/usr/bin/env bash`, `# tier: A`, `# source:`, `# desc:` header, `set -euo pipefail`, `ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"`, all status messages to **stderr** `>&2`).
- [ ] The `# source:` header uses the canonical format: `# source: memory/MEMORY.md 2026-06-10 (rl-delegation) #57`.
- [ ] SKIPPED (exit 2) when `.claude/skills/delegate/SKILL.md` is absent.
- [ ] The probe scopes its check to the relevant region (Worker-configuration block and/or §Reference table) rather than the whole file — e.g. extract the section with `awk`/`sed` then grep within it — so an unrelated occurrence elsewhere cannot cause a false PASS.
- [ ] PASS (exit 0) iff the skill's warning region contains BOTH (a) a `read-only` warning that explicitly names at least one of `implementer`/`pm`/`critic` AND (b) a `general-purpose` recommendation for write workers.
- [ ] REGRESSION (exit 1) if either required element is absent; the message distinguishes "section/region not found" from "required phrase missing".
- [ ] Running `bash evals/probes/rl-delegation-write-worker.sh` against the updated skill exits 0 and prints `PASS`; temporarily stripping the warning makes it exit 1 with `REGRESSION` (spot-checked, then reverted).

### US-004: Eval gate green

**Description:** As the autopilot eval gate, I want the new probe registered and green with no green→red regression elsewhere so the change is safe to ship.

**Acceptance Criteria:**

- [ ] `bash .claude/skills/eval/run.sh` (or `/eval`) runs the suite; `evals/RESULTS.md` lists `rl-delegation-write-worker` as PASS.
- [ ] No NEW green→red regression is introduced — verified via the **runner aggregate exit code** (`$?` == 0), NOT by the absence of REGRESSION rows in RESULTS.md. The pre-existing `next-dev-prod` REGRESSION (a host-state probe, red on the base) is expected and does NOT count against this story.
- [ ] `evals/RESULTS.md` is committed on the branch as a generated artifact (it must not block merge if a concurrent run leaves it stale).

### US-005: Changelog entry

**Description:** As a maintainer, I want the workflow-visible skill change recorded in the changelog per `context/rules/git.md` § Changelog.

**Acceptance Criteria:**

- [ ] `CHANGELOG.md` gains a one-line entry under `## [Unreleased]` → `### Changed` (or `### Added`), imperative mood, linking issue #57, noting the `/delegate` read-only sub-agent-type warning + guard probe.
- [ ] Entry committed in the same branch as the change.

## Functional Requirements

- FR-1: `delegate/SKILL.md` MUST warn, in the Worker-configuration block, that `implementer`/`pm`/`critic` are read-only and silently make zero file changes.
- FR-2: `delegate/SKILL.md` MUST recommend `subagent_type: general-purpose` (or `claude`) for any worker that writes or edits files, at both the Worker-configuration block and the §Reference table.
- FR-3: `delegate/SKILL.md` §Reference Key Resources table MUST annotate the Implementer/Critic/PM rows as read-only.
- FR-4: `evals/probes/rl-delegation-write-worker.sh` MUST be a deterministic 3-state oracle (PASS=0 / REGRESSION=1 / SKIPPED=2) mirroring `evals/probes/clean-restore.sh`.
- FR-5: The probe MUST pass against the updated skill and the overall suite MUST show no new green→red regression.

## Non-Goals

- NOT modifying `.claude/agents/implementer.md`, `.claude/agents/critic.md`, or `.claude/agents/pm.md` (agent tool grants stay as-is).
- NOT changing `/delegate` execution logic, wave-spawning behavior, or recursive-delegation rules.
- NOT building the other 9 promised-but-missing probes (separate scope).
- NOT auto-fixing existing `/delegate` usages elsewhere in the repo.

## Technical Considerations

- Probe convention is canonical in `evals/probes/clean-restore.sh`: stderr messages, `exit 0/1/2`, `ROOT` derivation two levels up from the probe file.
- The probe should match on stable, intentional phrases (e.g. `read-only` and `general-purpose`) rather than brittle full-sentence matches, so benign rewording does not trip a false REGRESSION while still catching wholesale removal.
- This is a docs/skill + eval change with no runtime code path; CI relevance is lint/format + the probe suite.

## Success Metrics

- A reader of `/delegate` can determine the correct `subagent_type` for a file-writing worker without consulting memory or agent definitions.
- A future edit that removes the warning is caught by `rl-delegation-write-worker` going red.

## Critic synthesis (Stage 4 — PROCEED)

Two critics (implementer + user lens) reviewed this PRD before any GitHub-side state was created. **0 high-severity, 7 medium, several low** findings; **0 protected-path violations**; no destructive operations. Recommendation: **PROCEED**. The medium findings were cheap to address and have been folded into the ACs above:

- Line-number anchors replaced with section-heading anchors (US-001, US-002).
- Probe greps scoped to the warning region, not whole-file; stderr output; canonical `# source:` header; explicit-agent-name assertion; section-absent vs phrase-absent message (US-003).
- `general-purpose` documented as a built-in type with no agent file — no broken `.claude/agents/general-purpose.md` path; stale `Agent: Council` row left untouched as out-of-scope (US-002).
- "No new regression" gated on the runner exit code, acknowledging the pre-existing host-state `next-dev-prod` red (US-004).
- CHANGELOG entry added as US-005 per `context/rules/git.md` § Changelog.

Full critique at `tasks/delegate-readonly-agent-warning/critique.md`.

## Open Questions

- None — scope and file set are fixed by the plan.
