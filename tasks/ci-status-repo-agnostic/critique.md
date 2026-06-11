# Critique — ci-status-repo-agnostic

Generated 2026-06-11; reviews `prd.md` post-/prd, pre-/ralph.

## Critic A — Implementer lens

```
CRITIC_A — IMPLEMENTER LENS

[SEVERITY: H] [STORY: US-001] gh repo view resolves from the git remote; if origin is upstream (mifunedev) the bug could reproduce. | EVIDENCE: prd.md "works identically from fork or upstream" only true if origin == fork. | RECOMMENDATION: document which remote gh repo view resolves; add an empty-guard.

[SEVERITY: H] [STORY: US-001] PR-first path assumes one open PR per branch; stacked-PR scenario (git.md § Stacked PRs) is ambiguous with gh pr view sans number. | EVIDENCE: AC bullet 3; git.md § Stacked PRs. | RECOMMENDATION: specify multi-PR resolution rule + explicit PR number derivation.

[SEVERITY: M] [STORY: US-001] AC bullet 7 grep is a presence check, not behavioral; commented line would pass. | RECOMMENDATION: name the instruction step + require PR path ordered before branch-runs fallback.

[SEVERITY: M] [STORY: US-001] gh pr checks <N> needs a PR number; no "find the PR number" step specified. | RECOMMENDATION: add explicit PR_NUMBER derivation AC.

[SEVERITY: M] [STORY: US-001] NO-RUN diagnostic hardcodes workflow file names specific to this harness. | RECOMMENDATION: scope NO-RUN section with a "this harness's layout" caveat.

[SEVERITY: M] [STORY: US-001] --repo override has no validation/error path for malformed input. | RECOMMENDATION: add malformed --repo error AC.

[SEVERITY: L] [STORY: US-001] CI Pipeline Steps section is repo-specific (Prisma/Playwright). | RECOMMENDATION: explicitly mark out of scope / instance-specific.

[SEVERITY: L] [STORY: US-001] AC bullet 8 "valid/coherent" is subjective. | RECOMMENDATION: concrete frontmatter-parse + step-count check.

[SEVERITY: L] [STORY: *] No rollback/smoke-test plan. | RECOMMENDATION: add post-merge smoke test to Success Metrics.
```

## Critic B — User lens

```
CRITIC_B — USER LENS

[SEVERITY: M] [STORY: US-001] gh repo view exits non-zero / unset $REPO → repos//actions silent failure (same failure mode as current bug). | RECOMMENDATION: empty-$REPO halt-with-diagnostic guard.

[SEVERITY: M] [STORY: US-001] PR-first path undefined when gh pr checks returns zero rows (PR exists, no triggered workflows). | RECOMMENDATION: define empty-checks output (NO-RUN/PASS/PENDING).

[SEVERITY: M] [STORY: US-001] NO-RUN diagnostic references repo-specific workflow names. | RECOMMENDATION: clarify "parameterized" scope; add caveat.

[SEVERITY: M] [STORY: US-001] CI Pipeline Steps section carries monorepo-stack assumptions. | RECOMMENDATION: mark instance-specific in Non-Goals.

[SEVERITY: L] [STORY: US-001] --repo override parsing mechanism for a markdown skill is underdocumented. | RECOMMENDATION: clarify it's an invoking-agent-set value, not a CLI flag.

[SEVERITY: L] [STORY: *] Success Metrics are fork-instance-specific, not auto-validatable. | RECOMMENDATION: note as scope limitation.

[SEVERITY: L] [STORY: US-001] No Non-Goal covers CLAUDE.md skills-table description. | RECOMMENDATION: add explicit exclusion or table update.
```

## Synthesis

- **High-severity findings**: 2 (both Critic A) — **mitigated at AC level** (see prd.md revised US-001 AC + Critique resolution section).
  - H1 (origin remote): `gh repo view` derives the checkout's `origin` repo, which is exactly the repo the branch/PR lives in — correct by design. Residual risk (empty derivation) closed by an explicit empty-`$REPO` halt guard (AC) — this also resolves Critic B's matching M finding.
  - H2 (multi-PR ambiguity): closed by an explicit `PR_NUMBER` derivation AC with a defined tie-break (first/most-recent open PR for the head branch).
- **Medium-severity findings**: 6 — addressed: empty-guard (AC), PR_NUMBER derivation (AC), `--repo` format validation (AC), NO-RUN/CI-Pipeline-Steps instance-scope caveat (AC), empty-`gh pr checks` → NO-RUN mapping (AC). CLAUDE.md skills-table left unchanged (description "poll CI, report pass/fail" stays accurate — internal mechanism change only) and recorded in Non-Goals.
- **Low-severity findings**: acknowledged; concrete frontmatter/step-count AC adopted; CI Pipeline Steps marked instance-specific in Non-Goals; smoke-test added to Success Metrics.
- **Recommendation**: PROCEED (no unmitigated high-severity finding remains).
