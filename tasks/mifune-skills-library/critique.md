# Critique — mifune-skills-library

Generated 2026-05-16; reviews `prd.md` post-/prd, pre-/ralph.

## Critic A — Implementer lens

```
CRITIC_A — IMPLEMENTER LENS
[SEVERITY: H] [STORY: US-002] `registry.json` contradicts `01-architecture.md` § Generation rules ("registry.json is generated, not hand-edited", CI drift fails build). PRD US-002 mandates hand-writing it. US-007 validate.sh only checks JSON parse + skill coverage — no `publish-registry.sh --check`. | EVIDENCE: 01-architecture.md line 127 vs PRD FR-4 + US-009 | RECOMMENDATION: Defer generation enforcement to V1 in Non-Goals OR add `--check` dry-run that is expected to fail.

[SEVERITY: H] [STORY: US-003, US-005] Running `/skill-lint` against folders outside `.claude/skills/` is unresolved (Q3) but blocks 3 AC + US-010. | EVIDENCE: PRD § 9 Q3 + US-003/US-005/US-010 ACs | RECOMMENDATION: Resolve Q3 before implementation; prototype or revise AC.

[SEVERITY: H] [STORY: US-006] `--client harness` writes to `.claude/skills/<name>/` inside cwd. From harness root would write into `.claude/skills/` namespace; installer has no deny-list. | EVIDENCE: Protected paths include `prd`, `harness-audit`; adapted names differ but no collision check | RECOMMENDATION: AC requiring abort when cwd is harness repo OR prominent README warning.

[SEVERITY: H] [STORY: US-010] Simulate-install AC doesn't specify cwd; `.git`-walk for lock file location is critical edge case. Untested. | EVIDENCE: US-010 AC bullet 1 + 02-install-system.md § Risk E | RECOMMENDATION: Explicit cwd + negative-test for non-git dir.

[SEVERITY: M] [STORY: US-001] Worktree has no `.git`; install.sh's `git clone` cannot compute a commit SHA. Lock schema requires real SHA. | EVIDENCE: 02-install-system.md lock schema + US-001 AC + US-006 install.sh | RECOMMENDATION: Clarify whether `.git init` happens OR US-006 specifies stub value with local-dev marker.

[SEVERITY: M] [STORY: US-006] "Atomically rolls back" is unverified — no negative-test AC. Bash `set -euo pipefail` ≠ rollback. | EVIDENCE: US-006 AC bullet 5 + FR-10 | RECOMMENDATION: Add AC requiring simulated failure test confirming rollback.

[SEVERITY: M] [STORY: US-007] validate.sh deny-list stricter than spec; could fail skills that pass upstream `skills-ref`. | EVIDENCE: US-007 deny-list vs 01-architecture.md "allowed but discouraged at top level" | RECOMMENDATION: Document the stricter Mifune policy explicitly.

[SEVERITY: M] [STORY: US-002] Checksum algorithm in § 7 Technical Considerations is not in registry.json or machine-readable location. V1 generator would re-implement and risk drift. | EVIDENCE: PRD § 7 vs no AC | RECOMMENDATION: AC requiring algorithm doc in canonical location.

[SEVERITY: M] [STORY: US-008] README install one-liner uses GitHub raw URL that won't exist until manual push happens. | EVIDENCE: US-008 AC + Non-Goals | RECOMMENDATION: Placeholder warning in README OR note in verification.md.

[SEVERITY: M] [STORY: US-009] `skills-ref` install path + version pin unresolved (Q2). Unpinned global install in CI = supply-chain risk. | EVIDENCE: US-009 AC + PRD Q2 | RECOMMENDATION: Resolve Q2 before authoring ci.yml.

[SEVERITY: L] [STORY: US-006] `--client harness` "atomic" requires same-filesystem temp dir; AC doesn't constrain. | EVIDENCE: US-006 AC bullet 5 + FR-10 | RECOMMENDATION: AC note that temp dir must be on same filesystem.

[SEVERITY: L] [STORY: US-001] `.github/PULL_REQUEST_TEMPLATE.md` casing matters for GitHub. | EVIDENCE: US-001 AC vs 01-architecture.md tree | RECOMMENDATION: Confirm casing matches GitHub convention.
```

## Critic B — User lens

```
CRITIC_B — USER LENS
[SEVERITY: H] [STORY: US-002] registry.json spec is GENERATED, not hand-written; PRD US-002 + FR-4 forbid generator; CI drift-check would immediately fail. | EVIDENCE: prd.md § US-002, 01-architecture.md § Generation rules | RECOMMENDATION: Either minimal publish-registry.sh OR remove CI drift-check from V0 + document exception.

[SEVERITY: H] [STORY: US-006] P6 says "Version pinning uses commit SHA, not branch refs"; install.sh clones --depth 1 of `main` (mutable ref). | EVIDENCE: prd.md § US-006 AC 6, 00-vision.md P6, 01-architecture.md § Immutability | RECOMMENDATION: Document deviation OR derive + record commit SHA at install time.

[SEVERITY: H] [STORY: US-007] validate.sh is gatekeeper but doesn't check registry checksums match folder contents; CI won't catch drift. | EVIDENCE: prd.md § US-007 AC, US-002 checksum field | RECOMMENDATION: AC verifying each checksum.

[SEVERITY: M] [STORY: US-001] 01-architecture.md shows .claude-plugin/, packages/cli/ in layout; US-001 omits .claude-plugin/. Structural gap for V1. | EVIDENCE: prd.md § US-001, 01-architecture.md | RECOMMENDATION: Add .claude-plugin/ with placeholder OR explicit Non-Goal.

[SEVERITY: M] [STORY: US-006] "Atomic" two-path write rollback is unspecified; Bash has no native primitive. | EVIDENCE: US-006 AC 5 | RECOMMENDATION: Specify rollback mechanism (temp+rename+cleanup).

[SEVERITY: M] [STORY: US-008] curl-pipe-bash with `| bash -s --` is non-obvious UX; no README guidance. | EVIDENCE: US-008 + 00-vision.md § Anti-success | RECOMMENDATION: Explain pattern in README.

[SEVERITY: M] [STORY: US-006] Lock file at "repo root" but installer runs from arbitrary cwd; no git-walk-up specified. | EVIDENCE: US-006 AC 8 + 07-risks.md Risk E | RECOMMENDATION: AC for walk-up OR doc V0 limitation.

[SEVERITY: M] [STORY: US-003, US-005] Adapted from protected-path sources; no AC verifying sources are byte-unchanged. | EVIDENCE: US-003, US-005, Non-Goals; protected-paths.txt | RECOMMENDATION: AC: `git diff --exit-code` on source folders post-implementation.

[SEVERITY: M] [STORY: US-010] Temp dir starting state unspecified; partial prior run could vacuously pass idempotency. | EVIDENCE: US-010 AC 1-2 | RECOMMENDATION: AC requiring `mktemp -d` fresh dir.

[SEVERITY: M] [STORY: *] Q2 skills-ref blocking dep with no fallback. | EVIDENCE: PRD Open Questions Q2 | RECOMMENDATION: Resolve Q2 with pinned install, fail loudly if absent.

[SEVERITY: L] [STORY: US-002] $schema URL doesn't exist until V1 ships skills.mifune.dev. | EVIDENCE: US-002 AC 2, 06-roadmap.md | RECOMMENDATION: Use placeholder URL OR omit $schema OR ship schema in-repo.

[SEVERITY: L] [STORY: US-009] "via npm or curl per upstream docs" too vague; two implementers write different steps. | EVIDENCE: US-009 AC 4 | RECOMMENDATION: Pin exact skills-ref install command.

[SEVERITY: L] [STORY: US-008] README links to internal harness spec path; broken/confusing for external contributors. | EVIDENCE: US-008 AC 4 | RECOMMENDATION: Self-contained layout OR link to public agentskills.io.
```

## Synthesis

- **High-severity findings**: 6 (4 unique technical issues; 2 critics co-flagged the registry-hand-written contradiction; 2 critics partially co-flagged the lock/cwd resolution and source-skill protection issues)
- **Medium-severity findings**: 12
- **Low-severity findings**: 5
- **Protected-path violations**: 0 (the seed skills adapt from protected-list entries; PRD explicitly forbids modifying sources and US-010 now verifies byte-identical via `git diff --exit-code`)
- **Recommendation**: **PROCEED with AC-level mitigations applied to PRD**.

All 6 H findings have been resolved by AC edits to US-002, US-002b (new), US-006, US-007, and US-010, plus updates to § Non-Goals and § Open Questions. See `prd.md` § 10 *Critique synthesis* for the mitigation map. The PRD is the gate; pushing those mitigations into the AC text is the load-bearing change. No GitHub-side state has been created; the gate is intact.
