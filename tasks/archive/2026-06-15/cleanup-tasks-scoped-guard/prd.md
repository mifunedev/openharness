# PRD: Scope cleanup-tasks Pre-flight + Worktree-Isolate the Archive Sweep

## Introduction

The `cleanup-tasks` weekly cron (`crons/cleanup-tasks.md`, schedule `0 23 * * 0`)
is effectively dead. Its step-2 pre-flight aborts the **entire** weekly sweep
whenever a **tree-wide** `git status --porcelain` is non-empty. Because the
shared main checkout almost always carries foreign WIP (an in-flight
autopilot/Ralph feature branch, a concurrent session's edits), this guard aborts
the sweep nearly every run. Result: ~20 completed tasks have never been archived,
`tasks/` grows monotonically, and no weekly archive PR has been produced since
2026-05-25.

This change makes the readiness predicate scope to the surface the job actually
mutates (`tasks/`) and isolates the archive branch/commit work in a dedicated
git worktree, so unrelated foreign WIP can neither block the sweep nor leak into
the archive commit. It mirrors the autopilot loop's already-proven
`OWNED_PATHS`-scoped guard (PR #81/#82) and the worktree isolation convention in
`context/rules/git.md` § "Isolating in-flight work". Tracks #85. Harness-infra
only — no sandbox application code.

> **Critic-gate note:** this PRD was revised after a 2-critic review
> (`critique.md`) surfaced four HIGH robustness findings on the worktree flow
> (crash-leaked worktree, ungated teardown, same-day partial re-run, undocumented
> `.worktrees/archive/` path). All four are mitigated below at the AC level; the
> M/L clarifications (exclude pathspec, probe detection algorithm, PR-idempotency,
> heartbeat-unchanged) are folded in too.

## Goals

- Scope the step-2 pre-flight from a tree-wide check to
  `git status --porcelain -- tasks/ ':!tasks/archive/'` (the `tasks/` surface,
  excluding `tasks/archive/`), so foreign WIP outside `tasks/` no longer aborts
  the sweep.
- Emit a distinct `BLOCKED-TASKS-WIP` liveness token when `tasks/` itself is
  dirty, separable from the existing success (`OK (archived N, skipped M)`) and
  nothing-to-do (`HEARTBEAT_OK`) reporting.
- Isolate the `archive/$TODAY` branch creation, `git mv`, commit, and push inside
  a dedicated worktree (`.worktrees/archive/$TODAY`), crash-safe (prune stale
  first; `--force` teardown that runs even on the abort path).
- Guard the fix against regression with a green→red eval probe.
- Document the change in `CHANGELOG.md` and the new `archive/` worktree subfolder
  in `.worktrees/README.md`.

## User Stories

### US-001: Scope the pre-flight check to `tasks/` with a distinct liveness token

**Description:** As the harness operator, I want the cleanup-tasks pre-flight to
abort only when an in-flight task under `tasks/` is mid-write — not when
unrelated foreign WIP is present elsewhere — so the weekly sweep actually runs.

**Acceptance Criteria:**

- [ ] Step 2 of `crons/cleanup-tasks.md` replaces the bare tree-wide
      `git status --porcelain` with the path-scoped, archive-excluded form
      `git status --porcelain -- tasks/ ':!tasks/archive/'` (literal exclude
      pathspec, so an in-progress archive write under `tasks/archive/` does not
      self-flag the sweep as WIP).
- [ ] No bare unscoped `git status --porcelain` (with no pathspec) remains
      anywhere in `crons/cleanup-tasks.md`.
- [ ] When `tasks/` (excluding `tasks/archive/`) is dirty, the abort path emits
      the distinct liveness token `BLOCKED-TASKS-WIP` to `crons/.cron.log` and
      notes it in `memory/$TODAY/log.md`, distinct from the existing
      `OK (archived N, skipped M)` success token and the `HEARTBEAT_OK`
      nothing-to-do reply.
- [ ] Step-2 prose explains the scope: only a mid-write task under `tasks/`
      blocks the sweep; foreign WIP elsewhere is untouched and does not block —
      mirroring the autopilot `BLOCKED-OWNED-WIP` convention.

### US-002: Isolate the archive branch + commit work in a crash-safe worktree

**Description:** As the harness operator, I want the archive branch creation,
moves, commit, and push to happen in a dedicated git worktree so the shared
checkout's dirty state can neither block a branch switch nor leak into the
archive commit — and so a crashed run never strands a worktree that blocks future
sweeps.

**Acceptance Criteria:**

- [ ] **Stale-prune first:** before creating the worktree, steps 3–5 remove any
      stale archive worktree/branch from a prior failed run, e.g.
      `git worktree remove --force .worktrees/archive/$TODAY 2>/dev/null || true`
      then `git worktree prune`. This also makes a same-day re-run idempotent
      (tear-down-and-recreate, never reuse a possibly-dirty worktree).
- [ ] **Create:** the sweep creates a dedicated worktree at
      `.worktrees/archive/$TODAY` off `origin/$BASE`
      (`git worktree add .worktrees/archive/$TODAY -b archive/$TODAY origin/$BASE`).
      All git commands resolve paths from the repo root (absolute or
      repo-root-relative), not the cron's ambient cwd.
- [ ] **Operate in the worktree:** all `git mv` / `git add` / `git commit` /
      `git push` for the archive run **inside** the worktree path, not in the
      shared checkout. The sweep scans the worktree's checkout of `origin/$BASE`
      for `tasks/<taskdesc>/progress.txt` ending in `STATUS: COMPLETE` — i.e. it
      archives committed, merged-to-base tasks; uncommitted/foreign task dirs in
      the shared checkout are intentionally not visible and not archived. The
      `git mv` → `mv` + `git add` untracked fallback is preserved (rarely
      triggered, since the worktree checkout is clean).
- [ ] **Crash-safe teardown:** the worktree is removed with
      `git worktree remove --force .worktrees/archive/$TODAY` on completion, and
      the removal runs even on the abort/error path (e.g. a cleanup block /
      `trap ... EXIT`), so a failed push or PR step never strands the worktree.
- [ ] No `git switch -c "archive/$TODAY"` against the shared checkout remains in
      steps 3–5.
- [ ] The existing PR idempotency fallback is preserved: if `gh pr create`
      reports the PR already exists, capture its URL via `gh pr view --json url -q .url`.
- [ ] `.worktrees/README.md` gains an `archive/` row in the branch-worktree
      subfolder table (`archive/` → `archive/<YYYY-MM-DD>` — weekly cleanup-tasks
      archive sweeps), documenting the new convention.

### US-003: Add an eval probe guarding the scoped pre-flight + worktree isolation

**Description:** As the harness operator, I want a deterministic probe that fails
if the scoped guard or worktree isolation regresses, so the fix can't silently
revert to the tree-wide check.

**Acceptance Criteria:**

- [ ] New file `evals/probes/cleanup-tasks-scoped-guard.sh`, executable
      (`chmod +x`), modeled structurally on `evals/probes/owned-surface-guard.sh`,
      with `# tier:`, `# source: issue #85`, and `# desc:` header lines and
      `set -euo pipefail`.
- [ ] It is a 3-state oracle: PASS exit 0, REGRESSION exit 1, SKIPPED exit 2.
- [ ] SKIPPED (exit 2) when `crons/cleanup-tasks.md` is absent.
- [ ] REGRESSION (exit 1) when any of:
      (a) the scoped `git status --porcelain -- tasks/` is missing;
      (b) a **bare unscoped** `git status --porcelain` remains — detected by
      listing every `git status --porcelain` line and subtracting the
      pathspec-scoped ones (`grep -v -- '-- tasks/'`); any survivor fails;
      (c) the `BLOCKED-TASKS-WIP` token is missing;
      (d) `git worktree add` or `git worktree remove` is missing;
      (e) the old `git switch -c "archive/` shared-checkout pattern is still
      present (asymmetric assertion: new pattern present AND old pattern absent).
- [ ] PASS (exit 0) against the updated `crons/cleanup-tasks.md`.
- [ ] A `# NOTE:` comment records the known limitation that the probe is a static
      grep oracle over markdown, not a runtime execution test (guards text
      regressions, not shell-logic correctness) — same limitation as the
      `owned-surface-guard.sh` template.

### US-004: CHANGELOG entry

**Description:** As a reader of the changelog, I want a one-line record of this
fix under `## [Unreleased]`.

**Acceptance Criteria:**

- [ ] One bullet under `## [Unreleased]` → `### Fixed` (create the section if
      absent in `[Unreleased]`).
- [ ] The entry is an imperative one-liner describing the scoped pre-flight +
      worktree isolation and references issue #85.
- [ ] No duplicate entry — verify with `grep -c '#85' CHANGELOG.md` (and a
      `cleanup-tasks` scan) returning 0 before writing.

## Functional Requirements

- FR-1: Step 2 of `crons/cleanup-tasks.md` MUST use
  `git status --porcelain -- tasks/ ':!tasks/archive/'` and MUST NOT contain a
  bare `git status --porcelain` with no pathspec.
- FR-2: The pre-flight abort path MUST emit `BLOCKED-TASKS-WIP` when `tasks/`
  (excluding `tasks/archive/`) is dirty; the existing `OK (archived N, skipped M)`
  and `HEARTBEAT_OK` reporting tokens are unchanged.
- FR-3: Steps 3–5 MUST prune any stale archive worktree first, perform all
  archive git operations inside `.worktrees/archive/$TODAY`, and remove the
  worktree with `--force` on completion AND on the abort/error path.
- FR-4: `evals/probes/cleanup-tasks-scoped-guard.sh` MUST exist, be executable,
  and be a 3-state (0/1/2) oracle asserting FR-1–FR-3 against the cron body,
  including the asymmetric `git switch -c "archive/` ABSENT check.
- FR-5: `CHANGELOG.md` MUST gain a `### Fixed` `[Unreleased]` entry referencing
  #85; `.worktrees/README.md` MUST document the `archive/` subfolder.

## Non-Goals

- Retroactively archiving the ~20 already-completed tasks — the next
  correctly-scoped cron fire sweeps those that end in an exact `STATUS: COMPLETE`
  final line; a one-off manual sweep / format fix is an operator action (see
  Open Questions).
- The separate operational finding that `eval-weekly` has never fired (a
  runtime-restart issue, not a code change).
- Any sandbox application code.
- Changing the cron schedule, the `STATUS: COMPLETE` detection logic, or the
  PR-creation semantics beyond relocating them into the worktree.
- Updating `crons/heartbeat.md` token parsing — the heartbeat reads `.cron.log`
  liveness lines but does not pattern-classify the cleanup-tasks token; the new
  `BLOCKED-TASKS-WIP` line is additive and needs no heartbeat change.
- Orphaned-worktree recovery beyond the prune-first guard: a crash mid-run is
  tolerated and self-heals on the next run's stale-prune; the manual escape hatch
  is `git worktree remove --force .worktrees/archive/<date>` + `git worktree prune`.

## Technical Considerations

- Worktree convention is canonical in `context/rules/git.md` § "Isolating
  in-flight work" and § "Worktrees" (`.worktrees/<branch>` path, gitignored);
  the branch here is `archive/$TODAY`, so the worktree nests under an `archive/`
  subfolder, newly documented in `.worktrees/README.md`.
- The probe mirrors `evals/probes/owned-surface-guard.sh`: literal-string greps
  use `grep -F` for patterns with shell metacharacters; the bare-call check is a
  `grep … | grep -v -- '-- tasks/'` subtraction, not a lookahead.
- The worktree is checked out from `origin/$BASE`, so its `tasks/` reflects
  committed/merged state — this is why the scoped pre-flight's `tasks/` dirt check
  is about the *shared* checkout (don't archive a task someone is mid-writing),
  while the actual `git mv` operates on the *worktree's* clean origin checkout.
- `$BASE` is resolved per `context/rules/git.md` (`development` → `main` → `master`).
- The cron is on `.claude/protected-paths.txt` (MUST NOT delete); this change
  **modifies** it in place, which is permitted.

## Success Metrics

- The weekly sweep runs to completion when the only dirt is foreign WIP outside
  `tasks/` (no longer aborts on it).
- A crashed run leaves no stranded worktree that blocks the following run
  (stale-prune-first + `--force` teardown).
- `evals/probes/cleanup-tasks-scoped-guard.sh` is green against the updated cron
  and red if the scoped guard, the worktree isolation, or the `git switch -c`
  removal regresses.

## Open Questions

- Do all ~20 currently-stranded task dirs end in an exact `STATUS: COMPLETE`
  final non-empty line? If some have trailing output/timestamps, the next cron
  fire will skip them. Operator can confirm with
  `grep -rl 'STATUS: COMPLETE' tasks/*/progress.txt` and spot-check the tail;
  out of scope for this change (the cron's detection logic is unchanged).
