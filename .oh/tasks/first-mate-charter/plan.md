# Implementation Plan — First Mate role charter + advisor prompt pack (rev 2)

Synthesized by the First Mate from the architect memo (solution shape) and the pm breakdown (task decomposition), then revised after two adversarial critics (implementer lens + captain lens) both returned REVISE. Source of truth for WHAT: `context.md` in this folder. Rev 2 changes are marked ⟲.

## Resolved decision points

- **DP-0 ⟲ (rules-dir policy exception, critic-1 HIGH)** — `.oh/skills/builder/references/rule.md` declares `.oh/context/rules/` compatibility-pointer-only, "not a destination for new policy". The charter path `.oh/context/rules/first-mate.md` is the **operator's fixed WHAT** (hard-cited by all three YAMLs) and is therefore a deliberate, operator-mandated exception: the charter is a manually-referenced role doc, not a `paths:`-triggered coding rule. This exception MUST be surfaced in three places: (1) the charter's own status line, (2) plan.md (here), (3) the PR description's provenance section. Never silently resolved.
- **DP-1** `plan.yml` cites a nonexistent `architect` agent → **create `.oh/agents/architect.md`** (sibling schema; `model: sonnet` ⟲ matching pm/critic; tools Read/Glob/Grep/Bash; owns solution shape). ⟲ Provenance: this is a **First-Mate decision, not operator-requested**; the lighter alternative (trim the `agents:` list in the operator's own plan.yml) was rejected because it would edit operator-authored workflow content to paper over a missing capability, and the architect role is already exercised in practice (this very task used one). Say so in the PR body. ⟲ Add the new agent to `.claude/protected-paths.txt` alongside its siblings in the same PR.
- **DP-2 ⟲⟲** Effort Scaling taxonomy → per-delegate `thinking` (`low|medium|high|xhigh`, never `max`) scales with the four `/delegate` complexity classes; **model inherits by default**, overrides need a recorded reason. ⟲⟲ The operator's 16:22 edit removed the old "opus delegate fan out … per first-mate.md § Effort Scaling" step from `pr.yml` — no `opus` or `Effort Scaling` string remains in the pack. The `## Effort Scaling` section stays: it is mandated by context.md's Deliverable and grounds the `role` text every YAML carries ("scaling their reasoning effort to match each task's complexity"). ⟲ The table intentionally shares `/delegate`'s four class labels (FR-4 carve-out); the US-006 probe drift-guards the shared vocabulary so the two surfaces can't silently diverge.
- **DP-3** Load semantics → charter is an **on-demand** doc at the referenced path. Always-loaded delta: one clause appended to the rules-collapse sentence in `AGENTS.md` (§ Session start; `CLAUDE.md` is a symlink ⟲). Plus a one-line "See also" pointer in `.oh/agents/advisor.md`. ⟲ Both pointer edits are First-Mate-decided (PR-body provenance) and diff-capped: the `AGENTS.md` diff must touch exactly one line (audit-gate check via `git diff development -- AGENTS.md`).
- **Warnings ⟲⟲ (critic-2 HIGH + verifier NEW-1; ground truth re-established after operator's 16:22 edit)** — The operator's YAMLs are the contract, and the contract moved mid-session: `implement.yml` AND `pr.yml` now share **byte-identical 3-item `warning:` blocks**; `plan.yml` has **none**. Nothing is added, removed, or reworded anywhere — all three files land exactly as the operator's working tree has them at commit time (re-hash against context.md's spec-freeze hashes; if changed again, re-read before committing). The charter's Delegation Protocol states the three policies as role policy, citing `implement.yml`/`pr.yml` as their origin.
- **Eval probe** → included as US-6; `/ship-spec`-style `/eval` gate exercises it. ⟲ Probe gains the drift-guard assertion (DP-2).
- **`.pi/prompts/advisor/pr.md` ⟲ (critic-1 MED)** → the file does **not exist on this branch** (only on the old ssh-persistence branch). Nothing to leave unmodified. `.oh/prompts/README.md` describes the yml↔Pi-md rendering convention **conditionally** ("a provider may keep a rendered mirror, e.g. `.pi/prompts/advisor/pr.md`; edit the yml, then re-render") without asserting the file exists.

## Constraints (binding on all delegates)

1. Operator text is verbatim-protected: the 8 responsibility bullets, both definitions, and the HOW/WHAT boundary sentence come from `context.md` unaltered; annotations sit beside, not inside. ⟲ The boundary sentence is `context.md`'s prose ("One useful boundary: …"), NOT the YAMLs' punchier `role:` paraphrase; both may appear but labeled separately.
2. Charter references, never restates: git conventions → `/git`; briefing format/recursion bounds → `.oh/agents/advisor.md`; wave/worker mechanics → `/delegate`; pipeline → `AGENTS.md § The Workflow`. ⟲ Sole carve-out: the Effort Scaling table deliberately shares `/delegate`'s four complexity labels + tier mapping as common vocabulary, with an explicit consistency clause and probe drift-guard.
3. Disambiguate the "advisor" name collision in one sentence (prompt pack's `advisor:` role = the First Mate orchestrator that spawns crew; the `advisor` agent = a read-only briefing synthesizer that cannot spawn).
4. Do not grow the always-loaded tier beyond the one `AGENTS.md` clause. Do not restyle `.oh/context/rules/git.md` (probe-guarded).
5. ⟲ YAML content edits: **none**. The three files land byte-identical to the operator's working-tree versions (`role` blocks are already byte-identical; field order already consistent; query steps untouched; no warnings added or reworded). The only "change" is `git add`.
6. Writer delegates must be write-capable (`general-purpose`); `pm`/`critic` are read-only.
7. All task artifacts stay in `.oh/tasks/first-mate-charter/*` (gitignored — local).
8. ⟲ "Typecheck passes" in prd.json is Ralph boilerplate: CI (`ci-harness.yml`) runs typecheck/lint on `.oh/**` paths but nothing here touches `.oh/cli` TS — the criterion is satisfied vacuously; do NOT invent a typecheck step for markdown/YAML/shell. The probe's real gate is the `eval-probes` CI job executing it.
9. ⟲ The PR description MUST contain a "First-Mate decisions" provenance section listing: DP-0 rules-dir exception, DP-1 architect agent (alternative considered + rejection reason), DP-3 pointer edits, US-6 probe — so the captain sees each as a choice, not operator mandate.

## User stories

### US-0 — Branch hygiene (DONE)
Branch `feat/660-first-mate-charter` cut from `upstream/development` tip (0eaa1526); issue #660 filed on mifunedev/openharness; untracked pack + task folder intact.

### US-1 — Author the charter
**As the** captain, **I need** `.oh/context/rules/first-mate.md` codifying the First Mate role **so that** every advisor prompt's charter reference resolves to a canonical, faithful role definition.
- Sections in order: status line ⟲ (on-demand; not always-loaded; explicitly notes it is a deliberate exception to the pointer-only rules-dir convention per DP-0) → `## Definition` (verbatim, arXiv citation) → `## Crew Model` (captain/First Mate/crew mapped to real surfaces; advisor-agent disambiguation) → `## Responsibilities` (8 verbatim bullets, each annotated with implementing surface) → `## The HOW / WHAT Boundary` (⟲ context.md prose, per Constraint 1) → `## Delegation Protocol` (composition by reference + the three implement.yml-origin policies stated as role policy) → `## Verification & Rework` → `## Effort Scaling` (DP-2 table + normative notes incl. never-`max`, inherit-by-default, recorded overrides, consistency clause naming `/delegate` as the enforcement layer) → `## What This Charter Does NOT Own` (pointer list).
- acceptanceCriteria: file exists; `grep -n "^## Effort Scaling"` matches; 4 `/delegate` class labels present verbatim; literal refs to `.oh/agents/advisor.md` + `.oh/skills/delegate/SKILL.md`; operator text diffable against `context.md`; disambiguation sentence present; status line carries the DP-0 exception note.
- dependencies: US-0 · complexity: medium · delegate: general-purpose · thinking: high

### US-2 — Formalize the architect crew agent (DP-1)
**As the** First Mate, **I need** `.oh/agents/architect.md` **so that** `plan.yml`'s `agents: ["architect", "pm"]` has no dangling reference.
- acceptanceCriteria:
  - File exists with sibling frontmatter (name, description with TRIGGER clause, `tools: Read, Glob, Grep, Bash`, ⟲ `model: sonnet`); role = solution-shape owner; states "no task lists — pm owns breakdown".
  - Every name in every `agents:` list across the 3 YAMLs resolves to `.oh/agents/<name>.md`.
  - ⟲ `.claude/agents/architect.md` (symlink surface) added to `.claude/protected-paths.txt` alongside critic/implementer/pm, matching how siblings are wired (check how `.claude/agents/*.md` symlinks are created and replicate).
- dependencies: US-0 · complexity: small · delegate: general-purpose · thinking: medium

### US-3 — Land the prompt pack byte-identical + directory README
**As the** First Mate, **I need** the `.oh/prompts/advisor/` pack tracked in git with a conventional README **so that** the workflow prompts are versioned and self-describing.
- acceptanceCriteria:
  - ⟲ The 3 YAMLs are committed **byte-identical** to the operator's working-tree versions (`git diff --cached` vs pre-add file hashes; no warning additions, no rewording).
  - `.oh/prompts/README.md` exists per `directory-readme.md` convention: intent line, `advisor/` table row (plan/implement/pr in increasing scope), the YAML schema (`role, agents, warning?, query` — warning present in implement.yml and pr.yml, absent in plan.yml, by operator design ⟲⟲), pointer to the charter, ⟲ conditional yml↔Pi-md rendering note (no assertion that `.pi/prompts/advisor/pr.md` exists).
  - `.oh/README.md` directory enumeration gains a one-line `prompts/` entry.
  - `git status` shows none of these untracked; every path-like token inside the YAMLs resolves in-repo.
- dependencies: US-1, US-2 · complexity: small · delegate: general-purpose · thinking: medium

### US-4 — Wire the two pointers (diff-capped ⟲)
**As a** future session, **I need** discoverability pointers **so that** the charter isn't orphaned by a later context audit.
- acceptanceCriteria:
  - `AGENTS.md` (⟲ not CLAUDE.md — symlink) rules-collapse sentence gains one clause naming the charter as a plain on-demand doc; ⟲ `git diff development -- AGENTS.md` shows exactly one changed line; Session-start read list unchanged.
  - `.oh/agents/advisor.md` gains exactly one "See also" line; ⟲ its diff is exactly one added line.
- dependencies: US-1 · complexity: trivial · delegate: general-purpose · thinking: low

### US-5 — CHANGELOG entry
- acceptanceCriteria: one imperative-mood bullet under `## [Unreleased]` → `### Added` referencing charter + pack, format `- <description> ([#660](https://github.com/mifunedev/openharness/issues/660))` (⟲ #660 is confirmed, not a placeholder).
- dependencies: US-1, US-3 · complexity: trivial · delegate: general-purpose · thinking: low

### US-6 — Eval probe (drift-guarded ⟲)
**As the** regression floor, **I need** `.oh/evals/probes/first-mate-charter.sh` **so that** deleting the charter, untracking the pack, or vocabulary drift turns a probe red.
- acceptanceCriteria:
  - Asserts: charter exists; `^## Effort Scaling` present; 3 YAMLs git-tracked; `agents:` names resolve to `.oh/agents/*.md`.
  - ⟲ Drift-guard: the four complexity-class labels appear in BOTH the charter and `.oh/skills/delegate/SKILL.md` (grep both files for each label; mismatch → REGRESSION naming the consistency clause).
  - Conventions: `# desc:` header, PASS/REGRESSION/SKIPPED semantics, style of `git-skill.sh`; PASSes against finished US-1–US-3 state; `git-skill.sh` untouched.
- dependencies: US-1, US-2, US-3 · complexity: small · delegate: general-purpose · thinking: medium

## Dependency graph

```
US-0(done) ──► US-1 ──► US-4
       │         ├───► US-3 ──► US-5
       └────► US-2 ─┘     └───► US-6 (also needs US-1, US-2)
```
Parallelizable: US-1 ∥ US-2; then US-3 ∥ US-4; then US-5 ∥ US-6.

## Out of scope
Modifying `/delegate`, `/spec`, `/builder`, `autopilot`, or `advisor.md` beyond the See-also line; any edit to the three YAMLs' content; creating `.pi/prompts/advisor/` files; adding the charter to the Session-start read list; restyling `git.md`; sandbox application code.

## Critic disposition (rev 2)
- C2-H1 warnings invention → fixed (Warnings DP; Constraint 5; US-3 rewritten to byte-identical landing).
- C1-H1 rules-dir policy collision → fixed (DP-0; status-line + PR-body surfacing).
- C1-M2/C1-L6 phantom .pi mirror → fixed (DP on .pi; context.md corrected; conditional README wording; parity rationale dropped).
- C1-M3 missing model: field → fixed (US-2 AC `model: sonnet`).
- C1-M4/C2-M2 protected-paths → fixed (US-2 AC).
- C2-M1 effort-table duplication → fixed (Constraint 2 carve-out + US-6 drift-guard).
- C2-M3 DP-1 provenance → fixed (DP-1 + Constraint 9 PR-body section).
- C2-M4 bootloader diff cap → fixed (US-4 one-line diff ACs; audit-gate check).
- C2-L1 boundary-sentence substitution → fixed (Constraint 1).
- C2-L2 #660 alignment → fixed (US-5).
- C1-L5 typecheck boilerplate → fixed (Constraint 8 delegate note).
