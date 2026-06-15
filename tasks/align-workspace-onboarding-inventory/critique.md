# Critique — align-workspace-onboarding-inventory

Generated 2026-06-15; reviews `prd.md` post-/prd, pre-implementation.

## Critic A — Implementer lens

CRITIC_A — IMPLEMENTER LENS
[SEVERITY: M] [STORY: US-004] [Targeted grep AC is under-scoped and can cause scope creep] | Repo-wide stale-token grep hits legitimate/history references in `CHANGELOG.md`, `docs/installation.md`, and `docs/agents/*`; PRD says only “returns no stale workspace-template claims” without exclusions. | Define exact validation scope: `workspace/AGENTS.md` + `.claude/skills/harness-audit/SKILL.md`; allow historical changelog and agent-branch documentation refs.

[SEVERITY: L] [STORY: US-004] [Validation does not mechanically verify the actual workspace inventory] | PRD requires docs list `AGENTS.md` and `CLAUDE.md -> AGENTS.md`, but implementation plan only says targeted `rg`, format check, and available tests. | Add explicit checks: `find workspace -maxdepth 1` plus `test -L workspace/CLAUDE.md && test "$(readlink workspace/CLAUDE.md)" = AGENTS.md`.

[SEVERITY: L] [STORY: US-003] [Protected skill edit lacks a narrow no-destructive-change guard] | `.claude/protected-paths.txt` protects `harness-audit`; PRD correctly edits `.claude/skills/harness-audit/SKILL.md` but only says not to remove/rename protected paths. | Add AC: only adjust wording around optional `workspace/.claude/skills/`; do not delete/deprecate `/harness-audit` or alter its auditor topology.

## Critic B — User lens

CRITIC_B — USER LENS
[SEVERITY: M] [STORY: US-004] [Targeted grep scope is ambiguous and may invite over-editing intentional pack docs] | [EVIDENCE] `prd.md:53` says stale-path grep must return no stale workspace-template claims, but repo intentionally contains `docs/agents/*` references to `workspace/.claude/skills/` such as `docs/agents/linkedin-ghostwriter.md:35`; `context/USER.md:52` says do not add beyond what was asked. | [RECOMMENDATION] Define exact validation scope/allowlist: stale template claims must be absent from `workspace/AGENTS.md` and default-audit template wording, while agent/pack docs under `docs/agents/` may keep runtime `workspace/.claude/*` references.
[SEVERITY: M] [STORY: US-003] [Protected skill edit lacks a targeted-edit guard] | [EVIDENCE] PRD requires editing `.claude/skills/harness-audit/SKILL.md` (`prd.md:46`, `prd.md:59`); protected paths list `harness-audit` (`.claude/protected-paths.txt:22`) and warns against deletion/deprecation without override (`.claude/protected-paths.txt:2`). | [RECOMMENDATION] Add AC that the harness-audit change is copy-only and targeted: preserve frontmatter, decision flow, auditor roles, output formats, and skill behavior; do not delete/deprecate the protected skill.
[SEVERITY: L] [STORY: US-004] [“Relevant tests/checks” is underspecified for a docs-only fix] | [EVIDENCE] `prd.md:54` says relevant tests/checks pass, but this is a minimal single-developer harness (`context/USER.md:46`) and `context/USER.md:51` warns against premature abstraction. | [RECOMMENDATION] Name the expected lightweight checks up front: symlink check for `workspace/CLAUDE.md -> AGENTS.md`, targeted `rg` over edited files, and existing markdown/CI checks if available; explicitly avoid adding new evals/tests unless an existing guard already covers this surface.

## Synthesis

- **High-severity findings**: 0
- **Medium-severity findings**: 3
- **Low-severity findings**: 2
- **Recommendation**: PROCEED with AC mitigations: scope validation to edited default-template/audit files, preserve `/harness-audit` behavior because it is protected, and name lightweight checks explicitly.
