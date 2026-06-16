# Critique — rebrand-orchestrate

Generated 2026-06-16; reviews `prd.md` post-/prd, pre-/ralph.

## Critic A — Implementer lens

CRITIC_A — IMPLEMENTER LENS
[SEVERITY: H] [STORY: US-002] [PROTECTED-PATH] Story requires editing protected skill `strategic-proposal` without an override note | [EVIDENCE: `.claude/protected-paths.txt` entry `strategic-proposal`; AC text: “Update `.claude/skills/strategic-proposal/SKILL.md` references…”] | Add an explicit override note explaining this is a non-destructive command-reference edit, or remove that path from scope.

[SEVERITY: M] [STORY: US-005] [FINDING] Residual grep acceptance is not directly verifiable because the allowed exception set is open-ended | [EVIDENCE: AC text: “clean outside deliberately immutable or external fixture surfaces, such as…”; current hits include `.claude/plans/rebranding-legacy runner command-to-orchestrate-jazzy-canyon.md` plus dataset oracle fixtures] | Enumerate exact allowed residual paths/patterns, e.g. released `CHANGELOG.md` sections, `evals/datasets/**/oracle/**`, `.claude/plans/**`, and gitignored `memory/[0-9]*/**`.

[SEVERITY: M] [STORY: US-004] [FINDING] Eval metadata AC conflicts with established eval workflow: `/eval` rewrites `evals/RESULTS.md`, but AC asks for a narrowly focused committed diff | [EVIDENCE: AC text: “Do not hand-edit unrelated eval row timestamps or statuses; if `/eval` rewrites the table, keep the committed diff focused…”; `evals/RESULTS.md` says rows are written by `/eval`] | Choose one verifiable path: either run `/eval` and accept coherent regenerated output, or explicitly permit restoring unrelated rows from base after targeted probe runs.

[SEVERITY: M] [STORY: US-005] [FINDING] Live `/orchestrate` check silently assumes the active agent runtime reloads renamed skills after filesystem changes | [EVIDENCE: Technical Considerations: “live functional check is `/orchestrate --dry-run --start ideate` after the skill is renamed and available to the active agent runtime”; current loaded skill list still exposes `legacy runner command`] | Define the validator environment: fresh agent session, skill registry reload, or direct file/probe validation if runtime command discovery cannot be refreshed in-turn.

[SEVERITY: M] [STORY: US-001] [FINDING] “Update command-name references” is broader than the named AC and can miss frontmatter trigger/description strings | [EVIDENCE: `the old skill directorySKILL.md` frontmatter description contains `TRIGGER when: the legacy runner command invoked…`; AC only calls out `name:`, H1, and body references] | Add frontmatter `description` / trigger text / `argument-hint` review as explicit acceptance criteria.

[SEVERITY: L] [STORY: US-005] [FINDING] Story bundles documentation, stale-entry migration, repo-wide grep triage, targeted probes, whole eval suite, and live command verification into one story | [EVIDENCE: US-005 AC list] | Split into documentation cleanup and verification/sweep stories, or mark US-005 as an integration story with sub-steps.

[SEVERITY: L] [STORY: US-001] [FINDING] Hidden destructive operation is implied by “Move” and “remove active path,” but rollback/override criteria are not stated | [EVIDENCE: FR-2: “remove the active `the old skill directory` skill path”; AC: “Move … using `git mv` semantics”] | State explicitly that this is a rename-only `git mv`, not deletion/deprecation, and rollback is `git mv .claude/skills/orchestrate the old skill directory`.

## Critic B — User lens

CRITIC_B — USER LENS
[SEVERITY: H] [STORY: US-002] [FINDING] [PROTECTED-PATH] US-002 proposes editing `.claude/skills/strategic-proposal/SKILL.md`, but `strategic-proposal` is listed in `.claude/protected-paths.txt` and the PRD has no override note. | [EVIDENCE: .claude/protected-paths.txt; PRD US-002] | [RECOMMENDATION] Either remove the protected-path edit from scope or add an explicit override note explaining why touching the protected `strategic-proposal` skill is required and how the change will be constrained.

[SEVERITY: M] [STORY: US-001] [FINDING] The PRD removes the old active skill path but does not define an escape hatch if `/orchestrate` is not immediately available in the active agent runtime. | [EVIDENCE: PRD US-001; Functional Requirements FR-1/FR-2; Technical Considerations live check] | [RECOMMENDATION] Add rollback criteria: restore `the old skill directory` or provide a temporary alias if `/orchestrate --dry-run --start ideate` is unavailable after the rename.

[SEVERITY: M] [STORY: US-005] [FINDING] The the residual literal cleanup criterion is ambiguous because it allows “deliberately immutable or external fixture surfaces” without enumerating them, so implementers may over-edit historical records or under-edit live docs. | [EVIDENCE: PRD US-005; Non-Goals] | [RECOMMENDATION] Define the allowed residual surfaces explicitly, and add a non-goal forbidding broad historical churn outside the named files.

[SEVERITY: L] [STORY: US-004] [FINDING] Updating benchmark and eval result metadata may be more surface area than the single-developer rebrand needs, especially for generated or historical result files. | [EVIDENCE: context/USER.md “Don’t pre-build for hypothetical needs”; PRD US-004] | [RECOMMENDATION] Narrow US-004 to only metadata consumed by current checks, and make generated historical result rewrites non-goal unless required by a failing probe.

## Synthesis

- **High-severity findings**: 2
- **Medium-severity findings**: 6
- **Low-severity findings**: 3
- **Recommendation**: PROCEED

The high-severity findings were both the same protected-path issue: US-002 edits `.claude/skills/strategic-proposal/SKILL.md`, and `strategic-proposal` is protected. The PRD now includes an AC-level protected-path override limiting that edit to non-destructive `the legacy runner command` → `/orchestrate` command-reference replacements only. The medium findings were mitigated by adding rollback criteria, frontmatter coverage, an exact allowed residual set for legacy runner command grep results, and an explicit validation fallback when the current agent runtime cannot reload renamed skills in-session.
