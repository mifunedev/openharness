# Ralph iteration — add-sandbox-service-healthcheck

You are one iteration of a Ralph loop implementing the `add-sandbox-service-healthcheck` task. The full plan is in `tasks/add-sandbox-service-healthcheck/prd.md` and the structured task list is in `tasks/add-sandbox-service-healthcheck/prd.json`. The loop calls you again until `progress.txt` contains a line `STATUS: COMPLETE`.

## Your job in one iteration

Pick **one** user story, implement it, commit, mark it `passes: true`, and append a progress entry. Then exit. The next iteration handles the next story. Do not attempt multiple stories per iteration.

## Steps every iteration

1. **Read context** — in this order:
   - `tasks/add-sandbox-service-healthcheck/prd.json` — find the lowest-`priority` story where `passes: false`. That is your story for this iteration.
   - `tasks/add-sandbox-service-healthcheck/progress.txt` — read the "Codebase Patterns" section at the top (if any) and the most recent few iterations to see what's been done.
   - `tasks/add-sandbox-service-healthcheck/critique.md` — if present, the critic findings the stories must satisfy.
   - `.claude/rules/git.md` for branch + commit conventions.
   - `.claude/rules/sandbox-processes.md` for tmux session conventions if your story spawns processes.
   - `.claude/rules/advisor-model.md` for any critic-gated story.

2. **Verify branch** — your branch is `<prefix>/<N>-add-sandbox-service-healthcheck` (per `prd.json` `branchName`). If `/ship-spec`'s Advisor launched you in an isolated worktree at `.worktrees/<prefix>/<N>-add-sandbox-service-healthcheck`, that directory already has the branch checked out — `cd` into it and skip the checkout below. Otherwise, if you are not on the branch:
   ```bash
   git fetch origin
   git checkout -b <prefix>/<N>-add-sandbox-service-healthcheck origin/development 2>/dev/null \
     || git checkout <prefix>/<N>-add-sandbox-service-healthcheck
   ```
   Never push to `development` or `main` directly.

3. **Implement the chosen story** — make the file changes, additions, deletions specified in the story's `acceptanceCriteria`. Confine the work to that story; resist scope creep.

4. **Run quality checks** before commit:
   ```bash
   pnpm run type-check 2>/dev/null || true
   pnpm run lint 2>/dev/null || true
   pnpm run test 2>/dev/null || true
   ```
   If checks fail, fix them. Do not commit broken code.

5. **Commit** with this message format (per `.claude/rules/git.md`):
   ```
   <type>: US-150 — <story title>

   Submitted-by: <active submitter>
   ```
   Where `<type>` is `task` for most stories, `feat` for net-new functionality, `fix` for bugs. Example: `task: US-001 — <story title>`. Stage only files touched by this story.
   The `Submitted-by:` trailer is mandatory. It must name the model/agent that actually submits the commit, using the active harness identity when available (`$RALPH_HARNESS`, e.g. `Claude`, `Codex`, or `Pi`). If Ralph fell back from Claude to Codex, use `Submitted-by: Codex`.

6. **Update `prd.json`** — set `passes: true` for the completed story, and set `notes` to a one-line summary including iteration number and date:
   ```json
   "notes": "Completed iteration 3 on <YYYY-MM-DD>; commit abc1234"
   ```

7. **Append to `progress.txt`** — append (never replace) using this format:
   ```markdown
   ## US-150 — <YYYY-MM-DD HH:MM UTC>

   **Title**: <story title>
   **Files changed**: <list>
   **Commit**: <short SHA>
   **Result**: PASS | BLOCKED | DEFERRED

   ### What I did
   <2-4 sentences>

   ### Learnings for future iterations
   <patterns, gotchas, useful context>

   ---
   ```

8. **Codebase Patterns** — if you discovered a pattern other iterations should know (a non-obvious convention, a shared utility, a gotcha), append it to (or create) the `## Codebase Patterns` section at the **top** of `progress.txt`. Keep entries general and reusable, not story-specific.

9. **Stop condition** — after step 7, check whether all stories in `prd.json` now have `passes: true`. If yes, append a final line on its own to `progress.txt`:
   ```
   STATUS: COMPLETE
   ```
   This terminates the Ralph loop. The runner reads for this exact whole-line string in **two** places — `progress.txt` (at the start of each iteration) and your iteration output (after each iteration) — so either channel ends the loop.

10. **Signal completion in your output only when terminal** — when (and only when) you have just appended `STATUS: COMPLETE` to `progress.txt`, also print `STATUS: COMPLETE` as the sole content of your final line. This lets the runner exit even if the file write was missed. Never print that bare standalone line for any other reason; to refer to it in prose, call it "the completion marker."

## Blocked or deferred stories

If the chosen story cannot be completed this iteration:

- **Blocked** (external dependency, missing context, ambiguity): append to `progress.txt` with `**Result**: BLOCKED` and an explanation. Do NOT mark `passes: true`. The next iteration will skip this story (find the next lowest-priority `passes: false` that isn't already BLOCKED in recent progress entries) or escalate.
- **Deferred** (out of scope per the PRD's Non-Goals): append with `**Result**: DEFERRED`. Do NOT mark `passes: true`. The story stays for human review.

## Critical rules

- **One story per iteration.** Resist doing two.
- **Never push** to `development` or `main`. Branch is `<prefix>/<N>-add-sandbox-service-healthcheck`.
- **Never skip pre-commit hooks** (`--no-verify`).
- **Never run `git clone` or `git init`** — you're already in a checkout.
- **Confine writes** to repo-tracked paths. Do not write outside the repo or to `~/`.
- **Phase ordering matters.** Stories are priority-ordered by dependency — implement them in `priority` order. If a story depends on an artifact a later story creates, it is mis-ordered; surface it rather than implementing out of order.
- **CHANGELOG discipline.** Per `.claude/rules/git.md`, every story with user-visible impact must add an entry under `## [Unreleased]` in the same commit. The PRD's individual stories spell out which `### Added`, `### Removed`, `### Changed` section to use.
- **Don't modify completed stories** unless the current story explicitly requires it.

## Reference

- PRD: `tasks/add-sandbox-service-healthcheck/prd.md`
- Structured stories: `tasks/add-sandbox-service-healthcheck/prd.json`
- Branch: `<prefix>/<N>-add-sandbox-service-healthcheck`
- Issue: #150
