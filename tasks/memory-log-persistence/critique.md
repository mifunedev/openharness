# Critique — memory-log-persistence

Generated 2026-06-13; reviews `prd.md` post-/prd, pre-/ralph.

## Critic A — Implementer lens

- [M] AC bullet 5 parenthetical factually wrong: probe lives in `evals/probes/`, outside the `context/`+`.claude/skills/` grep scope; correct expectation is **0 matches**, not a probe-header match. → FIXED in PRD.
- [M] False PASS on absent `context/rules/memory.md` in Assertion B: `if grep -q "tracked inside" <missing>` evaluates false → exit 0. SKIPPED spec only covered `.gitignore` absent. → FIXED: SKIPPED now guards BOTH files.
- [M] CI shellcheck does not cover `evals/probes/`; "shellcheck-clean" AC has no CI enforcement. Expanding the boot-lint glob would flip the `boot-lint-glob` probe to REGRESSION. → FIXED: AC now mandates a MANUAL `shellcheck -S warning` gate and explicitly does NOT expand the glob.
- [M] Assertion A literal-string grep brittle to a commented-out `# memory/[0-9]*/` (false PASS) line. → FIXED: skip comment lines via `grep -v '^[[:space:]]*#'`.
- [Testing gap] No negative test that the probe exits 1 if the claim is reintroduced. → FIXED: added a negative-test AC (temporarily reintroduce, confirm exit 1, revert).
- [L] Issue #101 dangling-reference risk. → Non-issue: #101 is open (filed this run).
- [L] `.claude/rules` is a symlink to `../context/rules`; dual-path nature unmentioned. → Acknowledged; Ralph edits the canonical `context/rules/memory.md`.
- [edge] No probe asserts vestigial logs remain tracked (FR-2). → Acknowledged as Known Limitation; enforced by scope/review.

## Critic B — User lens

- [H] Success metric "'/eval' runner exits 0" is false today — `next-dev-prod` is a pre-existing REGRESSION (runner exits non-zero). Misleads the implementer using `/eval` as a gate. → FIXED: success metric rewritten to "no NEW REGRESSION beyond pre-existing `next-dev-prod`", citing the 2026-06-13 MEMORY.md eval-gate lesson.
- [M] The 2026-05-24 MEMORY.md lesson itself contains a now-stale sub-claim ("no daily log has ever been committed") contradicted by the two vestigial tracked logs; PRD was silent on it. → FIXED: added to Non-Goals with the immutability rationale (memory entries are immutable per the Concurrency rule).
- [M] Vestigial-log note placement underspecified — a buried note satisfies the letter while a layout-block skimmer stays confused. → FIXED: AC now requires the note inside/directly below the § Layout block.
- [L] Assertion B is exact-string only; a reworded false claim slips through. → FIXED: documented as a Known Limitation.
- [L] Grep scope excludes `crons/heartbeat.md`. → FIXED: Non-Goals notes heartbeat refs are operational, not persistence claims.

## Protected-path check

`context/rules/memory.md` (= `.claude/rules/memory.md` via symlink) is NOT in `.claude/protected-paths.txt`. No protected-path violation. The four protected rules (git.md, sandbox-processes.md, advisor-model.md, recursive-delegation.md) are untouched.

## Synthesis

- **High-severity findings**: 1 (Critic B success-metric inaccuracy) — **mitigated at AC level** by rewording the metric to cite the pre-existing `next-dev-prod` red and the 2026-06-13 eval-gate lesson. Not a code/destructive risk; no spec-blocking H finding remains.
- **Medium-severity findings**: 5 — all resolved in the revised PRD (probe robustness: dual-file SKIPPED guard, comment-line skip, negative test; manual shellcheck gate; vestigial-note placement; MEMORY.md lesson immutability in Non-Goals).
- **Low-severity findings**: 4 — acknowledged (string-match limitation + vestigial-log assertion documented as Known Limitations; heartbeat operational refs noted; symlink path noted).
- **Recommendation**: PROCEED. No unmitigated high-severity finding; no protected-path violation. The revised `prd.md` incorporates every actionable critic finding.
