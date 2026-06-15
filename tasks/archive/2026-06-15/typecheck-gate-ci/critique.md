# Critique — typecheck-gate-ci

Generated 2026-06-12; reviews `prd.md` post-/prd, pre-/ralph. The PRD was
**revised after this critique** to resolve all high-severity findings; see
§ Synthesis for the resolution mapping.

## Critic A — Implementer lens

```
CRITIC_A — IMPLEMENTER LENS

[SEVERITY: H] [STORY: US-001, US-002] packages/oh is NOT in pnpm-workspace.yaml, so the filter './packages/**' silently excludes it at runtime | pnpm-workspace.yaml lists only packages/docs; `pnpm --filter './packages/oh' run typecheck` prints "No projects matched" exit 0 | Either add oh to the workspace (verify deliberate exclusion first) or add a discrete step that runs tsc directly inside packages/oh. As written the CI step passes permanently while oh rots.

[SEVERITY: H] [STORY: US-001] FR-2 ("a type error in packages/oh MUST fail the step") is unverifiable with the proposed command because oh is excluded from the workspace filter | the filter is workspace-membership, not a filesystem glob | Gate the PR on resolving the workspace exclusion before merge.

[SEVERITY: M] [STORY: US-002] AC "pnpm typecheck exits 0" is only weakly verifiable — it exits 0 whether oh is checked or not, masking the gap | the command emits only @openharness/docs | Add an AC that output names BOTH packages.

[SEVERITY: M] [STORY: US-001] The ci job name "Lint, Build & Test" becomes stale/misleading once a Typecheck step is added | ci-harness.yml:49 | Update the job name in the same commit.

[SEVERITY: M] [STORY: US-003] AC `grep "#51" CHANGELOG.md` is unanchored — a match in any prior versioned section passes falsely | US-003 AC | Verify the bullet falls inside the [Unreleased] block.

[SEVERITY: L] [STORY: US-002] "positioned after format:check" in package.json is cosmetic and fragile (JSON key order has no meaning) | package.json scripts | Drop the position constraint from the hard AC.

[SEVERITY: L] [STORY: *] "conflict-free with #48/#50" is directionally right, but ci-harness.yml is in those PRs' paths: triggers; verify neither edits ci-harness.yml directly | ci-harness.yml paths | Confirm merge order if they touch the workflow.
```

## Critic B — User lens

```
CRITIC_B — USER LENS

[SEVERITY: H] [STORY: US-001] scripts/cron-runtime.ts TypeScript is silently excluded from the gate | filter './packages/**' + protected-paths.txt scripts/cron-runtime.ts | scripts/ TS is type-checked by vitest at test time but NOT by tsc --noEmit; the gate will not cover the load-bearing cron-runtime. PRD must explicitly scope scripts/ out (and why) or add a follow-on story. [PROTECTED-PATH]

[SEVERITY: H] [STORY: US-001] No root tsconfig.json; the gate relies entirely on per-package tsconfigs — root/scripts TS has no tsc path | no root or scripts/ tsconfig found | PRD claims "all workspace TypeScript" but vitest.config.ts and scripts/*.ts are uncovered. Non-Goals must state root-level/scripts TS is not covered.

[SEVERITY: M] [STORY: US-002] Root typecheck uses --filter form diverging from existing root scripts (-r --if-present, unfiltered) | package.json build/lint/format:check | Inconsistency: a future non-packages/ TS gains coverage in one place but not the other.

[SEVERITY: M] [STORY: US-001] ci job name "Lint, Build & Test" not updated to include Typecheck | ci-harness.yml:49 | Misleading in the PR checks UI; low-cost fix.

[SEVERITY: M] [STORY: *] No escape hatch if the gate trips on a CI-vs-local tsc version difference | Technical Considerations | Add a note to check tsc version alignment if the gate unexpectedly blocks.

[SEVERITY: L] [STORY: US-003] CHANGELOG bullet ordering within ### Added is underspecified | US-003 AC | Minor; grep does not validate ordering.

[SEVERITY: L] [STORY: *] Non-Goals omits .pi/** TypeScript, which CI already triggers on | ci-harness.yml paths, vitest.config.ts | Acknowledge the .pi/ gap.
```

## Synthesis

- **High-severity findings**: 4 (Critic A: oh excluded by workspace filter ×2;
  Critic B: scripts/ uncovered, no root tsconfig / "all TS" overclaim ×2)
- **Medium-severity findings**: 6
- **Low-severity findings**: 4
- **Recommendation**: **PROCEED** — every high-severity finding is resolved by a
  PRD revision (AC-level mitigation), so the critic gate does not HALT.

### Resolution mapping (how each H/key-M finding was addressed in the revised prd.md)

| Finding | Sev | Resolution in revised PRD |
|---|---|---|
| oh excluded by `--filter './packages/**'` (silent false gate) | H | Verified true (`pnpm-workspace.yaml` lists only `docs`). Design changed: `oh` gets its own explicit `npm --prefix packages/oh ci && npm ... run typecheck` step (US-001). FR-2 is now genuinely verifiable for oh. |
| FR-2 unverifiable for oh | H | Now verifiable — explicit oh step; PRD adds a transient error-injection verification in Success Metrics. |
| `scripts/` TS not covered | H | Explicit Non-Goal: scripts/ (and `.pi/`) have no tsconfig; gating them is a separate, larger task with a recommended follow-up ticket. Honest scoping, not a silent gap. `scripts/cron-runtime.ts` (a protected path) is **not modified**. |
| No root tsconfig / "all TS" overclaim | H | PRD reworded: covers "the two packages that ship a typecheck script (oh + docs)", not "all TypeScript"; Non-Goals lists what is uncovered. |
| Root typecheck divergence | M | Root `typecheck` explicitly runs BOTH docs (pnpm) and oh (npm) — more complete than the existing unfiltered root scripts; rationale documented in Technical Considerations. |
| Stale ci job name | M | US-001 AC now requires updating the job `name:` to include Typecheck (FR-6). |
| Unanchored CHANGELOG grep | M | US-003 AC tightened to a range check within the `[Unreleased]` block. |
| CI-vs-local tsc drift escape hatch | M | Technical Considerations notes `npm ci` determinism + tsc version alignment. |
| Cosmetic JSON position AC | L | Hard AC reduced to "key exists + valid JSON + exits 0". |
| Conflict-free claim vs #48/#50 paths | L | Verified via `gh pr view`: substantive files (`ci-harness.yml`, root `package.json`) are conflict-free with both PRs. PR #48 also edits `CHANGELOG.md` (both append to `### Added`) — the routine stacked-changelog overlap; mitigated by appending our bullet at the END of the Added list, and it resolves trivially (keep both bullets) if a textual conflict arises. PR #50 has no file overlap. |
| `.pi/` gap | L | Acknowledged in Non-Goals alongside scripts/. |

No `[PROTECTED-PATH]` deletion is proposed — `scripts/cron-runtime.ts` (a
protected path) is read-about-only and explicitly left untouched.

**Gate decision: PROCEED.** Critics ran with high-severity findings, all of
which were resolved by revising `prd.md` before any GitHub-side state changed.
Medium/low risks are acknowledged and addressed in the revised PRD.
