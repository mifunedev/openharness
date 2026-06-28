# PRD — Dedupe Merged Autopilot Refs

## Summary
Prevent `/autopilot` from rebuilding open `autopilot` tickets whose PRs already merged to `development` but whose issues stayed open because GitHub closing keywords only auto-close on the default branch.

## Goals
- Extend queue dedupe from open PR references to open **and merged** PR references.
- Reuse the same local reference matching signals for both PR states: linked metadata, branch, title, and body.
- Preserve issue-queue-first behavior for tickets with no open or merged PR reference.
- Add a deterministic eval probe for the merged-PR dedupe contract.

## Non-Goals
- Do not auto-close issues or mutate already-merged PRs.
- Do not change autopilot caps, executor selection, or `/ship-spec` finalization.
- Do not alter the final launch guard for active sessions/open PRs except for documenting the merged-queue skip.

## User Stories

### US-001 — Skip completed-but-open queue tickets
As the harness operator, I want `/autopilot` to skip open `autopilot` issues when a merged PR already references them so the loop does not rebuild shipped work.

Acceptance criteria:
- `.claude/skills/autopilot/SKILL.md` fetches recent merged PRs alongside open PRs before queue selection.
- The issue-reference matcher is shared across open and merged PR JSON caches.
- Candidate issues with merged refs are skipped with `DEDUPE_STATE` and console output explaining the merged PR reference.
- The queue rationale and no-actionable-item prose mention open or merged PR references.

### US-002 — Guard the merged dedupe invariant
As a future maintainer, I want an eval probe that fails if merged-PR dedupe disappears from the autopilot skill.

Acceptance criteria:
- Add `.oh/evals/probes/autopilot-merged-pr-reference-dedupe.sh` as a Tier-A probe.
- Keep `.oh/evals/probes/autopilot-open-pr-reference-dedupe.sh` aligned with the revised rationale text.
- `bash .oh/evals/probes/autopilot-open-pr-reference-dedupe.sh` passes.
- `bash .oh/evals/probes/autopilot-merged-pr-reference-dedupe.sh` passes.

### US-003 — Record the operator model
As a future agent, I want docs/wiki/changelog context that explains why merged PR references matter for a `development`-targeting workflow.

Acceptance criteria:
- `CHANGELOG.md` has Unreleased entries for the probe and behavior change.
- `wiki/autopilot.md` explains the queue selection model, cites source lines, and links adjacent entries.
- `wiki/raw/2026-06-20-autopilot-selection.md` captures the source snapshot for the wiki entry.
- `wiki/README.md` includes the new entry and `bash .oh/evals/probes/wiki-readme-index.sh` passes.

## Wiki Alignment

- **Impact**: REQUIRED
- **Local entries**: `wiki/autopilot.md` to create/update
- **Spec alignment**: The wiki must teach that GitHub `autopilot` issues are the queue, but completed development-branch PRs can leave issues open; selection therefore dedupes both open and merged PR references before building.
- **DeepWiki comparison**: No relevant public DeepWiki page found for this narrow selection invariant; use the local DeepWiki-style source-files-first layout from `context/rules/wiki.md`.
- **Acceptance criteria**: US-003 updates `wiki/autopilot.md`, refreshes `wiki/README.md`, and verifies `bash .oh/evals/probes/wiki-readme-index.sh`.
