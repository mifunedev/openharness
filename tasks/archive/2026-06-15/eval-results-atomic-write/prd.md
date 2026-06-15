# PRD: Atomic RESULTS.md write for the /eval runner

## Introduction

The `/eval` runner (`.claude/skills/eval/run.sh`) regenerates the
`evals/RESULTS.md` benchmark scoreboard on every invocation. It does so
**non-atomically** — line 104 `cat > "$RESULTS"` truncates the file, then the
loop at lines 114–127 appends rows one at a time with `>> "$RESULTS"`. The file
is therefore partial on disk for the whole write. Two failure modes follow:

1. **Partial-write corruption.** A SIGKILL mid-write — or two concurrent `/eval`
   invocations (the `eval-weekly` Sunday-06:00 cron and the `:05` `autopilot`
   cron fire within ~5 minutes, both able to run `/eval`) — leaves a truncated or
   interleaved scoreboard. The `autopilot` skill's §6 gate greps `RESULTS.md` for
   the regression delta; a partial/empty file yields **no REGRESSION match → a
   false PASS**, letting a genuine green→red regression promote a draft PR to
   ready.

2. **Carry-forward erasure on filtered runs.** The truncation at line 104 happens
   *before* the carry-forward loop (line 119) calls `prior_row()`, which greps the
   now-truncated file. Any `--probe`/`--tier` filtered run therefore finds no
   prior rows for untouched probes and rewrites them all to `(not run)`, wiping
   the scoreboard for every probe the filter did not match.

Both defects are fixed by one small refactor: capture the original file content
first, build the full document into a temp file, then replace it with a single
atomic `mv`.

## Goals

- Make every `RESULTS.md` write atomic: a reader sees either the complete old
  file or the complete new file, never a partial one.
- Fix filtered-run carry-forward so `--probe`/`--tier` runs preserve untouched
  probes' rows instead of resetting them to `(not run)`.
- Guarantee no orphan temp file survives a crash.
- Preserve full-run output byte-for-byte (no behavioral regression).
- Add a Tier-A probe that locks in the atomic-write invariant against regression.

## User Stories

### US-001: Atomic temp-file write + carry-forward fix in run.sh

**Description:** As the autopilot eval gate, I want `RESULTS.md` rewritten
atomically from a temp file and carry-forward rows read from the pre-write
content, so that a crash or concurrent run never leaves a partial scoreboard and
a filtered run never erases untouched rows.

**Acceptance Criteria:**

- [ ] Before the write block, `run.sh` captures the original `RESULTS.md` content
      once into a shell variable using exactly this `set -e`-safe idiom (or an
      equivalent that cannot abort on a missing file):
      `RESULTS_ORIG=""; [ -f "$RESULTS" ] && RESULTS_ORIG="$(cat "$RESULTS")"`.
- [ ] `prior_row()` / `prior_status()` resolve carry-forward rows from the captured
      `RESULTS_ORIG` snapshot (e.g. `grep ... <<<"$RESULTS_ORIG"`), NOT by reading
      the live `$RESULTS`. Every `grep` over the snapshot keeps a trailing `|| true`
      so a no-match (grep exit 1) cannot abort the script under `set -euo pipefail`.
      Verify: `prior_row()`'s body contains no live `grep ... "$RESULTS"` /
      `[ -f "$RESULTS" ]` read after the capture.
- [ ] `tmp` is initialized to empty (`tmp=""`) BEFORE the `--ablate` guard, and the
      EXIT trap is the guarded form `trap '[ -n "$tmp" ] && rm -f "$tmp"' EXIT` so it
      is harmless on the ablation `exec` path (run.sh:49) where the write block is
      never reached. The real temp path `tmp="$RESULTS.tmp.$$"` (a SIBLING of
      `$RESULTS` in `evals/`, never a `/tmp/` path — required for atomic `rename(2)`)
      is assigned at the start of the write block.
- [ ] The header heredoc and every per-probe row append write to `$tmp`, not
      `$RESULTS`. The file is replaced in one step with `mv -f "$tmp" "$RESULTS"`
      after all rows and the trailing benchmark comment are written; there is no
      bare `cat > "$RESULTS"` truncation anywhere in the script.
- [ ] **Structural equivalence (not literal bytes):** a full run
      (`bash .claude/skills/eval/run.sh`, no filter) produces a `RESULTS.md` that is
      identical to a pre-change full run EXCEPT for the per-run `last-run (UTC)`
      timestamp column: same header text, same row set and order (probe glob/filename
      order), same trailing benchmark comment line, same regressions-to-stdout
      summary, and the same exit code (0 normally, 1 on a green→red regression — PR
      #32 semantics preserved). Check by diffing the two outputs with the timestamp
      column masked.
- [ ] The `if [ "${#regressions[@]}" -gt 0 ]; then exit 1; fi` exit-1-on-regression
      block remains within the LAST 12 LINES of `run.sh` (the existing
      `evals/probes/eval-runner-exit.sh` probe asserts this via `tail -n 12`); if the
      refactor would push it out of that window, `eval-runner-exit.sh` must be updated
      in the same story so it does not falsely REGRESSION.
- [ ] A filtered run (e.g. `bash .claude/skills/eval/run.sh --probe <id>`) leaves
      every other probe's row intact (carrying its prior status/timestamp from
      `RESULTS_ORIG`), not reset to `(not run)`.
- [ ] `bash -n .claude/skills/eval/run.sh` passes; the existing `scripts/__tests__`
      vitest suite stays green.

### US-002: Tier-A probe locking in the atomic-write invariant

**Description:** As the harness fitness suite, I want a probe that fails if the
non-atomic write pattern is reintroduced, so the fix cannot silently regress.

**Acceptance Criteria:**

- [ ] New file `evals/probes/eval-results-atomic.sh`, executable, with headers
      `# tier: A`, `# source: issue #83 (eval-results-atomic-write)`, and a `# desc:`
      that notes this is a STATIC-pattern probe coupled to `run.sh`'s
      implementation tokens (a deliberate refactor must update it) — matching the
      header style of `evals/probes/eval-runner-exit.sh`.
- [ ] The probe statically asserts against `.claude/skills/eval/run.sh`: (a) no bare
      `cat > "$RESULTS"` truncation pattern present, (b) `mv -f "$tmp" "$RESULTS"`
      (or `mv -f ... "$RESULTS"`) present for the final replacement, (c) a `trap ...
      EXIT` referencing the temp file present, (d) the `prior_row()` function body
      contains no live `grep ... "$RESULTS"` read (carry-forward reads the snapshot).
- [ ] Probe exit-code oracle honored: exit 0 = PASS (all four invariants hold),
      exit 1 = REGRESSION (a violation found, the failing invariant named on stderr),
      exit 2 = SKIPPED (run.sh absent).
- [ ] **Behavioral check:** the probe exits 0 against the US-001-refactored
      `run.sh`, and exits 1 when the `cat > "$RESULTS"` truncation token is
      re-introduced (demonstrable by pointing the probe at a doctored copy).
- [ ] On the first full/filtered run that includes it, the new probe's own row
      appears as `PASS` (not `(not run)`) and all other probe rows are preserved
      (integration test of the US-001 carry-forward fix).

### US-003: Doc + CHANGELOG updates for the atomic-write semantics

**Description:** As a maintainer reading the eval docs, I want the write-semantics
prose to describe the atomic temp-rename pattern, so the docs match the code.

**Acceptance Criteria:**

- [ ] `evals/README.md` and `.claude/skills/eval/SKILL.md` describe the RESULTS.md
      write as "build into a temp file, replace atomically with `mv -f`"; no surviving
      prose says "truncate then append" (or equivalent) for that write.
- [ ] The `SKILL.md` carry-forward description (step covering "carry prior rows for
      probes not run this invocation") states that carry-forward reads the pre-write
      snapshot (`RESULTS_ORIG`), not the live file.
- [ ] No behavioral spec in those docs changes — the exit-code oracle, the pass-rate
      formula, and the overwrite-row-per-probe policy keep their current wording
      intent (manual review item; no probe enforces this).
- [ ] `CHANGELOG.md` gains one entry under `### Fixed` in the `## [Unreleased]`
      section, imperative mood, linking issue #83.
- [ ] No other CHANGELOG sections are modified.

## Functional Requirements

- FR-1: `run.sh` MUST capture the pre-write `RESULTS.md` content once and resolve
  all carry-forward lookups from that snapshot.
- FR-2: `run.sh` MUST write the new scoreboard to a temp file and replace the
  target with a single `mv -f`.
- FR-3: `run.sh` MUST install an `EXIT` trap that removes the temp file.
- FR-4: A full (unfiltered) run MUST produce structurally byte-identical output to
  the pre-change runner, including exit codes.
- FR-5: `evals/probes/eval-results-atomic.sh` MUST encode the atomic-write invariant
  as a 3-state (0/1/2) probe.
- FR-6: Docs and CHANGELOG MUST reflect the change.

## Non-Goals (Out of Scope)

- No file-locking mechanism beyond atomic rename (no `flock`, no lockfile mutex).
  Two concurrent full runs may each snapshot the same prior `RESULTS.md` and each
  `mv` a complete scoreboard — last-write-wins, and crucially **no partial file is
  ever visible**. This residual snapshot race is acceptable for a single-developer
  harness (`context/USER.md`); eliminating it is explicitly out of scope.
- No changes to `scripts/ablate.sh` or the ablation code path. The `--ablate`
  `exec` branch (run.sh:49) returns before the scoreboard-write block; the EXIT
  trap and temp/`mv` mechanics apply ONLY to the scoreboard-write path.
- No Tier-B behavioral evals.
- No changes to probe exit-code semantics, the pass-rate formula, or the
  overwrite-row-per-probe policy.
- No sandbox application code.

## Technical Considerations

- `mv` within the same directory (`evals/`) is an atomic `rename(2)` on the repo's
  filesystem — the basis for the atomicity guarantee.
- Mirror the crash-hygiene precedent already in `run.sh`: the `.ablation-active`
  sentinel recovery (lines 26–37) shows the established temp/trap idiom.
- `run.sh` uses `set -euo pipefail`; the original-content capture must not trip
  `set -e` when the file is absent (guard with `[ -f ]` / `|| true`).
- The carry-forward currently reads the live file via `grep`; switching to grep
  over a captured variable (`grep ... <<<"$RESULTS_ORIG"` or a temp snapshot) keeps
  behavior identical for un-run probes.

## Success Metrics

- A simulated mid-write interruption never leaves `RESULTS.md` shorter than its
  header + first row (atomic replace holds).
- A `--probe`/`--tier` run preserves all untouched rows (0 rows wrongly reset to
  `(not run)`).
- `eval-results-atomic` probe is PASS on the scoreboard; full-suite runner exit 0
  (a pre-existing `next-dev-prod` red is acceptable per the documented eval-gate
  rule).

## Open Questions

- None — scope and approach are fully specified by the implementation plan.

## Critic synthesis (pre-/ralph gate)

Two critics (implementer + user lens) reviewed this PRD before the issue/branch
were committed; full output in `critique.md`. They raised **3 high**, **6 medium**,
**5 low** findings and **no protected-path violations**. All three high findings
were AC-precision issues (not design flaws), and each has been mitigated by
tightening US-001's acceptance criteria in place: the exact `set -e`-safe capture
idiom, `|| true` on every snapshot `grep`, `tmp=""`-before-`--ablate` + a guarded
EXIT trap, "structurally equivalent (timestamp-masked)" replacing "byte-identical",
the sibling-path requirement for atomic `rename(2)`, and the
`eval-runner-exit.sh` `tail -n 12` window constraint. Medium/low findings on probe
brittleness, the residual concurrency race, and doc carry-forward prose were folded
into US-002/US-003 and the Non-Goals. **Recommendation: PROCEED.**
