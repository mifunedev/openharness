# Ralph iteration — sync-upstream-20260619 (wave 1)

You are one iteration of a Ralph loop implementing the `sync-upstream-20260619`
task: importing four net-new upstream (mifunedev) PRs merged 2026-06-19 into our
fork (`origin`, ryaneggz) via cherry-pick. The full plan is in
`tasks/sync-upstream-20260619/prd.md`; the structured task list is in
`tasks/sync-upstream-20260619/prd.json`. The loop calls you again until
`progress.txt` contains a line `STATUS: COMPLETE`.

> **This task is mostly `git cherry-pick`, not free-form editing.** Read the
> per-story override notes below before treating it like a normal feature build.

## Your job in one iteration

Pick **one** user story (lowest `priority` with `passes: false`), implement it,
ensure it is committed, mark it `passes: true`, append a progress entry, then
exit. The next iteration handles the next story. One story per iteration.

## Steps every iteration

1. **Read context** — in this order:
   - `tasks/sync-upstream-20260619/prd.json` — find the lowest-`priority` story
     where `passes: false`. That is your story.
   - `tasks/sync-upstream-20260619/progress.txt` — the `## Codebase Patterns`
     section at the top (verified SHAs, pick commands, the exact CHANGELOG /
     RESULTS lines) and the most recent iterations.
   - `tasks/sync-upstream-20260619/prd.md` — mechanism + conflict policy.
   - `tasks/sync-upstream-20260619/critique.md` — the findings each story must satisfy.
   - `.claude/skills/git/SKILL.md` for branch + commit conventions.

2. **Verify branch / worktree** — branch is `task/sync-upstream-20260619` off
   `origin/development`, in the worktree `.worktrees/task/sync-upstream-20260619`.
   You are already `cd`'d there. `upstream` and `origin` remotes must both be
   present and fetched (the cherry-pick SHAs live on `upstream`):
   ```bash
   git fetch upstream development 2>/dev/null || true
   ```
   **Never push to `development` or `main`.**

3. **Implement the chosen story:**
   - **US-001 (single-parent pick):** `git cherry-pick -Xours a5cf486` — **no
     `-m`** (it has one parent). The pick creates its own commit; do not make a
     second commit.
   - **US-002..US-004 (merge-commit picks):** `git cherry-pick -m 1 -Xours <sha>`
     — **`-m 1` is REQUIRED** (these are merge commits). In `priority` order.
   - After the pick, run the story's empty-check **against the PR's own merge
     SHA** (NOT `upstream/development` — this is a partial-day sync, so the
     upstream tip carries deferred PRs' changes to the same files):
     `git diff HEAD <merge-sha> -- <payload paths>` must be **empty**. Then run
     the named `bash evals/probes/<p>.sh` assertions (US-003/US-004).
   - If the empty-check is non-empty or a probe REGRESSES, treat it as
     **BLOCKED** (do not mark `passes`), append a progress note, and stop — do
     **not** hand-patch around a `-Xours` drop.
   - **US-005 (reconcile):** edit exactly `CHANGELOG.md` (union-append the four
     lines from § Codebase Patterns under `[Unreleased]`, each in its source
     subsection) and `evals/RESULTS.md` (hand-insert the 2 new rows, status from
     the actual US-003/US-004 probe runs, alphabetical position). **Do NOT touch
     `wiki/README.md`** (no wave-1 PR adds a wiki entry). **Do NOT wholesale-regen
     RESULTS.md.** One commit.
   - **US-006 (finalize):** run the full-suite verification (prd.md § Verification),
     push the branch, open the PR to `ryaneggz/openharness:development`, poll CI.

4. **CHANGELOG override** — the normal "add a CHANGELOG entry in the same commit"
   rule does **NOT** apply to US-001..US-004: `-Xours` keeps origin's CHANGELOG
   during each pick, and all CHANGELOG/RESULTS reconciliation is deferred to the
   single US-005 commit. Do not add per-pick CHANGELOG entries.

5. **Commit** (US-005 only — picks self-commit; US-006 pushes/PRs) using
   `.claude/skills/git/SKILL.md` format:
   ```
   task: US-005 — reconcile CHANGELOG / RESULTS for 06-19 upstream sync (wave 1)

   Submitted-by: Pi
   ```
   The `Submitted-by:` trailer is mandatory (the model/agent that submits; this
   loop runs `--harness=pi`, so `Submitted-by: Pi`, unless a usage-limit fallback
   switched the harness — then name the active one via `$RALPH_HARNESS`).

6. **Update `prd.json`** — set `passes: true` for the completed story; set `notes`
   to a one-line summary including iteration number, date, and the cherry-pick/
   reconcile SHA.

7. **Append to `progress.txt`** (never replace):
   ```markdown
   ## US-00X — <YYYY-MM-DD HH:MM UTC>

   **Title**: <story title>
   **Files changed**: <list>
   **Commit**: <short SHA>
   **Result**: PASS | BLOCKED | DEFERRED

   ### What I did
   <2-4 sentences>

   ### Learnings for future iterations
   <patterns, gotchas>

   ---
   ```

8. **Codebase Patterns** — append any newly-discovered reusable pattern to the
   `## Codebase Patterns` section at the **top** of `progress.txt`.

9. **Stop condition** — after step 7, if all stories in `prd.json` now have
   `passes: true`, append a line on its own to `progress.txt`:
   ```
   STATUS: COMPLETE
   ```
   The runner reads this exact whole-line string in both `progress.txt` and your
   iteration output.

10. **Signal completion in your output only when terminal** — when (and only when)
    you have just appended `STATUS: COMPLETE` to `progress.txt`, also print
    `STATUS: COMPLETE` as the sole content of your final line. Never print that
    bare line for any other reason; in prose call it "the completion marker."

## Blocked or deferred stories

- **Blocked** (a `-Xours` payload drop, a probe REGRESSION, missing remote, a
  merge pick attempted without `-m 1`): append with `**Result**: BLOCKED` and an
  explanation; do NOT mark `passes: true`. Surface a contaminated pick rather than
  forcing it.
- **Deferred** (out of scope per prd.md § Out of scope — e.g. anyone asks you to
  pull #462/#454/#456/#458/#463): append with `**Result**: DEFERRED`; do NOT
  mark `passes: true`.

## Critical rules

- **One story per iteration.** Resist doing two.
- **Cherry-pick in `priority` order**: #452 → #446 → #448 → #450.
- **`-m 1` for #446/#448/#450 (merge commits); NO `-m` for #452 (single-parent).**
- **Empty-check against each PR's own merge SHA**, never `upstream/development`.
- **Never push** to `development` or `main`. Branch is `task/sync-upstream-20260619`.
- **Never skip pre-commit hooks** (`--no-verify`), never `git clone`/`git init`.
- **Confine writes** to repo-tracked paths; you are in the worktree, not the shared checkout.
- **Keep mifunedev issue links as-is** (#445/#447/#449/#451 are valid provenance).
- **Do NOT touch `wiki/README.md`** — no wave-1 PR adds a wiki entry.

## Reference

- PRD: `tasks/sync-upstream-20260619/prd.md`
- Structured stories: `tasks/sync-upstream-20260619/prd.json`
- Critique: `tasks/sync-upstream-20260619/critique.md`
- Branch: `task/sync-upstream-20260619` (off `origin/development`; no issue number)
- Worktree: `.worktrees/task/sync-upstream-20260619`
- SHAs (on `upstream`): #452 `a5cf486` (single-parent), #446 `5b8db4dd` (-m 1),
  #448 `35ced5f5` (-m 1), #450 `619d660d` (-m 1)
