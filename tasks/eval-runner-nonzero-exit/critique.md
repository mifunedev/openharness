# Critique — eval-runner-nonzero-exit

Generated 2026-06-11; reviews `prd.md` post-/prd, pre-/ralph. Two critics ran in
parallel (implementer + user lens), each cross-checking `.claude/protected-paths.txt`.

## Critic A — Implementer lens

Recommendation: **REVISE-PRD**. No HALT-level (unmitigated H) findings. Key items:

- [M] PRD line-number references must be re-verified at edit time; the gate must
  follow the existing terminal `echo` so FR-2 (summary always runs) holds.
- [M] US-003 targets an inline `## Usage` sentence in SKILL.md, not a section —
  AC was unverifiable as written.
- [M] US-004 grep pattern was unspecified ("near its tail" vague); a bare
  `exit 1` grep could false-PASS. Pattern must conjoin `${#regressions[@]}` and
  the `-gt 0`-gated `exit 1`.
- [L] US-005: a `### Fixed` heading already exists under `[Unreleased]`; append a
  bullet, don't duplicate the heading.
- [L] `eval` is in protected-paths, but the PRD MODIFIES (not deletes) files
  under `.claude/skills/eval/` — no protected-path gate fires. No override needed.

## Critic B — User lens

Recommendation: **REVISE-PRD**. Two H findings, each with a concrete AC-level
mitigation (so REVISE, not HALT):

- [H] US-001 self-referential ordering: the new guard probe must be implemented
  AFTER the run.sh patch. (Mitigated: US-004 now `Depends on US-001`; and a
  brand-new probe's first run is `new-pass`/`new-fail`, never a green→red
  regression — `run.sh:86–88,94` — so it cannot fire the aggregate exit mid-wave.)
- [H] US-001 how the exit surfaces to an agent caller: autopilot invokes `/eval`
  as a skill. (Mitigated: US-003 now documents that `bash run.sh` is run via the
  Bash tool whose result surfaces `$?` to the orchestrator — making the gate
  real; the stdout `REGRESSIONS` block remains the human signal.)
- [M] Gate must be the last construct in the file so `set -e` cannot abort before
  it (mitigated: US-001 anchors the gate to EOF; US-004 greps the file tail).
- [M] eval-weekly is a degraded stdout-grep caller (intentional) — document so it
  is not mistaken for broken (mitigated: added to US-003).
- [M] US-004 grep precision (same as Critic A M) — mitigated.
- [L] CHANGELOG same-commit rule (git.md) — mitigated: folded into US-001 AC.
- [L] No rollback note — mitigated: Technical Considerations now notes `git
  revert` as the escape hatch; no feature flag.
- [L] No protected-path violation (modify, not delete).

## Synthesis

- **High-severity findings**: 2 (both with AC-level mitigations now baked into
  the revised PRD — US-001/US-003/US-004 dependency + observability + grep
  precision). No unmitigated H remains.
- **Medium-severity findings**: 4 (all addressed: SKILL.md target corrected,
  grep pattern specified, EOF-anchored gate, eval-weekly note).
- **Low-severity findings**: addressed or accepted (revert escape hatch,
  CHANGELOG co-commit, no protected-path violation).
- **Recommendation**: **PROCEED** — the PRD was revised in place to incorporate
  every H/M mitigation; nothing GitHub-side changed during the critic gate.
