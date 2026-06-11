# PRD: Harden Autopilot Branch-Restore

## Introduction

The autopilot self-improvement loop restores the working branch to
`development` at the end of every run via a bare `git checkout development`.
This bare checkout has no guard against a dirty working tree. If a `/delegate`
wave crashes (or a worker is cut off mid-edit) and leaves uncommitted changes to
*tracked* files, `git checkout development` either refuses (conflicting local
changes) or silently carries the dirty state onto `development`. The next hourly
fire then trips the §1 pre-flight guard
(`git diff --quiet && git diff --cached --quiet || exit 1`;
`[ "$BRANCH" = "development" ] || exit 1`) and logs `Result: FAIL` — **every
hour, forever, until a human manually cleans the tree.** A single transient
failure becomes a total outage of the self-improvement engine.

This PRD replaces the bare checkout with a single canonical "clean restore to
development" procedure used at all three restore sites in
`.claude/skills/autopilot/SKILL.md`. Committed work (the draft PR's commits) is
preserved on the feature branch; only throwaway uncommitted residue is
discarded. The change is confined to the autopilot skill plus one new eval probe
that guards the fix.

## Goals

- Guarantee that every autopilot exit path which changed the working branch
  returns to a clean `development`, even when the prior step left uncommitted
  (staged or unstaged) tracked changes — so a bad run that *reaches* a restore
  site can never jam the hourly loop.
- Close the adjacent jam vector: a run interrupted *before* a restore site is
  reached can strand HEAD on a clean feature branch; the §1 pre-flight gains a
  narrow self-heal so a clean-but-stranded branch recovers itself.
- Preserve all committed work AND any human work-in-progress: discard only the
  autopilot run's own uncommitted residue; never auto-clean a *dirty* tree at §1
  (that still hard-FAILs, since it could be a human's uncommitted work).
- Keep the §6 eval-gate decision-rule vocabulary byte-stable so
  `evals/probes/eval-gate.sh` does not regress.
- Add a regression probe that fails if the hardened restore is ever reverted.
- Stay harness-infra only: changes confined to
  `.claude/skills/autopilot/SKILL.md` and `evals/probes/clean-restore.sh`.

## User Stories

### US-001: Define the canonical clean-restore procedure

**Description:** As the autopilot loop, I need one documented restore procedure
so all three restore sites behave identically and a failed restore is loud, not
silent.

**Acceptance Criteria:**

- [ ] The Guidelines "Branch restore" bullet (currently line ~307 of
      `.claude/skills/autopilot/SKILL.md`) is updated to define the canonical
      procedure: `git checkout -f development` followed by a post-restore
      assertion that mirrors the §1 guard exactly —
      `git diff --quiet && git diff --cached --quiet || { echo "ERROR: autopilot restore left a dirty tree"; exit 1; }`.
- [ ] The bullet states that committed work is preserved (it lives on the
      feature branch / draft PR) and only the run's own uncommitted tracked
      residue (staged AND unstaged) is discarded by the force checkout.
- [ ] The bullet remains a single, copy-verbatim canonical reference for §5/§6/§7.

### US-002: Apply the canonical restore at §5 (DELEGATE-FAIL)

**Description:** As the autopilot loop, when `/delegate` fails I must return to a
clean `development` so the next fire is not blocked.

**Acceptance Criteria:**

- [ ] The bare `git checkout development` at §5 DELEGATE-FAIL (line ~217) is
      replaced with the canonical two-step (`git checkout -f development` +
      post-restore assertion).
- [ ] No bare (no `-f`) `git checkout development` remains in §5.
- [ ] The DELEGATE-FAIL exit semantics (memory log, liveness token, keep-marker
      touch, non-zero exit) are unchanged apart from the restore command.

### US-003: Apply the canonical restore at §6 (PR-DRAFT-EVAL-RED) without vocabulary drift

**Description:** As the autopilot loop, when the eval gate keeps a PR draft I
must restore cleanly while leaving the eval-gate vocabulary intact.

**Acceptance Criteria:**

- [ ] The inline `git checkout development` in the §6 PR-DRAFT-EVAL-RED path
      (line ~242) is replaced with the canonical restore.
- [ ] The §6 eval-gate decision-rule vocabulary — the strings
      `NEW (green→red)`, `runner non-zero exit` / `non-zero runner exit`,
      `delta`, and `unchanged` — is byte-stable (unchanged).
- [ ] `bash evals/probes/eval-gate.sh` exits 0 after the change.

### US-004: Apply the canonical restore at §7 (Finalize)

**Description:** As the autopilot loop, on the success/finalize path I must
restore cleanly so the next fire's §1 guard passes.

**Acceptance Criteria:**

- [ ] The `git checkout development` code block at §7 Finalize (line ~271–273)
      is replaced with the canonical restore (force checkout + post-restore
      assertion).
- [ ] After this story, `grep -nE 'git checkout development([^ ]|$)' .claude/skills/autopilot/SKILL.md`
      returns zero hits for the bare form (every restore site uses `-f`); only
      the canonical `git checkout -f development` form remains.

### US-005: Add a regression probe for the hardened restore

**Description:** As a maintainer, I want a probe that fails if any restore site
loses the force flag or the assertion, so the fix cannot silently regress.

**Acceptance Criteria:**

- [ ] New file `evals/probes/clean-restore.sh` follows the 3-state oracle
      convention used by the existing probes: exit `0` = PASS, `1` = REGRESSION
      (with a `REGRESSION:`-prefixed reason on stderr), `2` = SKIPPED (with a
      reason) when `.claude/skills/autopilot/SKILL.md` is absent.
- [ ] The probe asserts that `git checkout -f development` appears at least three
      times in the skill file AND that the post-restore assertion substring
      (`restore left a dirty tree`) is present.
- [ ] The probe's robust negative check: every line containing
      `git checkout` and `development` must also contain `-f development` — i.e.
      `grep` for `git checkout` + `development` lines, filter out
      `git checkout -f development`, and assert the remainder is empty. This
      catches a reverted bare `git checkout development` regardless of trailing
      characters or comments.
- [ ] `bash evals/probes/clean-restore.sh; echo "exit=$?"` prints `exit=0`
      against the post-change skill file; removing `-f` from any restore site
      makes it exit `1`.
- [ ] The probe file is executable (`chmod +x`) and uses `set -euo pipefail`.

### US-006: Self-heal a clean-but-stranded branch at §1 pre-flight

**Description:** As the autopilot loop, if a prior run was interrupted *before*
it reached a restore site and left HEAD on a clean feature branch, I must
recover to `development` myself rather than FAIL every hour.

**Acceptance Criteria:**

- [ ] The §1 pre-flight in `.claude/skills/autopilot/SKILL.md` gains a self-heal
      step BEFORE the existing hard guards: if the current branch is not
      `development` AND the tree is clean
      (`git diff --quiet && git diff --cached --quiet`), run
      `git checkout -f development` to recover, then re-derive `BRANCH`.
- [ ] The existing hard guards are PRESERVED and run after the self-heal: a
      *dirty* tree still hard-FAILs (it may be a human's uncommitted work — never
      auto-discarded at §1), and a still-non-`development` branch still hard-FAILs.
- [ ] The self-heal only runs when there is nothing to lose (clean tree), so it
      cannot discard human work.
- [ ] The self-heal's checkout uses the `-f development` form (consistent with
      the canonical restore and the US-005 probe invariant).

## Functional Requirements

- FR-1: Define a single canonical clean-restore procedure in the autopilot
  skill's Guidelines section: `git checkout -f development` then
  `git diff --quiet && git diff --cached --quiet || { echo "ERROR: autopilot restore left a dirty tree"; exit 1; }`
  (the assertion mirrors the §1 guard exactly).
- FR-2: Replace the bare `git checkout development` at §5, §6, and §7 with that
  canonical procedure.
- FR-3: Preserve the §6 eval-gate vocabulary byte-for-byte.
- FR-4: Add `evals/probes/clean-restore.sh` as a 3-state regression probe for
  the fix.
- FR-5: Introduce no new `git clean`/`git reset --hard` that could delete
  committed work; the force checkout discards only uncommitted tracked changes
  (experiment-confirmed to clear both the staged index and the working tree).
- FR-6: Add a §1 pre-flight self-heal that recovers a clean-but-stranded branch
  (not `development`, tree clean) via `git checkout -f development`, while
  preserving the existing hard FAIL on a dirty tree or a still-wrong branch.

## Non-Goals

- No change to the §1 hard-FAIL behavior on a *dirty* tree — that is preserved
  (it may be a human's uncommitted work, which must never be auto-discarded). The
  only §1 addition is the narrow clean-but-stranded-branch self-heal (US-006).
- No changes to any other skill, rule, doc, script, or cron.
- No change to autopilot's selection logic, caps, eval-gate decision rule, or
  session lifecycle beyond the restore command and the §1 self-heal.
- No editing of `evals/RESULTS.md` by hand (it is regenerated by `/eval`).
- No `git clean -fd` (untracked residue does not trip the §1 guard, so removing
  it is out of scope and risks deleting unrelated scratch files).

## Technical Considerations

- `git checkout -f development` discards uncommitted modifications to tracked
  files — **both the staged index and the working tree** (experiment-confirmed:
  a tree with `MM`-staged + unstaged changes ends with both `git diff --quiet`
  and `git diff --cached --quiet` clean after `-f`) — and switches branches;
  committed work on the feature branch is untouched and remains reachable via the
  draft PR.
- The post-restore assertion `git diff --quiet && git diff --cached --quiet`
  mirrors the §1 guard exactly, so "assertion passes" ≡ "the next fire's §1 guard
  will pass." On the rare failure it logs a distinct error and exits non-zero,
  making a stuck loop diagnosable rather than silent.
- **Residual risk (documented, accepted):** `git checkout -f` does NOT remove
  *untracked* files. Untracked residue does not trip the §1 guard, so it does not
  jam the loop; the only edge case is an untracked file sitting where
  `development` has a tracked file, which `-f` overwrites — still non-jamming.
- **Recovery note:** the force checkout discards uncommitted state that is not in
  the reflog. This is safe for autopilot because it only ever runs on its own
  feature branches/runs; the §1 self-heal additionally refuses to auto-discard a
  *dirty* tree, so a human's uncommitted work in the orchestrator checkout is
  never silently lost (it hard-FAILs and surfaces instead).
- `development` is assumed to exist locally (it always does in this repo, being
  the base branch); if it were absent, `git checkout -f development` would fail
  and the assertion would surface a non-zero exit.
- `evals/probes/eval-gate.sh` greps §6 for the decision-rule vocabulary; edits
  in §6 must touch only the `git checkout development` token.
- Probe convention reference: existing probes under `evals/probes/`
  (`eval-runner-exit.sh`, `eval-gate.sh`) use exit codes `0`/`1`/`2` and write
  reasons to stderr.

## Success Metrics

- A simulated dirty-tree DELEGATE-FAIL no longer leaves the loop unable to start
  the next run (the restore returns to a clean `development`).
- `bash evals/probes/clean-restore.sh` exits 0; `bash evals/probes/eval-gate.sh`
  exits 0; `/eval` reports no new green→red regression.

## Open Questions

- None — the plan at `/tmp/ship-plan-45.md` and the pm decomposition resolved the
  scope. The force-checkout (vs `git reset --hard` + checkout) was chosen as the
  minimal single-command form.

## Critic Synthesis (Stage 4 — PROCEED)

Two critics reviewed this PRD (implementer + user lens); full output in
`critique.md`. Result: **PROCEED**, no unmitigated high-severity finding.

- 2 high-severity findings: the staged-index assertion gap (A-H1) is **adopted**
  (assertion now mirrors §1 with `--cached`); the "staged index survives
  `git checkout -f`" claim (A-H2) was **refuted by a scratch-repo experiment**
  (`-f` clears both index and working tree), so no `git reset --hard` is needed.
- 5 medium-severity findings adopted as spec revisions: the clean-but-stranded
  branch self-heal (new US-006), the robust probe negative-check (US-005),
  serialized SKILL.md edits to avoid parallel-worker conflicts, the scoped §6
  single-token edit, and documented residual risks (untracked files, recovery,
  branch-absent) in Technical Considerations.
- No protected-path violation: `.claude/skills/autopilot/SKILL.md` is edited, not
  deleted, and is not listed in `.claude/protected-paths.txt`.
