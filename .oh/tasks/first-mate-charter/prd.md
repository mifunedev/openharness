# PRD: First Mate Role Charter + Advisor Prompt Pack (rev 2)

## Introduction

The three advisor workflow prompts (`.oh/prompts/advisor/{plan,implement,pr}.yml`) all cite a role charter at `.oh/context/rules/first-mate.md` that does not exist, and the prompt pack itself is untracked. This feature authors the charter — codifying the **First Mate**: the supervisory harness-level orchestration agent (user = captain, First Mate = coordinator, specialist agents = crew) that decomposes work, delegates with effort scaled to complexity, verifies results, and synthesizes, deciding *how* but never redefining *what* — and lands the prompt pack in git **byte-identical** with every reference resolving.

Sources of truth: `.oh/tasks/first-mate-charter/context.md` (operator verbatim WHAT), `plan.md` rev 2 (architect+pm decisions revised after two adversarial critics). Issue: [#660](https://github.com/mifunedev/openharness/issues/660). Branch: `feat/660-first-mate-charter`.

## Goals

- `.oh/context/rules/first-mate.md` exists as an **on-demand** charter with a `## Effort Scaling` section grounding the pack's `role` text ("scaling their reasoning effort to match each task's complexity") — an explicitly surfaced exception (plan.md DP-0) to the pointer-only convention for that directory.
- Every cross-reference in the prompt pack resolves in-repo, including the currently-dangling `architect` agent.
- The pack is git-tracked **without any content modification** — the operator's YAMLs are the contract.
- The charter is discoverable (two diff-capped one-line pointers) and regression-guarded (drift-guarding eval probe).

## User Stories

### US-001: Author the First Mate charter

**Description:** As the captain, I want a canonical role charter at `.oh/context/rules/first-mate.md` so that every advisor prompt's charter reference resolves to a faithful, non-duplicating role definition.

**Acceptance Criteria:**

- [ ] File exists at `.oh/context/rules/first-mate.md`, opening with a status declaration: on-demand doc, referenced by `.oh/prompts/advisor/*`, not part of the always-loaded tier, and a deliberate operator-mandated exception to the compatibility-pointer-only convention for `.oh/context/rules/` (per plan.md DP-0)
- [ ] Sections in order: `## Definition`, `## Crew Model`, `## Responsibilities`, `## The HOW / WHAT Boundary`, `## Delegation Protocol`, `## Verification & Rework`, `## Effort Scaling`, `## What This Charter Does NOT Own`
- [ ] Operator text verbatim (diffable against `context.md`): both definitions incl. arXiv citation, the 8 responsibility bullets, the HOW/WHAT boundary sentence — specifically `context.md`'s prose ("One useful boundary: …"), NOT the YAMLs' `role:` paraphrase (both may appear, labeled separately); annotations sit beside, never inside, verbatim text
- [ ] Each of the 8 responsibility bullets annotated with its implementing repo surface (e.g. decomposes → pm agent + `/ralph`; delegates → Agent tool + `/delegate`; validates → acceptanceCriteria + `/audit implementation`)
- [ ] Crew Model contains a one-sentence disambiguation: the prompt pack's `advisor:` role = the First Mate orchestrator (spawns crew); the `advisor` *agent* (`.oh/agents/advisor.md`) = a read-only briefing synthesizer that cannot spawn
- [ ] Delegation Protocol states as role policy the three policies originating in `implement.yml`'s warnings (delegate not DONE until progress entry + user story updated; serial briefings informed by current progress state; all task artifacts in `.oh/tasks/<task-name>/*`), citing `implement.yml` as origin, and defers mechanics by literal reference to `.oh/agents/advisor.md` (briefing format) and `.oh/skills/delegate/SKILL.md` (waves/workers)
- [ ] `grep -n "^## Effort Scaling"` matches; the table maps the four `/delegate` complexity classes (simple/mechanical, standard, complex, architecture/debugging — labels verbatim from `/delegate`) → `thinking` tiers `low|medium|high|xhigh`; normative notes: never `max` for delegates, model inherits by default, overrides require a recorded reason (a prompt step naming a model counts as an operator request), and a consistency clause naming `/delegate` as the enforcement layer that this table must track
- [ ] No content restated from `/git`, `/delegate`, `advisor.md`, `/spec`, or `AGENTS.md § The Workflow` — references only, with one carve-out: the Effort Scaling table's shared vocabulary (drift-guarded by US-006)

### US-002: Formalize the architect crew agent

**Description:** As the First Mate, I want `.oh/agents/architect.md` to exist so that `plan.yml`'s `agents:` list has no dangling reference. (Provenance: First-Mate decision, not operator-requested — see plan.md DP-1; alternative of trimming the operator's `agents:` list rejected because it edits operator workflow content to hide a missing capability.)

**Acceptance Criteria:**

- [ ] `.oh/agents/architect.md` exists with sibling frontmatter schema: name, description with TRIGGER clause, `tools: Read, Glob, Grep, Bash`, `model: sonnet` (matching pm/critic — read-only synthesis, not the opus-tier advisor)
- [ ] Role text: owns solution shape (placement, structure, integration, non-duplication, risks/constraints); explicitly states "no task lists — pm owns breakdown"
- [ ] Every name in every `agents:` list across the 3 YAMLs resolves to an `.oh/agents/<name>.md` file
- [ ] The `.claude/agents/` surface is wired the same way as critic/implementer/pm (replicate their symlink/file mechanism), and `.claude/agents/architect.md` is added to `.claude/protected-paths.txt` alongside its siblings in this same PR

### US-003: Land the prompt pack byte-identical, with directory README

**Description:** As the First Mate, I want the `.oh/prompts/advisor/` pack tracked in git exactly as the operator wrote it, with a conventional README, so that the workflow prompts are versioned and self-describing.

**Acceptance Criteria:**

- [ ] The 3 YAMLs are committed byte-identical to the operator's working-tree versions at commit time (re-hash against context.md's spec-freeze hashes first; if the operator edited again, re-read and proceed with the new content): NO warning additions/removals/rewording, NO query-step changes, `role` blocks left as-is. Ground truth at spec-freeze: `implement.yml` and `pr.yml` share byte-identical 3-item `warning:` blocks; `plan.yml` has none
- [ ] `.oh/prompts/README.md` exists per `.oh/context/directory-readme.md` convention: one-line intent, table row for `advisor/` (plan / implement / pr, in increasing scope), the YAML schema (`role, agents, warning?, query` — `warning` present in `implement.yml` and `pr.yml`, absent in `plan.yml`, by operator design), pointer to the charter, and a conditional yml↔provider-rendering note ("a provider may keep a rendered mirror, e.g. `.pi/prompts/advisor/pr.md`; edit the yml, then re-render") without asserting any such mirror currently exists
- [ ] `.oh/README.md` directory enumeration gains a one-line `prompts/` entry
- [ ] `git status` shows none of these files untracked; every path-like token inside the YAMLs resolves in-repo

### US-004: Wire discoverability pointers (diff-capped)

**Description:** As a future session, I want two one-line pointers so that the on-demand charter isn't orphaned or cut by a later context audit. (Provenance: First-Mate decision — see plan.md DP-3.)

**Acceptance Criteria:**

- [ ] `AGENTS.md` (the canonical file — `CLAUDE.md` is a symlink to it) rules-collapse sentence in § Session start gains one clause naming the charter as a plain on-demand doc at `.oh/context/rules/first-mate.md`; `git diff development -- AGENTS.md` shows exactly one changed line; Session-start read list unchanged
- [ ] `.oh/agents/advisor.md` gains exactly one added "See also" line (charter = the role the caller plays; advisor agent = the briefing artifact); `git diff development -- .oh/agents/advisor.md` shows exactly one added line
- [ ] Always-loaded tier grows by nothing else

### US-005: CHANGELOG entry

**Description:** As the release process, I want an `[Unreleased] → ### Added` bullet so that this workflow-effecting change follows `/git` changelog discipline.

**Acceptance Criteria:**

- [ ] One imperative-mood bullet under `## [Unreleased]` → `### Added` referencing the charter + prompt pack, format `- <description> ([#660](https://github.com/mifunedev/openharness/issues/660))` — #660 is confirmed, not a placeholder

### US-006: Eval probe guarding charter + pack (drift-guarded)

**Description:** As the regression floor, I want `.oh/evals/probes/first-mate-charter.sh` so that deleting the charter, untracking the pack, or effort-vocabulary drift turns a probe red.

**Acceptance Criteria:**

- [ ] Probe asserts: charter file exists; `^## Effort Scaling` heading present; the 3 YAMLs are git-tracked; every `agents:` name resolves to `.oh/agents/*.md`
- [ ] Drift-guard: each of the four complexity-class labels appears in BOTH the charter and `.oh/skills/delegate/SKILL.md`; a mismatch reports REGRESSION naming the charter's consistency clause
- [ ] Follows existing probe conventions (`# desc:` header, PASS/REGRESSION/SKIPPED three-state semantics, style of `.oh/evals/probes/git-skill.sh`); `git-skill.sh` untouched
- [ ] Probe PASSes against the finished state of US-001–US-003 when run via bash

## Functional Requirements

- FR-1: The charter must live at exactly `.oh/context/rules/first-mate.md` (the operator-cited path) and must not be added to any always-loaded context list. Its status line must surface the DP-0 pointer-only-convention exception.
- FR-2: The charter's `## Effort Scaling` heading is grep-checkable (`^## Effort Scaling`); it is mandated by context.md's Deliverable (the former `pr.yml` § citation was removed by the operator's 16:22 edit).
- FR-3: Reference closure: every path and agent name cited in `.oh/prompts/advisor/*.yml` resolves to a real in-repo file after this change.
- FR-4: The charter references, never restates, content owned by `/git`, `/delegate`, `.oh/agents/advisor.md`, `/spec`/`/ship-spec`, and `AGENTS.md § The Workflow` — with exactly one carve-out: the Effort Scaling table's shared four-class vocabulary, bound by a consistency clause and the US-006 drift-guard.
- FR-5: The three YAMLs land byte-identical to the operator's files; the only git operation on them is `add`.
- FR-6: No `.pi/prompts/` files are created or modified; the README's provider-rendering note is conditional.
- FR-7: All work lands on `feat/660-first-mate-charter`; nothing stacks on `feat/sandbox-ssh-config-persistence`.
- FR-8: Writer delegates use a write-capable agent type (`general-purpose`).
- FR-9: The PR description contains a "First-Mate decisions" provenance section listing DP-0 (rules-dir exception), DP-1 (architect agent; alternative + rejection reason), DP-3 (pointer edits), and US-006 (probe) as First-Mate-decided items.

## Non-Goals

- No changes to `/delegate`, `/spec`, `/ship-spec`, `/builder`, `autopilot`, or `advisor.md` content beyond the single See-also line
- No content edits to the three operator YAMLs (no warnings added anywhere, no rewording)
- No creation of `.pi/prompts/advisor/` files
- No addition of the charter to the AGENTS.md Session-start read list
- No restyling of `.oh/context/rules/git.md` (probe-guarded pointer)
- No new skill or slash command for the First Mate role
- No sandbox application code

## Technical Considerations

- `.oh/tasks/*` is gitignored — task artifacts stay local.
- "Typecheck passes" criteria are Ralph boilerplate: CI runs typecheck/lint on `.oh/**` triggers but no story touches `.oh/cli` TS — satisfied vacuously; do not invent a typecheck step for markdown/YAML/shell. The probe's real gate is the `eval-probes` CI job.
- `.oh/evals/probes/git-skill.sh` asserts only on `git.md`; adding `first-mate.md` is probe-safe.
- `CLAUDE.md → AGENTS.md` symlink: edit `AGENTS.md` only.
- Dependency order: US-001 ∥ US-002 first; then US-003 ∥ US-004; then US-005 ∥ US-006.

## Success Metrics

- `grep` closure: zero dangling references across charter + pack + agents (verifiable by the US-006 probe).
- `/eval` suite green with the new probe PASSing; drift-guard red only when charter and `/delegate` vocabularies diverge.
- A future session handed any `.oh/prompts/advisor/*.yml` can resolve its charter reference and execute the role without asking what "First Mate" means.

## Open Questions

- None blocking — both critics' findings (2 HIGH, 6 MED, 3 LOW) are dispositioned in plan.md § Critic disposition.
