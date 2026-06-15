# PRD: Scope autopilot §1 guard + restore paths to owned harness surface

> Revised post-critique (2026-06-12). The 2-critic gate caught a HIGH correctness
> bug — a content-only scoped restore that does not switch HEAD would re-create the
> exact infinite-FAIL loop this PRD prevents. The restore is now mandated as a
> two-step (switch HEAD **then** scope-restore owned paths) with a HEAD assertion.
> All HIGH/MEDIUM findings are mitigated at the AC level; see `critique.md`.

## Introduction

The autopilot loop runs every hour inside the single shared checkout
(`/home/sandbox/harness`). Its §1 pre-flight **clean-state guard**
(`.claude/skills/autopilot/SKILL.md`) asserts that the **entire** working tree
is clean (`git diff --quiet && git diff --cached --quiet || { echo "ERROR:
dirty working tree"; exit 1; }`) and hard-FAILs otherwise. Because the tree is
shared, **any** stray local or human edit — even on a file autopilot will never
touch (e.g. a one-line `.codex/config.toml` change) — silently FAILs every
subsequent hourly fire until a human manually cleans the tree. Symmetrically,
the restore path (`git checkout -f development` + a post-restore assertion) is
tree-wide and **destructive**: were a run to proceed with a stray foreign edit
present, the force checkout would revert it, destroying human WIP.

This feature **decouples autopilot's clean-state requirement from the human's
checkout** by scoping both the §1 guard and the restore to the harness-infra
surface autopilot actually mutates ("owned paths"). A stray edit outside that
surface no longer blocks a run, and the restore never clobbers it.

## Goals

- A stray dirty file **outside** the owned surface no longer FAILs §1; the run
  proceeds to selection.¹
- Autopilot still cannot proceed on a genuinely dirty **own** state, and the
  restore **never destroys** foreign (non-owned) WIP.
- A §1 block on a dirty owned surface emits a **distinct, heartbeat-visible**
  liveness token (`BLOCKED-OWNED-WIP`) instead of bare `FAIL`.
- The run's own owned-path residue is still force-discarded on restore **and HEAD
  is returned to `development`**, so the next fire's §1 guard (both the clean
  check and the branch check) passes — preserving the 2026-06-11
  branch-restore-guard lesson, PR #45.
- An `/eval` probe guards the new behavior; the existing `clean-restore` probe
  is rewritten in lockstep so the board stays green; CI green.

> ¹ This goal holds when HEAD is on `development` (the normal pre-flight state).
> The rare **stranded-branch + foreign-dirty** double-fault (HEAD left on a
> feature branch AND a foreign dirty file present) remains a FAIL: the §1
> self-heal needs a fully-clean tree to safely force-checkout, so it cannot fire,
> and the branch check then fails. This is **non-destructive** (foreign WIP is
> preserved) and is an accepted edge case, not a regression.

## User Stories

### US-001: Define the owned-surface constant

**Description:** As the autopilot skill, I need a single canonical list of the
paths I mutate so the §1 guard and the restore can both reference it.

**Acceptance Criteria:**

- [ ] §1 defines a single `OWNED_PATHS` shell variable exactly once, near the
      top of the section, before the clean-state check uses it.
- [ ] `OWNED_PATHS` enumerates exactly: `.claude/ context/ docs/ scripts/
      crons/ wiki/ evals/ memory/ tasks/ CHANGELOG.md` (no paths outside this
      set; all paths in this set present).
- [ ] `grep -n 'OWNED_PATHS=' .claude/skills/autopilot/SKILL.md` returns exactly
      one definition line.
- [ ] **Unquoted-usage (load-bearing):** every use passes `$OWNED_PATHS`
      **unquoted** (bare `-- $OWNED_PATHS`) so word-splitting expands it to
      multiple pathspec arguments; quoting (`"$OWNED_PATHS"`) would collapse it to
      one pathspec that matches nothing and make the check vacuously pass. A
      `# NOTE:` comment in the skill warns against quoting.
- [ ] **Write-surface cross-check:** every tracked path autopilot writes in
      §2–§7 is either (a) within `OWNED_PATHS`, (b) committed by Ralph on the
      feature branch, or (c) under `/tmp`. The PRD/skill notes this so the owned
      surface is known-complete (`tasks/` and `evals/` and `memory/` are the
      autopilot-written tracked dirs; all are in the set).
- [ ] Markdown/shell fences remain well-formed (the skill still renders).

### US-002: Scope the §1 clean-state check to the owned surface

**Description:** As the autopilot skill, I want my §1 dirty-tree check to inspect
only owned paths so a stray edit elsewhere does not block me.

**Acceptance Criteria:**

- [ ] The tree-wide clean assertion that emits `ERROR: dirty working tree` (the
      MAIN §1 check) is replaced with path-scoped forms: `git diff --quiet --
      $OWNED_PATHS && git diff --cached --quiet -- $OWNED_PATHS`.
- [ ] Repro passes: with an unrelated `.codex/config.toml` edit staged, the §1
      MAIN check evaluates clean (does not take the FAIL/exit branch).
- [ ] **Self-heal predicate divergence is documented.** The §1 self-heal
      stranded-branch block (`if [ "$BRANCH" != "development" ] && git diff
      --quiet …`) is **intentionally left tree-wide** and is NOT scoped. A
      `# NOTE:` in the skill states: the self-heal and the MAIN check are now
      *different* predicates; the self-heal force-checks-out only when the
      **whole** tree is clean, so it can never fire while foreign WIP is present
      — therefore it never destroys foreign WIP. (Scoping the self-heal guard
      without also scoping its `-f` checkout would let it clobber foreign files,
      so it is deliberately left whole-tree.)
- [ ] No tree-wide `git diff --quiet` (without a `--` path argument) remains in
      the §1 **MAIN owned-surface check** (the self-heal conditional on the
      `if [ "$BRANCH" != "development" ]` line is exempt and must remain).

### US-003: Distinct liveness token on a genuine owned-surface block

**Description:** As an operator watching the heartbeat, I want a dirty-owned-state
block to be visibly distinct from a generic failure so a stall is not mistaken
for idleness.

**Acceptance Criteria:**

- [ ] When §1 finds the **owned** surface dirty, the run does not proceed and
      emits the liveness token `BLOCKED-OWNED-WIP` to `crons/.cron.log` and the
      memory log `Result:` field — not bare `FAIL`.
- [ ] A stray edit **outside** the owned surface never reaches this block (it is
      covered by US-002 and proceeds normally).
- [ ] The string `BLOCKED-OWNED-WIP` appears in the §1 failure path of
      `.claude/skills/autopilot/SKILL.md`.
- [ ] The `.cron.log` liveness append is guarded so a missing/unwritable log does
      not crash the skill (e.g. `>> crons/.cron.log 2>/dev/null || true`, matching
      the existing liveness convention).

### US-004: Non-destructive restore scoped to owned paths

**Description:** As the autopilot skill, I want my restore to clean only my own
owned-path residue, return HEAD to development, and leave foreign WIP untouched.
**(Highest-risk story — the critic gate's HIGH finding lives here.)**

**Acceptance Criteria:**

- [ ] Every restore site that used tree-wide `git checkout -f development` (the
      §7 finalize code block, the §5 RALPH-INCOMPLETE prose, the §6
      PR-DRAFT-EVAL-RED prose, and the Guidelines "canonical clean restore"
      prose) is replaced with the **canonical scoped restore**, a two-step that
      switches HEAD **and** force-discards only owned-path residue:
      ```bash
      git checkout development -- $OWNED_PATHS    # discard run's OWN owned-path residue (index+worktree)
      git checkout development                    # switch HEAD; foreign WIP carries over (branch-identical → no conflict)
      git diff --quiet -- $OWNED_PATHS && git diff --cached --quiet -- $OWNED_PATHS \
        || { echo "ERROR: autopilot restore left a dirty owned tree"; exit 1; }
      [ "$(git rev-parse --abbrev-ref HEAD)" = "development" ] \
        || { echo "ERROR: autopilot restore left HEAD off development"; exit 1; }
      ```
      The scope-restore MUST precede the branch switch (it clears the residue that
      would otherwise block a non-forced `git checkout development`).
- [ ] The `git restore --source=…` content-only alternative is **NOT** used (it
      does not switch HEAD).
- [ ] The post-restore assertion verifies **both** that owned paths are clean
      **and** that `HEAD == development`.
- [ ] After the change, `grep -c 'git checkout -f development'
      .claude/skills/autopilot/SKILL.md` returns **exactly 1** (only the §1
      self-heal retains the forced tree-wide form).
- [ ] A stray foreign file (`.codex/config.toml`), whether modified-only or
      **staged**, present before the run survives the restore byte-for-byte (its
      working-tree content is unchanged; a staged foreign change is left staged
      and is correctly ignored by the scoped post-restore assertion and the next
      §1 scoped check).
- [ ] No `git add -A` / `git add .` remains in the skill that could stage a
      foreign file; any such staging is path-scoped.
- [ ] **Known accepted trade-off (documented, not fixed):** the scoped restore
      only touches tracked files, so an *untracked* orphan under an owned path
      (e.g. a partially-written `tasks/<slug>/` from a mid-run crash) is not
      auto-removed. `git clean` is deliberately NOT added (it would be destructive
      across `tasks/`, `memory/`, `.claude/`); such orphans are cleaned manually.

### US-005: Add BLOCKED-OWNED-WIP to the status-token table and §8 log enum

**Description:** As a maintainer reading the skill, I want the new token
documented alongside the others.

**Acceptance Criteria:**

- [ ] A `BLOCKED-OWNED-WIP` row is added to the `### Status tokens` table with an
      accurate one-line description (dirty owned surface; run skipped until the
      owned surface is clean; non-destructive to foreign WIP).
- [ ] `BLOCKED-OWNED-WIP` is added to the §8 memory-log `Result:` enumeration.

### US-006: Rewrite evals/probes/clean-restore.sh in lockstep

**Description:** As the eval suite, I must assert the **new** scoped-restore
invariant so the board does not green→red, while still encoding the original
"own residue must be force-discarded at every exit path" lesson.

**Acceptance Criteria:**

- [ ] `evals/probes/clean-restore.sh` no longer asserts `>= 3` occurrences of
      `git checkout -f development` nor "no bare `git checkout development`".
- [ ] It asserts the **canonical scoped restore** is present: a minimum count
      (**>= 3**) of the scoped restore form `git checkout development --
      $OWNED_PATHS`, AND the scoped post-restore assertion message `restore left a
      dirty owned tree`, AND the HEAD assertion `rev-parse --abbrev-ref HEAD`.
      (The >= 3 count preserves the "fires at every exit path" guarantee from
      PR #45 in scoped form.)
- [ ] It asserts **exactly 1** `git checkout -f development` remains, and that
      that single occurrence is the self-heal — distinguished by adjacent
      `BRANCH` / `rev-parse` context within a small window (so the self-heal is
      explicitly permitted and not double-counted as a restore site).
- [ ] The probe keeps its `tier: A` marker, updates `# desc:` and `# source:` to
      cite issue #63, and remains a 3-state oracle (exit 0/1/2).
- [ ] Probe exits 0 (PASS) against the updated SKILL.md and exits 1 (REGRESSION)
      against an unmodified SKILL.md (greps use exact literal patterns).

### US-007: Add evals/probes/owned-surface-guard.sh (new probe)

**Description:** As the eval suite, I want a probe that proves the §1 guard and
restore are scoped to owned paths.

**Acceptance Criteria:**

- [ ] New file `evals/probes/owned-surface-guard.sh`, `chmod +x`, `tier: A`,
      with a `# desc:` and `# source:` citing issue #63.
- [ ] Static assertions against `.claude/skills/autopilot/SKILL.md`, using
      **exact literal grep patterns** (no ambiguity; mirror `clean-restore.sh`):
      (a) the §1 MAIN clean check is path-scoped — `git diff --quiet --
      $OWNED_PATHS` is present and the MAIN check has no tree-wide
      `git diff --quiet` (the self-heal `if [ "$BRANCH" != "development" ]` line
      is exempt); (b) the `BLOCKED-OWNED-WIP` token is present; (c) the restore is
      scoped — `git checkout development -- $OWNED_PATHS` is present and the HEAD
      assertion `rev-parse --abbrev-ref HEAD` is present.
- [ ] 3-state oracle: exit 0 PASS, exit 1 REGRESSION, exit 2 SKIPPED (skill
      absent). Shape mirrors an existing probe (e.g. `clean-restore.sh`).
- [ ] Probe exits 0 against the updated SKILL.md **and exits 1 (REGRESSION)
      against an unmodified SKILL.md** (where the §1 check is still tree-wide and
      no `BLOCKED-OWNED-WIP` token is present) — the oracle is symmetric, matching
      US-006.

### US-008: Refresh evals/RESULTS.md

**Description:** As a reviewer, I want the benchmark to reflect the new and
rewritten probes, all green.

**Acceptance Criteria:**

- [ ] `evals/RESULTS.md` lists `owned-surface-guard` as green and the rewritten
      `clean-restore` as green.
- [ ] No previously-green probe is newly red as a result of this change.
- [ ] The file is regenerated by running the probe suite (`/eval`), not
      hand-faked. (Process constraint — a reviewer can re-run `/eval` to confirm.)

## Functional Requirements

- FR-1: Define `OWNED_PATHS = .claude/ context/ docs/ scripts/ crons/ wiki/
  evals/ memory/ tasks/ CHANGELOG.md` once in §1; use it unquoted everywhere.
- FR-2: Scope the §1 MAIN clean-state check to `$OWNED_PATHS`; leave the self-heal
  tree-wide and document the predicate divergence.
- FR-3: Emit `BLOCKED-OWNED-WIP` liveness + memory `Result:` (guarded append) when
  the owned surface is genuinely dirty; the run does not proceed.
- FR-4: Replace every tree-wide `git checkout -f development` restore with the
  canonical two-step scoped restore (switch HEAD + force-reset owned paths);
  assert owned-clean AND HEAD==development; leave foreign WIP byte-for-byte intact;
  exactly 1 `-f` occurrence (the self-heal) remains.
- FR-5: Add the `BLOCKED-OWNED-WIP` row to the status-token table and the §8
  `Result:` enumeration.
- FR-6: Rewrite `evals/probes/clean-restore.sh` to assert the scoped-restore
  invariant (>=3 scoped restores, HEAD assertion, exactly-1 self-heal `-f`;
  3-state oracle, tier A; symmetric exit 0/1).
- FR-7: Add `evals/probes/owned-surface-guard.sh` (exact-literal greps, symmetric
  3-state oracle, tier A).
- FR-8: Regenerate `evals/RESULTS.md` via `/eval`; all probes green.

## Non-Goals (Out of Scope)

- **Worktree-based isolation (Approach A).** Running each cycle in a dedicated
  `git worktree` would require changing the cron spawn cwd (the cron runtime) —
  forbidden by scope — and would break the §5 assumption that the working
  checkout already has `node_modules`. Explicitly out of scope.
- **Any change to `crons/autopilot.md` or `scripts/cron-runtime.ts`** (the cron
  runtime; both are protected paths).
- **Changes to any skill other than `autopilot`.**
- **Sandbox application code** of any kind.
- **Push/Slack/email notification for `BLOCKED-OWNED-WIP`.** Passive liveness
  (`.cron.log` + memory log) plus the existing heartbeat log-watch is sufficient
  for the single-developer context; a real-time alert channel is out of scope.
- **`git clean` of untracked owned-path orphans** — too destructive across the
  owned surface; orphans are cleaned manually (see US-004 trade-off).
- **Dynamic/gitignore-derived ownership** — the surface is a static literal
  enumeration in this iteration.

## Technical Considerations

- The change is localized to one skill file plus two probe files and the results
  benchmark. The restore surgery touches multiple sites in one file (one code
  block + three prose references + the Guidelines paragraph) — they must change
  consistently or the probes will flag the laggard.
- **Restore ordering is load-bearing:** `git checkout development -- $OWNED_PATHS`
  must run BEFORE `git checkout development`. The first clears the run's own
  owned-path residue (which would otherwise make a non-forced branch switch
  refuse); the second switches HEAD. Foreign (non-owned) files are identical
  across `feat/*` and `development` (no branch committed to them), so they carry
  over the switch without conflict and without `-f`.
- `git checkout <branch> -- <paths>` is inherently a forced restore for the named
  paths, preserving the original PR #45 "force-discard own residue" intent while
  bounding the blast radius to owned paths.
- The §1 self-heal stranded-branch block force-checks-out only when the
  **whole** tree is already clean, so it is safe and remains tree-wide; the probes
  distinguish it from the scoped restore sites by its `BRANCH`/`rev-parse`
  context.

## Success Metrics

- Reproduction: staging an unrelated `.codex/config.toml` edit and firing
  autopilot proceeds past §1 to selection (previously FAILed).
- A genuinely dirty owned file still blocks, now with `BLOCKED-OWNED-WIP`.
- A pre-existing foreign edit (modified or staged) is unchanged after a full
  run's restore, and HEAD is back on `development`.
- `evals/RESULTS.md` green; CI green.

## Open Questions

- Should the owned surface eventually be derived from a shared manifest rather
  than duplicated as a literal? (Deferred — static literal this iteration.)

---

_Critics ran pre-issue (implementer + user lens); 4 HIGH + 8 MEDIUM + 4 LOW
findings, all mitigated at the AC level above. Recommendation: PROCEED. See
`critique.md` for the full findings and mitigations._
