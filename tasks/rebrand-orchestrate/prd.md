# PRD: Rebrand /loop-runner to /orchestrate

## Introduction

Rename the executable-loop runner skill from `/loop-runner` to `/orchestrate` without changing behavior. The current name was a defensive workaround for a `/loop` collision; `/orchestrate` is collision-free and better describes the skill's role as the mechanical runner that orchestrates loop nodes while not itself being a node.

## Goals

- Move the skill identity from `.claude/skills/loop-runner/` to `.claude/skills/orchestrate/`.
- Update only command/skill identity references from `/loop-runner` to `/orchestrate`.
- Preserve the executable-loop concept, `context/rules/loop.md`, node names, route table, `--loop-candidate-only`, and all probe-pinned contract literals.
- Rename the contract probe to `orchestrate-contract` and keep the relevant eval probes passing.
- Document the rebrand in `CHANGELOG.md`.
- Create the `/teach` skill as the post-implementation communication pass that uses wiki understanding to teach the operator what changed.

## User Stories

### US-001: Rename the runner skill identity

**Description:** As the harness maintainer, I want the runner skill directory and skill metadata to use `/orchestrate` so the command name is intentional rather than defensive.

**Rollback:** This is a rename-only `git mv`, not a deletion or deprecation. If the renamed skill cannot be validated, restore the prior active path with `git mv .claude/skills/orchestrate .claude/skills/loop-runner` before shipping.

**Acceptance Criteria:**

- [ ] Move `.claude/skills/loop-runner/` to `.claude/skills/orchestrate/` using `git mv` semantics.
- [ ] Update `.claude/skills/orchestrate/SKILL.md` frontmatter `name:` to `orchestrate`.
- [ ] Update frontmatter `description`, trigger text, and any argument/help text that names `/loop-runner`.
- [ ] Update the H1 and command-name references in the skill body from `/loop-runner` to `/orchestrate`.
- [ ] Preserve all loop concept references, `context/rules/loop.md` references, node names, and probe-pinned contract literals that do not contain the command name.
- [ ] Typecheck passes.
- [ ] Tests pass.

### US-002: Update sibling runner references

**Description:** As the harness maintainer, I want skills and loop manifest prose that invoke or name the runner to reference `/orchestrate` so the documented workflow remains coherent.

**Protected-path override:** `.claude/skills/strategic-proposal/SKILL.md` is listed in `.claude/protected-paths.txt`. This story explicitly permits a constrained, non-destructive command-reference edit in that file only: replace references to the runner command `/loop-runner` with `/orchestrate`. Do not delete, deprecate, rename, or restructure the `strategic-proposal` skill, and do not change `--loop-candidate-only` or `LOOP MODE: candidate-only`.

**Acceptance Criteria:**

- [ ] Update `.claude/skills/strategic-proposal/SKILL.md` references to the runner command from `/loop-runner` to `/orchestrate`.
- [ ] Update `.claude/skills/benchmark/SKILL.md` references to the runner command from `/loop-runner` to `/orchestrate`.
- [ ] Update the runner row in `context/rules/loop.md` from `/loop-runner` to `/orchestrate`.
- [ ] Keep `--loop-candidate-only`, `LOOP MODE: candidate-only`, `context/rules/loop.md`, "The Loop", and loop node names unchanged.
- [ ] Typecheck passes.
- [ ] Tests pass.

### US-003: Rename and update eval probes

**Description:** As the harness maintainer, I want the contract probe and repeat-gate probe to follow the renamed skill path so the eval floor guards the new command identity.

**Acceptance Criteria:**

- [ ] Move `evals/probes/loop-runner-contract.sh` to `evals/probes/orchestrate-contract.sh` using `git mv` semantics.
- [ ] Update the renamed probe's `SKILL` path, `name:` assertion, header comments, and PASS/SKIPPED/REGRESSION messages for `/orchestrate`.
- [ ] Preserve the renamed probe's non-command contract literals verbatim, including the `STATUS:` routing signal, honest halt, invariant 5, `--dry-run`, `--start`, `--max-iters`, `LOOP MODE: candidate-only`, `do not publish roadmap`, and `context/rules/loop.md` literals.
- [ ] Update `evals/probes/loop-repeat-gate.sh` internal skill path and runner command prose to `/orchestrate` while keeping the filename unchanged.
- [ ] `bash evals/probes/orchestrate-contract.sh` passes.
- [ ] `bash evals/probes/loop-repeat-gate.sh` passes.
- [ ] Typecheck passes.
- [ ] Tests pass.

### US-004: Update capability and eval result metadata

**Description:** As the harness maintainer, I want capability task metadata and eval result rows to use `/orchestrate` so benchmark surfaces match the renamed command.

**Acceptance Criteria:**

- [ ] Update `evals/capability/tasks/CB-002-walk-the-loop.md` skill metadata and command examples from `/loop-runner` to `/orchestrate`.
- [ ] Update `evals/capability/RESULTS.md` CB-002 description from `/loop-runner` to `/orchestrate`.
- [ ] Update `evals/RESULTS.md` row name from `loop-runner-contract` to `orchestrate-contract` and update that row's source text to `/orchestrate contract`.
- [ ] Permit restoring unrelated `evals/RESULTS.md` rows from base after targeted probe runs so the committed diff stays focused on the renamed row unless a real new probe result exists.
- [ ] Typecheck passes.
- [ ] Tests pass.

### US-005: Document and verify the rebrand

**Description:** As the harness maintainer, I want the changelog and final verification to show the rebrand is complete without changing loop behavior.

**Acceptance Criteria:**

- [ ] Add a `CHANGELOG.md` `## [Unreleased]` entry documenting the `/loop-runner` to `/orchestrate` rebrand.
- [ ] Update existing unreleased `/loop-runner` and `loop-runner-contract` entries in place when they describe unreleased work; leave released sections unchanged.
- [ ] `rg -n "loop-runner"` is clean outside this exact residual set: released `CHANGELOG.md` sections, `.claude/plans/**`, `evals/datasets/**/oracle/**`, gitignored `memory/[0-9]*/**`, and external `pi-loop` references.
- [ ] Run the relevant eval probes and the whole eval suite; no new green-to-red regression is introduced.
- [ ] If the active agent runtime cannot reload the renamed skill in the same session, validate via direct probe/file checks and document that a fresh session is required for live `/orchestrate --dry-run --start ideate` command verification.
- [ ] Do not rename `context/rules/loop.md`, "The Loop", loop node names, `loop-repeat-gate.sh`, `loop-handoff-consistency.sh`, `loop-benchmark-gate.sh`, `--loop-candidate-only`, or `pi-loop` references.
- [ ] Typecheck passes.
- [ ] Tests pass.

### US-006: Add the teach skill to the loop handoff

**Description:** As the harness maintainer, I want a `/teach` skill that runs after implementation/audit to revise the relevant wiki understanding and teach the operator the final mental model, so communication compounds instead of being reconstructed from PR artifacts.

**Acceptance Criteria:**

- [ ] Create `.claude/skills/teach/SKILL.md` with frontmatter `name: teach` and trigger language for `/teach`, "teach me this change", post-implementation understanding, and operator communication.
- [ ] Define `/teach` as a communication and learning pass, not an implementation, audit, or retro gate.
- [ ] Require `/teach` to read the relevant task artifacts (`tasks/<slug>/prd.md`, `progress.txt`, eval/audit evidence when present) and the relevant wiki entry before teaching.
- [ ] Require `/teach` to revise or propose revisions to the wiki first when execution changed the provisional model created during `/ship-spec`.
- [ ] Require `/teach` output to include a concise mental model, what changed, why it matters, verification evidence, known caveats, and 2-4 understanding checks for the operator.
- [ ] Update `AGENTS.md` skill documentation to include `/teach` in the Skills table.
- [ ] Update `wiki/ship-spec-orchestration.md` or the relevant wiki entry so it names `/teach` as the post-implementation communication pass paired with `/ship-spec` provisional wiki generation and `/orchestrate` final revision.
- [ ] Typecheck passes.
- [ ] Tests pass.

## Functional Requirements

- FR-1: The system must expose the runner skill at `.claude/skills/orchestrate/SKILL.md` with `name: orchestrate`.
- FR-2: The system must remove the active `.claude/skills/loop-runner/` skill path.
- FR-3: The system must update live runner command references to `/orchestrate`.
- FR-4: The system must preserve loop-concept names and files that are not runner-command identities.
- FR-5: The system must rename the contract probe to `orchestrate-contract` and update eval metadata accordingly.
- FR-6: The system must keep `loop-repeat-gate.sh` as a repeat-node probe while repointing it at the renamed skill.
- FR-7: The system must document the rebrand under `CHANGELOG.md` `## [Unreleased]`.
- FR-8: The system must avoid changing runtime behavior of the executable-loop runner.
- FR-9: The system must expose a `/teach` skill at `.claude/skills/teach/SKILL.md` for post-implementation operator understanding.
- FR-10: The system must document how `/teach` consumes the wiki/task artifacts and updates the shared model before teaching from it.

## Non-Goals

- No behavior changes to the runner algorithm, route table parsing, dry-run behavior, repeat gate, or halt semantics.
- No rename of `context/rules/loop.md`, "The Loop", loop node names, or loop-concept probe filenames other than the contract probe.
- No changes to `/autopilot`, cron behavior, or the gated autopilot-as-runner integration.
- No edits to dataset oracle fixtures solely to rewrite historical `/loop-runner` references.
- No broad historical churn outside the exact files and residual surfaces named in the user stories.
- No migration of auto-managed telemetry such as `.hermes/skills/.usage.json`.
- No requirement for `/teach` to block merge readiness, replace `/retro`, or perform code review.

## Technical Considerations

- This is harness infrastructure work, not application code.
- Use `git mv` for the skill directory and contract probe so history remains clear.
- Two eval probes are path-coupled to the skill and must be updated in lockstep.
- `evals/RESULTS.md` and `CHANGELOG.md` are shared append surfaces; keep diffs narrow and rebase if concurrent autopilot work lands first.
- The live functional check is `/orchestrate --dry-run --start ideate` after the skill is renamed and available to the active agent runtime.
- The `/teach` skill should follow the repository's existing skill format and stay focused on communication: it may ask understanding checks, but it does not mutate implementation state except for explicit wiki updates/proposals.

## Success Metrics

- `bash evals/probes/orchestrate-contract.sh` exits 0.
- `bash evals/probes/loop-repeat-gate.sh` exits 0.
- The whole eval suite reports no new green-to-red regression.
- The active skill directory is `.claude/skills/orchestrate/`, and live command references use `/orchestrate`.
- Residual `loop-runner` text is limited to documented historical or fixture surfaces.
- `.claude/skills/teach/SKILL.md` exists, is documented in `AGENTS.md`, and connects `/ship-spec` provisional wiki generation to `/orchestrate` final understanding and the teaching pass.

## Open Questions

- None. The plan locks the name, scope, and file-level boundaries.

## Critic Gate

Two critics reviewed this PRD before any GitHub-side state was created. They found one high-severity protected-path issue: US-002 touches `.claude/skills/strategic-proposal/SKILL.md`, and `strategic-proposal` is listed in `.claude/protected-paths.txt`. The PRD mitigates this at the story level with an explicit protected-path override limiting the edit to non-destructive `/loop-runner` to `/orchestrate` command-reference replacements only. Medium and low findings were acknowledged and folded into rollback, residual-grep, eval-metadata, and runtime-validation acceptance criteria.
