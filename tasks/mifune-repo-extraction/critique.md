# Critique — mifune-repo-extraction

Generated 2026-06-28; reviews `prd.md` post-/prd, pre-/ralph.

## Critic A — Implementer lens

CRITIC_A — IMPLEMENTER LENS
[SEVERITY: H] [STORY: US-002] [PROTECTED-PATH] AC removes tracked `.mifune/**` contents, including protected `.mifune/skills/t3/references/sandbox-processes.md`, `.mifune/skills/advisor/SKILL.md`, `.mifune/skills/advisor/references/recursive-delegation.md`, and `.mifune/skills/retro/references/memory-protocol.md`, but only explicitly smoke-tests `.mifune/skills/git/SKILL.md`. | [EVIDENCE: .claude/protected-paths.txt; US-002 AC "Remove tracked in-core `.mifune/**` file contents"; US-002 AC `test -f .mifune/skills/git/SKILL.md`] | [RECOMMENDATION: Add explicit continuity AC for every protected `.mifune/...` path: migrated only to external pin, still reachable at the same local path after init, executable bits preserved where relevant.]
[SEVERITY: M] [STORY: US-003] Initialization scope is unverifiable because no shared initializer path/contract or exhaustive call-site list is named. | [EVIDENCE: US-003 AC "Update install/bootstrap/devcontainer entry points" and "Update any script that assumes tracked `.mifune/` contents exist"] | [RECOMMENDATION: Specify a single initializer/remediation command and enumerate required callers: installer, Makefile/sandbox, devcontainer entrypoint, CI/release checkouts, cron runtime/preflights, and provider startup paths.]
[SEVERITY: M] [STORY: US-003] CI path filters currently watch `.mifune/skills/**` and `.mifune/hooks/**`; after submodule extraction, future pin bumps change the gitlink path `.mifune` and `.gitmodules`, so required CI may not run. | [EVIDENCE: .github/workflows/ci-harness.yml path filters; US-003/US-005 CI requirements] | [RECOMMENDATION: Add AC to update workflow path filters for `.mifune`, `.gitmodules`, and any bootstrap manifest so submodule pointer changes trigger checks.]
[SEVERITY: M] [STORY: US-004] The new eval probe is asked to fail when `.mifune/` is missing, but the mandated runner itself lives at `bash .mifune/skills/eval/run.sh`, so a missing checkout fails before the probe can execute or report the intended oracle. | [EVIDENCE: US-004 AC "fails when `.mifune/` is missing"; US-004 AC `bash .mifune/skills/eval/run.sh --probe <new-or-updated-mifune-probe>`] | [RECOMMENDATION: Add a root-level CI/bootstrap smoke check or stable wrapper that validates/initializes `.mifune` before invoking the Mifune-hosted eval runner.]
[SEVERITY: M] [STORY: US-001] External repository creation/push assumes maintainer permissions and public accessibility but does not gate or verify them. | [EVIDENCE: US-001 AC "Create or use `mifunedev/mifune`"; Technical Considerations "external repo must be public or otherwise accessible to CI and new users"] | [RECOMMENDATION: Add preflight AC for repo existence, push rights, visibility/access from unauthenticated CI/fresh clone, default branch, and fallback destination approval.]
[SEVERITY: M] [STORY: US-005] Hermes compatibility is a non-goal constraint but not covered by provider symlink or end-to-end verification ACs. | [EVIDENCE: Non-Goals "Removing Claude, Codex, Pi, or Hermes provider support"; AGENTS.md describes Hermes sharing `.mifune/skills`; US-002/US-005 only verify `.pi`, `.claude`, `.codex`] | [RECOMMENDATION: Add INSTALL_HERMES=true verification that entrypoint creates `.hermes/skills/openharness` after Mifune init and that it resolves to `.mifune/skills`.]
[SEVERITY: L] [STORY: US-004] PRD omits the repo-required changelog update for a user-visible extraction. | [EVIDENCE: .mifune/skills/git/SKILL.md "Every PR with user-visible impact MUST add entry under `## [Unreleased]`"; no CHANGELOG AC in prd.md] | [RECOMMENDATION: Add `CHANGELOG.md` Unreleased entry acceptance criteria.]

## Critic B — User lens

CRITIC_B — USER LENS
[SEVERITY: H] [STORY: US-002] [PROTECTED-PATH] PRD proposes removing tracked `.mifune/**` contents, which includes protected `.mifune/skills/git/SKILL.md`, advisor, t3, and retro paths, without requiring verification for every protected `.mifune` entry. | [EVIDENCE: tasks/mifune-repo-extraction/prd.md US-002; .claude/protected-paths.txt] | [RECOMMENDATION: Add explicit continuity AC: every protected `.mifune/...` entry remains reachable at the same repo-relative path after init, with concrete `test -f/-x` checks.]
[SEVERITY: M] [STORY: US-002] Destructive extraction lacks a rollback/escape hatch if submodule/bootstrap init breaks fresh clones, CI, or provider startup after vendored contents are removed. | [EVIDENCE: tasks/mifune-repo-extraction/prd.md US-002/US-003] | [RECOMMENDATION: Add rollback criteria: restore vendored tree or previous gitlink pin, document recovery command, and require validation before deleting tracked contents.]
[SEVERITY: M] [STORY: US-001] Destination repo is ambiguous: assumption says `mifunedev/mifune` unless changed, AC requires it, and Open Questions still ask whether to use another name. | [EVIDENCE: tasks/mifune-repo-extraction/prd.md Introduction, US-001, Open Questions] | [RECOMMENDATION: Resolve destination before approval or add an explicit operator decision gate.]
[SEVERITY: L] [STORY: *] Ongoing maintainer workflow is underspecified: users will expect clear instructions for future Mifune edits, pin bumps, and cross-repo PR sequencing. | [EVIDENCE: tasks/mifune-repo-extraction/prd.md Goals, US-004, Non-Goals] | [RECOMMENDATION: Add docs AC for “how to update Mifune after extraction” and make automation/Dependabot a Non-Goal for v1.]

## Synthesis

- **High-severity findings**: 2 raw / 1 unique blocking theme
- **Medium-severity findings**: 7
- **Low-severity findings**: 2
- **Recommendation**: HALT

The blocking theme is protected-path continuity. The PRD correctly aims to preserve `.mifune/` as the runtime mount path, but it does not yet require explicit verification that every protected `.mifune/...` entry remains reachable after the tracked tree is removed and replaced with a pinned external checkout. Per the protected-path and approve-gate rules, that must be mitigated at acceptance-criteria level before implementation.
