# Critique — repo-layout-skill

Generated 2026-06-19; reviews `prd.md` post-/prd, pre-/ralph.

## Critic A — Implementer lens

Initial review:

```text
CRITIC_A — IMPLEMENTER LENS
[SEVERITY: H] [STORY: US-001] [FINDING] [PROTECTED-PATH] PRD proposes modifying `.devcontainer/Dockerfile`, a protected path, without an explicit override note. | [EVIDENCE: `.claude/protected-paths.txt` lists `.devcontainer/Dockerfile`; US-001 AC: “`.devcontainer/Dockerfile` includes `tree`…”] | Add an AC-level override note explaining why this protected-path edit is necessary and bounded to adding the Debian `tree` package only.
[SEVERITY: M] [STORY: US-001] [FINDING] “Boot-path lint remains green” is not directly verifiable because no command or expected artifact is named. | [EVIDENCE: US-001 AC: “Boot-path lint remains green.”] | Replace with the exact lint/test command and expected pass condition.
[SEVERITY: M] [STORY: US-001] [FINDING] Package verification is underspecified and may require network/package-index state that is not guaranteed locally. | [EVIDENCE: US-001 AC: “A verification command proves `tree` is present or resolvable from Debian bookworm packages.”] | Name the deterministic command, e.g. current binary smoke check plus static Dockerfile grep, or an explicit `apt-cache policy tree` check only if package indexes are available.
[SEVERITY: M] [STORY: US-002] [FINDING] “Bounded tree” is vague; implementation could choose incompatible defaults. | [EVIDENCE: US-002 AC: “Running the script with no args produces a bounded tree for the current directory.”] | Specify the default bound, e.g. `tree -L 2 .` or equivalent, and whether hidden/gitignored directories are excluded.
[SEVERITY: M] [STORY: US-002] [FINDING] Skill-builder dependency is assumed but not locatable under `.claude/skills`; checklist source is ambiguous. | [EVIDENCE: US-002 AC references “The skill-builder checklist”; `.claude/skills/skill-builder/SKILL.md` absent.] | Cite the canonical checklist path or include the required checklist items directly in the PRD.
[SEVERITY: M] [STORY: US-003] [FINDING] Story combines three separable deliverables: changelog, wiki/raw entry, and generated wiki index/probe. | [EVIDENCE: US-003 AC list spans `CHANGELOG.md`, `wiki/repo-layout-skill.md`, `wiki/README.md`, and `evals/probes/wiki-readme-index.sh`.] | Split into documentation update and wiki indexing/verification stories, or explicitly state they are one atomic docs pass.
[SEVERITY: M] [STORY: *] [FINDING] Wiki alignment is present but DeepWiki comparison is shallow; it references only the root page and no specific DeepWiki page/source evidence. | [EVIDENCE: `## Wiki Alignment` says “public DeepWiki root page… no dedicated `tree` page exists.”] | Name the exact relevant DeepWiki URL(s) checked and the source-file relationship being mirrored, or state that no deeper page exists after checking.
```

Recheck after PRD revision:

```text
CRITIC_A — IMPLEMENTER LENS RECHECK
[SEVERITY: L] [STORY: *] No blocking findings remain. | [EVIDENCE: revised PRD] | Proceed.
```

## Critic B — User lens

Initial review:

```text
CRITIC_B — USER LENS
[SEVERITY: H] [STORY: US-001] [PROTECTED-PATH] Story requires modifying `.devcontainer/Dockerfile`, which is listed as protected, but the PRD has no override note explaining why this protected path must be changed. | [EVIDENCE: .claude/protected-paths.txt; PRD US-001] | Add an explicit protected-path override note to the PRD before implementation, scoped to adding the Debian `tree` package only.
[SEVERITY: M] [STORY: US-002] `/tree` promises “safely renders” and forwards user-supplied args, but does not define safety bounds for explicit args; a user could reasonably expect output limits, ignored heavy dirs, or protection against massive repo dumps. | [EVIDENCE: PRD US-002 acceptance criteria] | Add default and explicit-arg guardrails: bounded default depth, documented pass-through behavior, and examples/warnings for large output.
[SEVERITY: M] [STORY: US-001] “Next sandbox image build support” is the core user ask, but verification only proves local install/resolvability, not that the Dockerfile change actually works in a container build path. | [EVIDENCE: PRD Goals; Verification Plan] | Add a non-rebuild escape clause plus a stronger verification option, e.g. `docker build --target` or documented “not run due to cost” evidence if skipped.
[SEVERITY: M] [STORY: US-003] Wiki alignment is strong conceptually, but the raw snapshot date is hard-coded to `2026-06-19`, which can drift from the actual implementation date and weaken source-first auditability. | [EVIDENCE: PRD Wiki Alignment] | Require the raw snapshot path to use the actual UTC implementation date or explain why `2026-06-19` is fixed.
[SEVERITY: L] [STORY: *] Non-Goals do not explicitly exclude replacing existing mandatory file discovery workflows or changing agent tool-use policy, even though adding `/tree` could be misread as a preferred replacement for `find`/`read`. | [EVIDENCE: PRD Non-Goals; context/USER.md] | Add a Non-Goal: `/tree` is optional layout visualization only; it must not supersede required file-search/read conventions.
```

Recheck after PRD revision:

```text
CRITIC_B — USER LENS RECHECK
[SEVERITY: L] [STORY: *] No blocking findings remain. | [EVIDENCE: revised PRD] | Proceed.
```

## Synthesis

- **High-severity findings**: 0 unmitigated after recheck (2 initial protected-path findings were mitigated with a bounded `.devcontainer/Dockerfile` override in US-001).
- **Medium-severity findings**: 0 unmitigated after recheck (specific commands/defaults/checklist path/story split/DeepWiki URL were added to the PRD).
- **Recommendation**: PROCEED
