# Critique — harness-audit-stale-paths

Generated 2026-06-11; reviews `prd.md` post-/prd, pre-/ralph.

## Critic A — Implementer lens (raw)

Key findings:
- **[H, US-003]** Probe exclusion mechanism ambiguous: GNU `grep --exclude` matches basenames, not path components; the `docs/wiki/changelog` substring in `harness-context/SKILL.md` would false-positive. **Mitigation applied:** US-003 AC now pins the exact command `grep -rnE '...' "$ROOT/.claude/skills/" | grep -v 'harness-context/SKILL.md'`.
- **[M, US-001]** "Reword surrounding prose" under-specified per auditor section. **Mitigation:** implementation map enumerates each line; advisor/orchestrator executes the rewordings directly.
- **[M, US-001]** Reference-table rows (lines 306/309) are a separate section the line-range ACs could miss. **Mitigation:** zero-match grep is the definitive pass criterion (covers the whole file).
- **[M, US-004]** CHANGELOG already has a `### Fixed` block under `[Unreleased]`; appending a second heading would violate Keep-a-Changelog. **Mitigation:** US-004 AC now says APPEND to the existing block.
- **[L]** New probe has no prior-green baseline in RESULTS.md. **Resolution:** a new green probe cannot be a green→red regression, so it does not block the §6 gate (noted in US-003 AC).

## Critic B — User lens (raw)

Key findings:
- **[M, *]** More phantom paths exist in `harness-audit/SKILL.md` (`apps/docs/`, `workspace/.claude/skills/`, root `MEMORY.md`) — fixing only two token classes leaves residual false negatives; either widen or name the deferred items. **Resolution:** investigated all candidates (see below); the broader set is either intentional (`workspace/.claude/skills/` guarded dual-scope) or part of a separate, multi-skill concern (`apps/docs/`, bare `MEMORY.md`). Now explicitly named in Non-Goals rather than silently ignored.
- **[M, US-003]** Probe naturally invites future widening → maintenance debt (USER.md "don't pre-build"). **Resolution:** probe scoped to exactly the two truly-dead renamed-dir tokens; scope note added to US-003.
- **[L]** Verify `#43` is the real issue number before linking. **Resolution:** confirmed — issue filed as #43 this session.
- **[L]** No probe-root portability. **Mitigation:** US-003 AC requires `${BASH_SOURCE[0]}` root detection, no hardcoded path.

## Scope investigation (triggered by Critic B)

A repo-wide sweep (`grep -rnE` over `.claude/skills/`) confirmed:
- `docs/wiki/` and `workspace/heartbeats/` — appear ONLY in `harness-audit` (in scope), `skill-lint:216` (in scope), and `harness-context:31` (prose, excluded). Truly dead → safe to fix + guard.
- `workspace/.claude/skills/` — appears in `context-audit` (guarded), `skill-lint` (26/225), `harness-audit` (125/305). Intentional dual-scope, NOT a bug → leave everywhere.
- `apps/docs/` — `harness-audit`, `ci-status` (quotes `docs.yml` filter), `strategic-proposal`. Multi-skill; needs `docs.yml` confirmation → deferred.
- bare `MEMORY.md` — `harness-audit`, `delegate`, `strategic-proposal`. Low-impact pointers → deferred.

Conclusion: the original two-token scope is the correct, bounded, green-able fix. Deferred candidates are named in Non-Goals.

## Synthesis

- **High-severity findings**: 1 (probe exclusion mechanism) — MITIGATED at AC level (exact grep command pinned).
- **Medium-severity findings**: 3 — all mitigated (prose-reword map, CHANGELOG append, scope investigation → Non-Goals).
- **Protected-path violations**: 0. The PR touches `harness-audit` and `skill-lint` (both on `protected-paths.txt`) but only EDITS them (no deletion/deprecation), which is permitted; it adds a new probe and a CHANGELOG line.
- **Recommendation**: PROCEED. No unmitigated SEVERITY-H finding and no protected-path deletion; all critic findings are resolved in the revised prd.md.
