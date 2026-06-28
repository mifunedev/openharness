# PRD: Align PRD Skill Output Path Contract

## Introduction

The `/prd` skill currently names two different PRD output locations. Its early job step says to write `.oh/tasks/prd-[feature-name].md`, while the output/checklist section and downstream tooling expect `.oh/tasks/<feature-name>/prd.md`. Align the skill and add a deterministic guard so the pipeline keeps a single task-folder artifact contract.

## Goals

- Make `.oh/tasks/<feature-name>/prd.md` the only documented `/prd` output path.
- Remove the stale flat `.oh/tasks/prd-[feature-name].md` instruction.
- Guard the contract with a Tier-A eval probe.
- Preserve synchronized provider-facing skill behavior.

## User Stories

### US-001: Canonicalize the `/prd` output location

**Description:** As a harness operator, I want the PRD skill to document one canonical output path so downstream `/ralph` and `/ship-spec` stages can reliably find task artifacts.

**Acceptance Criteria:**

- [x] `.claude/skills/prd/SKILL.md` no longer references `.oh/tasks/prd-[feature-name].md`.
- [x] The job step says to save to `.oh/tasks/<feature-name>/prd.md`.
- [x] Existing output/checklist language remains aligned with `.oh/tasks/<feature-name>/prd.md`.
- [x] Mirrored Pi skill content resolves to the same canonical path when present.

### US-002: Guard against stale flat PRD paths

**Description:** As a future maintainer, I want a deterministic eval probe to fail if the stale flat PRD path returns.

**Acceptance Criteria:**

- [x] Add `.oh/evals/probes/prd-output-path-contract.sh`.
- [x] The probe fails on `.oh/tasks/prd-[feature-name].md` in provider-facing PRD skill docs.
- [x] The probe passes only when `.oh/tasks/<feature-name>/prd.md` is present.
- [x] The probe resolves the repo root from `${BASH_SOURCE[0]}`.

### US-003: Record the change for review

**Description:** As a reviewer, I want task and changelog artifacts that explain why the path contract changed.

**Acceptance Criteria:**

- [x] `.oh/tasks/align-prd-skill-output-path/prd.md` and `prd.json` describe the work.
- [x] `CHANGELOG.md` records the fix under `[Unreleased]`.
- [x] `/eval` runs without a new green-to-red regression before the PR is marked ready.

## Functional Requirements

- FR-1: `/prd` instructions must use `.oh/tasks/<feature-name>/prd.md` consistently.
- FR-2: The stale flat `.oh/tasks/prd-[feature-name].md` path must be absent from PRD skill docs.
- FR-3: A Tier-A eval probe must guard both absence of the stale path and presence of the canonical path.

## Non-Goals

- No change to `/ralph` JSON schema.
- No change to branch naming or task slug rules.
- No migration of historical task files.

## Technical Considerations

The `.pi/skills/prd/SKILL.md` path is present as a hardlinked provider copy in this checkout; updating the tracked `.claude` source updates the local Pi copy as well.

## Success Metrics

- The focused probe exits 0.
- The full eval runner exits 0 or reports no new green-to-red regression.
- PR reviewers see a single canonical task-folder path in `/prd`.

## Open Questions

- None.
