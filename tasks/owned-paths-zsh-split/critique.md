# Critique — owned-paths-zsh-split

Generated 2026-06-13; reviews `prd.md` post-/prd, pre-/ralph. Two adversarial
critics (implementer + user lens), per `/ship-spec` Stage 3.

## Critic A — Implementer lens

High-severity:
- **H** [US-001/US-002] `git diff --cached --quiet -- $OWNED_PATHS` is a DISTINCT
  substring from `git diff --quiet -- $OWNED_PATHS`; the absence-grep and the
  probe regression guard only checked the non-cached form. A fix that misses the
  `--cached` form passes all ACs with a still-broken guard. → Add symmetric
  `--cached` absence/regression checks.
- **H** [US-002] The `owned-surface-guard.sh` unscoped-leak drop-filter
  (`grep -vF -- '-- $OWNED_PATHS'`) must update to the array form or the scoped
  array-form lines leak as "unscoped tree-wide diffs" → false REGRESSION even
  against a correct SKILL.md. Verify the pipeline output is empty after the edit.

Medium:
- **M** Count threshold mismatch: US-001 requires ≥4 restore sites, probe
  asserted ≥3 → raise `clean-restore.sh` threshold to ≥4.
- **M** Stale `bare, unquoted` / `used UNQUOTED` guidance in the §1 NOTE block
  (~L83-94) not covered by any AC → add `grep -F 'bare, unquoted'` empty check.
- **M** zsh-fidelity assertion under `set -e` may silently exit 1 with no message;
  needs explicit exit-code capture + `command -v zsh` guard before extraction.

Low:
- **L** Reference status-token table (`BLOCKED-OWNED-WIP` row ~L380) still says
  `$OWNED_PATHS` — stale prose.
- **L** US-003 disjunction ("comment OR memory log") not directly verifiable →
  narrow to memory log (canonical per memory.md).
- Edge cases: anchor the zsh extraction to `^OWNED_PATHS=(`; `grep -F` is
  load-bearing (the `[@]` are BRE metachars); restore the test file with
  `git checkout --` (tracked file), not `rm`.

## Critic B — User lens

High-severity:
- **H** Probe-inversion atomicity: both probes currently PASS by asserting the
  BROKEN bare form. US-001 (remove bare form) and the probe update must land
  ATOMICALLY or an intermediate commit breaks the eval suite. → bundle into one
  story.
- **H** Drop-filter coupling (same as Critic A) — the trickiest update; verify
  empty output explicitly.

Medium:
- **M** Liveness-table prose mention of `$OWNED_PATHS` is descriptive text the
  `-- ` prefixed grep won't catch → clarify prose mentions are in scope.
- **M** zsh extraction method unspecified → document the exact extraction command,
  anchored, with a note about multi-line future edits.
- **M** No documented rollback for a partial fix (autopilot edits its own skill).

Low / missing:
- **L** US-003 must dirty an EXISTING tracked file under `tasks/`, not a new one.
- Probe `# desc:` header lines still document the old bare form → stale.
- Non-Goals should explicitly exclude `scripts/ralph.sh` intentional
  flag-splitting to prevent scope drift.
- `evals/RESULTS.md` refresh — handled by the autopilot §6 `/eval` gate.

## Synthesis

- **High-severity findings**: 4 (2 distinct: probe-inversion atomicity; `--cached`
  symmetry + drop-filter coupling). All are spec-COMPLETENESS gaps, NOT rejections
  of the approach — both critics independently confirm the array form is correct
  under bash AND zsh, and Critic B notes the fix *reduces* attack surface.
- **Medium-severity findings**: 6. **Low-severity findings**: ~5.
- **Protected-path violations**: 0 (no `.claude/protected-paths.txt` entry is
  deleted; the skill + probes are edited in place).
- **Resolution**: PRD revised in place to add AC-level mitigations for EVERY
  high- and medium-severity finding — most importantly, US-001 now bundles the
  SKILL.md edit AND both probe edits into one atomic story (resolves the top H
  finding from both critics), and adds `--cached` symmetry, the drop-filter
  verification, the ≥4 count, the stale-prose cleanup (`bare, unquoted` /
  `UNQUOTED` / reference-table / probe `# desc:`), the `command -v zsh` +
  explicit-exit-code zsh-fidelity assertion, the anchored extraction, the
  `git checkout --` restore, the memory-log record, and the `scripts/ralph.sh`
  scope exclusion.
- **Recommendation**: PROCEED. Every H finding has an AC-level mitigation applied
  (the HALT path is reserved for unmitigatable rejections / protected-path
  violations; neither is present here).
