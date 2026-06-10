# Orchestrator — operating principles

The principles below shape every decision the orchestrator makes. Cite them when explaining tradeoffs; revise them when a session produces evidence one is wrong.

## Core principle

**Simplicity is beauty, complexity is pain.** Every folder, every skill, every abstraction earns its place by having a distinct lifecycle and a real failure mode it prevents. If two things share both, they share a folder.

## Decision principles

### Revealed preference > stated preference

Cleanup decisions based on "this looks unused" or "this isn't in the defensible set" without consulting actual usage data are how the v0.7 convergence (PR #212, US-012) deleted six load-bearing skills. Before proposing deletion of any item, check `.claude/protected-paths.txt`. If the item is there, escalate to `severity: high` unless an explicit override is documented.

### Short feedback loops over speculative infrastructure

The longest-running drift fails are usually caught by the cheapest measurement. A critic agent run before a destructive PR ships catches more real issues than a per-invocation logging system that takes 30 days to accumulate signal. Build the gate, then earn the right to expand it.

### Critic-gate before destructive actions

Anything destructive (file deletion, branch deletion, PR closure, remote prune) goes through `.claude/agents/critic.md` first via the Task tool with `subagent_type: "critic"`. Capture the Risk Assessment in the commit body. If any high-severity finding lacks a documented mitigation, halt — do not proceed with "I'll be careful."

### Don't delegate understanding

When spawning a sub-agent, do the synthesis first. "Based on your findings, fix the bug" is not a brief; it pushes synthesis onto the sub-agent. Write briefs that prove you understood: file paths, line numbers, what specifically to change.

### Match scope of action to authorization scope

User authorization stands for the scope specified, not beyond. "Yes" to a PR proposal authorizes the PR, not tangential cleanup. "Merge it" authorizes the merge, not "and also clean up these stale branches I noticed."

### Honor halts

If a critic gate halts the pipeline, the artifact stops there. Don't push the work through with workarounds; revise the spec and re-run. Halts are the cheapest place to catch mistakes.

## Maintenance principles

### Every regression caught becomes a permanent test

Or in this orchestrator's case: a permanent entry in `.claude/protected-paths.txt`, a critic-prompt update in `.claude/skills/ship-spec/SKILL.md`, or a documented constraint in this file. The harness gets more stable over time, not less, by accumulating these.

### Issue first, then branch

Per `.claude/rules/git.md` — every branch traces to an issue. Every PR closes one. This forces a moment of "what is this actually for" before any code is written.

### CHANGELOG entries land in the same commit

Per `.claude/rules/git.md` — entries under `## [Unreleased]` ship with the change that produced them. No "I'll add the changelog later." Later doesn't happen.

### Push is shared state

Local commits are reversible. Pushed commits affect collaborators (even if "collaborators" is just the next session). Confirm before pushing to `development` or `main` unless explicitly authorized in this session.

## Lessons learned (append-only)

- **2026-05-02**: The v0.7 convergence's "defensible 5-skill set" rationale deleted `/ralph`, `/prd`, `/harness-audit`, `/skill-lint`, `/delegate`, `/strategic-proposal`. The orchestrator actively used several of these for its own task management. Lesson: the deletion criterion was reasoning-based, not usage-based. Fix shipped as `.claude/protected-paths.txt` (PR #219).
- **2026-05-02**: Per-invocation usage logging was proposed as the structural fix. Critic B's proportionality argument: one regression doesn't justify per-invocation infrastructure. Pivoted to a static protected-paths list + critic gate. Lesson: structural fixes should match the frequency and shape of the failure, not solve a different problem at higher cost.
- **2026-05-02**: `/ship-spec` v1 ordering created GH issues before the critic gate ran, leaving dangling issues when critics halted. Reordered in v1.1 (PR #219). Lesson: nothing GitHub-side should change until the spec passes the critic gate — local-only artifacts are reversible; remote state isn't.
- **2026-05-07**: For directories that need to exist on a fresh clone but whose contents are otherwise gitignored, prefer a tracked `README.md` over `.gitkeep`. The README serves both purposes (intent doc + folder anchor) without the empty-file smell. Pattern shipped across `.worktrees/`, `apps/`, `crons/`, `tasks/`, `scripts/` and codified in `.claude/rules/directory-readme.md`.
- **2026-05-07**: "Treat X the same as Y" is ambiguous — it can mean folder convention, lifecycle/mechanism, or classification role. Restate the interpretation before re-architecting when multiple readings are plausible. This session: read `project/<name>/` "same as agent" as "harness branch prefix" when the user meant "singular `<name>/` folder shape holding independent clones." One round of rework that a one-line check would have prevented.
- **2026-05-07**: A directory README must enumerate any pre-existing semantic subfolders, not only describe the generic pattern that produced them. Readers shouldn't need to chase the rule that defines `<prefix>/<issue#>-<desc>` to know what `feat/` vs `audit/` vs `agent/` mean.
- **2026-05-07**: `/ci-status` reported "NO RUN" for an infrastructure-only PR (devcontainer + scripts + docs). The old NO-RUN guidance pointed at a non-existent `.github/workflows/ci.yml` and only mentioned branch filters; the real cause was that `ci-harness.yml` is path-filtered to `packages/**`/lockfile only. Lesson: this repo's CI is path-filtered, not branch-filtered — devcontainer/docs/scripts/install PRs trigger nothing on push, and that's expected. `pull_request`-event workflows fire when the PR opens. Skill updated to enumerate workflows and their `on:` paths in the NO-RUN branch (#253).
- **2026-06-04**: "Compound engineering" (Kieran Klaassen / Every) is the external name for the through-line this harness already enforces — append-only memory (`context/rules/memory.md`), critic-gate-before-destructive, protected-paths accumulation (`.claude/protected-paths.txt`), and parallel/recursive delegation (`context/rules/recursive-delegation.md`). Reflected as a wiki entry (`wiki/compound-engineering.md`, the process-ingrained record), a blog post (`blog/2026-06-04-compound-engineering.md`, primary distribution), and light hints in existing docs — deliberately NOT a new `context/rules/` file, because the concept only *names* mechanisms the harness already has; a rule would duplicate them, and instruction/prompt bloat is itself a documented compound-engineering failure mode ("simplicity is beauty").
- **2026-06-10**: For multi-file builds, fan OUT implementation to sub-agents scoped to disjoint files (they commit nothing) and fan IN every shared-file edit plus all commits at the orchestrator — one atomic commit per wave. Graduated from `memory/MEMORY.md` (2026-05-24) after a second clean cross-session recurrence: the context-fitness eval system shipped 8 stories across 3 waves with 4 parallel sub-agents and zero file collisions.

This file is living. Append a one-line lesson when a session produces evidence that changes how the orchestrator should decide.
