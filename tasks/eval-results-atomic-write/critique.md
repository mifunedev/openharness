# Critique — eval-results-atomic-write

Generated 2026-06-13; reviews `prd.md` post-/prd, pre-/ralph.

## Critic A — Implementer lens

[H][US-001] `--ablate` `exec` path (run.sh:49) replaces the shell before the write block; trap placement + `tmp` init must be defined relative to it. Mitigation: init `tmp=""` before the ablation guard; use `trap '[ -n "$tmp" ] && rm -f "$tmp"' EXIT`.
[H][US-001] `prior_row()`/`prior_status()` grep-no-match returns 1; under `set -euo pipefail` it aborts unless every call site keeps `|| true`. Mitigation: preserve `|| true` on grep over the captured snapshot.
[H][US-001] "byte-identical" contradicts the per-run `$now` timestamp. Mitigation: restate as "structurally equivalent" (header/row-order/footer/exit identical; timestamp column masked when diffing).
[M][US-002] AC(d) "does not re-read live $RESULTS during write phase" is not statically assertable as worded. Mitigation: restate as a concrete source property — `prior_row()` body has no live `grep ... "$RESULTS"` read.
[M][US-001] `mv` atomic only same-filesystem. Mitigation: assert temp path is a sibling of `$RESULTS` (`$RESULTS.tmp.$$`), not `/tmp/`.
[M][US-002] Static-token probe couples to implementation tokens. Mitigation: document the coupling in the probe `# desc:`.
[M][US-001] `eval-runner-exit.sh` asserts the exit-1 guard via `tail -n 12`; refactor must keep `if ((#regressions)) exit 1` in the last 12 lines OR update that probe.
[M][US-001] US-001 bundles atomicity + carry-forward; keep one story but give distinct failure messages per invariant.
[L][US-003] "no behavioral spec change" unverifiable — treat as manual review item.
[L][US-002] `# source:` value unspecified — use `issue #83 (eval-results-atomic-write)`.
[L][*] First `/eval` adds a new probe row → commit the regenerated `RESULTS.md` in the PR.

## Critic B — User lens

[M][US-001] Byte-identical not checkable without a baseline; restate as structurally-equivalent with allowed diffs (timestamps).
[M][US-002] Static probe ≠ behavior; add a behavioral AC (replacing `mv` with `cat >` makes the probe exit 1); avoid `eval-runner-exit.sh`'s `tail -12` brittleness.
[M][*] Residual snapshot race between two concurrent full runs (both capture same prior, both `mv` a complete file → last-write-wins). Document as acceptable for the single-developer harness in Non-Goals/Technical.
[L][US-003] SKILL.md step 5 carry-forward prose should state it reads the pre-write snapshot (`RESULTS_ORIG`), not the live file.
[L][US-001] Specify exact `set -e` capture idiom: `RESULTS_ORIG=""; [ -f "$RESULTS" ] && RESULTS_ORIG="$(cat "$RESULTS")"`.
[L][US-001] Add to Non-Goals: `--ablate` exec-path unaffected; trap/temp mechanics apply only to the scoreboard-write path.
[L][US-002] Add first-run AC: new probe row appears PASS (not `(not run)`), other rows preserved.

**No protected-path violations identified** (`.claude/skills/eval/run.sh` is modified, not deleted/deprecated).

## Synthesis
- **High-severity findings**: 3 (all US-001; all AC-precision, all with concrete AC-level mitigations — none a design flaw or protected-path violation)
- **Medium-severity findings**: 6
- **Low-severity findings**: 5
- **Recommendation**: PROCEED — the three H findings are mitigated by tightening US-001's acceptance criteria (exact `set -e` capture idiom, `|| true` on snapshot greps, `tmp=""`-before-ablation + guarded EXIT trap, structurally-equivalent wording, and the `eval-runner-exit.sh` tail-window constraint). PRD revised accordingly before this gate.
