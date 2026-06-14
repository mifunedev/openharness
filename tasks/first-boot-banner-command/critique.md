# Critique — first-boot-banner-command

Generated 2026-06-14; reviews `prd.md` post-/prd, pre-/ralph.

## Critic A — Implementer lens

CRITIC_A — IMPLEMENTER LENS
[SEVERITY: M] [STORY: US-001] Banner-copy AC is vague enough to preserve misleading required-setup wording | [EVIDENCE: .devcontainer/entrypoint.sh says "First boot detected. Complete setup"; PRD US-001 only says distinguish optional Slack setup] | [RECOMMENDATION: Specify exact replacement copy or add AC requiring removal of "Complete setup" framing and explicit normal agent usage guidance.]
[SEVERITY: M] [STORY: US-002] Regression test contract can pass without validating the visible first-boot banner | [EVIDENCE: PRD AC only requires whole-file absence of "openharness onboard" and presence of "oh config slack" in .devcontainer/entrypoint.sh] | [RECOMMENDATION: Require the test to validate the first-boot echo block specifically, not comments or unrelated script sections.]
[SEVERITY: M] [STORY: *] Scope conflict with second user-visible banner that still references the old CLI name | [EVIDENCE: install/banner.sh checks and labels "openharness"; PRD Technical Considerations says only the "oh" binary is exposed; FR-3 excludes install/] | [RECOMMENDATION: Either explicitly declare install/banner.sh out of scope, or add a protected-path override for a narrow status-copy correction there too.]
[SEVERITY: L] [STORY: US-003] Changelog AC wording could cause a duplicate Unreleased section | [EVIDENCE: CHANGELOG.md already has "## [Unreleased]" and "### Fixed"; PRD says "gains a ## [Unreleased] entry under ### Fixed"] | [RECOMMENDATION: Clarify to add one bullet under the existing "## [Unreleased]" → "### Fixed" section.]

## Critic B — User lens

CRITIC_B — USER LENS
[SEVERITY: H] [STORY: US-001] Banner may still imply `oh config slack` “completes setup” even though `.claude/.onboarded` semantics stay unchanged, so a user can follow the new command and keep seeing first-boot guidance | [EVIDENCE: tasks/first-boot-banner-command/prd.md §US-001 + §Non-Goals; .devcontainer/entrypoint.sh first-boot marker check] | [RECOMMENDATION] Require copy that says Slack setup is optional and avoid “complete setup/onboarding” wording unless the dismissal path is real.
[SEVERITY: M] [STORY: US-001] “First-boot banner” is ambiguous because the interactive shell banner still checks `openharness`, while the PRD says only `oh` is installed; users attaching normally may still see stale CLI status even after the entrypoint copy fix | [EVIDENCE: install/banner.sh openharness CLI status block; PRD §Introduction + §FR-3; .claude/protected-paths.txt lists install/banner.sh] | [RECOMMENDATION] Either explicitly mark `install/banner.sh` as out-of-scope follow-up, or add a protected-path override note if this PR is intended to fix all user-visible boot/banner CLI naming.

## Synthesis

- **High-severity findings**: 1
- **Medium-severity findings**: 4
- **Recommendation**: PROCEED after PRD revision

The high-severity user-lens finding is mitigated in the revised PRD by requiring removal of `Complete setup` / onboarding-completion wording, explicitly marking Slack setup optional, and leaving `.claude/.onboarded` semantics unchanged as a non-goal. Medium findings are mitigated by expanding scope narrowly to `install/banner.sh` with a protected-path override, requiring tests against the specific first-boot echo block and shell-banner CLI status block, and clarifying that the changelog edit is one bullet under the existing `## [Unreleased]` → `### Fixed` section.
