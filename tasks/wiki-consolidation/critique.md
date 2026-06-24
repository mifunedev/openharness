# Spec Critique — wiki-consolidation

**Verdict: SPEC-APPROVED**

The plan was vetted (operator-locked decisions: wiki-only scope, true-merge style,
relocate+gitignore-by-default artifacts) and the build was verified by a two-critic
adversarial pass before commit, mirroring the `build ⇄ audit` loop.

## Adversarial verification (build ⇄ audit)

Two parallel critics independently hunted for defects before commit and caught
**three real issues**, all fixed:

1. **Reference-doc header double-path corruption** — the prepended header note in the
   three lifted `references/{ingest,query,lint}.md` contained `.mifune/skills/wiki/…`
   literals that the subsequent `wiki/`→`corpus/` sed then mangled to
   `.mifune/skills/.mifune/skills/wiki/corpus/…`. Fixed (lines 5-6 of each).
2. **Verbatim stub string** — the `see wiki-lint follow-up` substitution injected an
   awkward `/` into a code-fence output string in `lint.md`. Reworded.
3. **Missed live data path** — `harness-audit/SKILL.md:78` ran `ls "$AUDIT_ROOT/wiki/"`;
   the Advisor's exclusion-pattern verify grep had a `/wiki/` blind spot. Repointed to
   `.mifune/skills/wiki/corpus/`.

Critic-B's "staged vs working-tree" observation (rename-then-edit leaves edits unstaged)
was resolved by `git add -A`; staged content confirmed == working tree.

## Residual / accepted

- `context/IDENTITY.md:62` keeps its dated `wiki/compound-engineering.md` reference as an
  as-of-then historical lesson (consistent with the CHANGELOG carve-out).
- Follow-up (not blocking): a probe asserting `corpus/README.md` prose carries no stale
  top-level `wiki/` path would close the gap that the index-only probe leaves.

## Gates

- Full eval suite: 56 PASS / 1 SKIPPED (env) / 0 REGRESSION.
- Both coupled probes PASS; `repo-map-contract` within the 12 288-byte budget.

PROCEED to execute (audit → spec-retro → improve → groom) over PR #319.
