# Critique — branch-restore-guard

Generated 2026-06-11; reviews `prd.md` post-/prd, pre-/ralph.

## Critic A — Implementer lens

```
[SEVERITY: H] [US-001] post-restore assertion `git diff --quiet` omits the staged-index
  check; §1 guard uses `git diff --quiet && git diff --cached --quiet`. Assertion must
  mirror §1 or a staged-but-uncommitted residue trips the next fire's --cached guard.
[SEVERITY: H] [US-003] claim that `git checkout -f development` leaves staged index
  entries → would recreate the jam via the index path. (REFUTED by experiment, see below.)
[SEVERITY: M] [US-005] probe negative-grep `git checkout development([^ ]|$)` is fragile;
  assert PRESENCE of `-f` on every checkout-development line instead.
[SEVERITY: M] [US-004] US-001 (Guidelines bullet ~307) and US-004 (§7 ~271-273) edit the
  same subsection; parallel workers risk a merge conflict. Serialize SKILL.md edits.
[SEVERITY: M] [US-003] scope the §6 edit to the single `git checkout development` token;
  do not rewrite surrounding eval-gate vocabulary that eval-gate.sh greps.
[SEVERITY: L] [*] `git checkout -f development` fails if `development` is absent locally;
  misleading "dirty state" message. (development always exists here; note as limitation.)
[SEVERITY: L] [US-005] probe substring vs full assertion string — tighten match.
[SEVERITY: L] [*] No protected-path violation: autopilot/SKILL.md not in protected-paths.txt;
  edit (not delete). evals/probes/ not protected. CLEAN.
```

## Critic B — User lens

```
[SEVERITY: M] [*] Stranded non-development branch reached when a run is interrupted BEFORE
  §5/§6/§7 (e.g. SIGKILL between §3 and §4): HEAD on feature branch, tree clean → §1 branch
  guard FAILs forever. Goal claim "a single bad run can never jam the loop" is broader than
  the fix. Add a §1 self-heal for the clean-but-stranded case, or narrow the claim.
[SEVERITY: M] [US-001..004] `git checkout -f` does NOT remove untracked files; an untracked
  file conflicting with a tracked file on development would still abort the checkout. Document
  as residual risk (rare; non-jamming in the common case — untracked files don't trip §1).
[SEVERITY: M] [US-001] No documented rollback for force-checkout; discarded UNCOMMITTED state
  is not in reflog. Document the recovery expectation for a single-developer project.
[SEVERITY: L] [US-005] probe substring proxy is fragile; anchor to full assertion line.
[SEVERITY: L] [*] probe grep could match documentation/comment lines, not just commands.
[SEVERITY: L] [*] No protected-path violations. CLEAN.
```

## Resolution (empirical + spec revision)

A scratch-repo experiment settled the crux finding:

```
on feat/x with BOTH staged (MM) and unstaged tracked changes + an untracked file:
  git checkout -f development  →  worktree CLEAN, index CLEAN, branch=development
  (untracked file survived; untracked files do not trip the §1 guard)
```

- **A-H2 REFUTED**: `git checkout -f development` discards staged + unstaged tracked changes
  (index AND working tree end clean). The single-command form is sufficient; no
  `git reset --hard` needed. FR-5's "no reset --hard" constraint stands.
- **A-H1 ADOPTED**: the post-restore assertion is changed to mirror §1 exactly —
  `git diff --quiet && git diff --cached --quiet || { echo "ERROR: autopilot restore left a dirty tree"; exit 1; }`.
- **B-M (stranded branch) ADOPTED** as new US-006: §1 gains a narrow self-heal — if HEAD is
  not on `development` AND the tree is clean (nothing to lose), force-checkout `development`
  before the guards; the hard FAIL on a *dirty* tree is preserved (protects any human WIP).
- **A-M / B-L (probe robustness) ADOPTED**: probe asserts every `git checkout … development`
  line carries `-f` (`grep 'git checkout' lines without '-f development' → must be empty`),
  `git checkout -f development` appears ≥ 3×, and the full assertion substring is present.
- **A-M (parallel edit conflict) ADOPTED**: all `SKILL.md` edits are made by a single
  worker / serialized — no parallel edits to the same file.
- **B-M (untracked) + A-L (branch absent) + B-M (rollback)**: documented in Technical
  Considerations as acknowledged residual risks; `development` always exists in this repo.

## Synthesis
- **High-severity findings**: 2 (A-H1 adopted via assertion fix; A-H2 refuted by experiment)
- **Medium-severity findings**: 5 (all adopted as spec revisions or documented residual risk)
- **Recommendation**: PROCEED (PRD revised to incorporate the mitigations; no unmitigated
  high-severity finding remains; no protected-path violation)
