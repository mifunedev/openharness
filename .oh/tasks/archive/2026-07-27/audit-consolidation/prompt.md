# Ralph iteration — audit-consolidation

You are one iteration of a Ralph loop implementing the `audit-consolidation` task. The full plan is in `.oh/tasks/audit-consolidation/prd.md` and the structured task list is in `.oh/tasks/audit-consolidation/prd.json`. The loop calls you again until `progress.txt` contains a line `STATUS: COMPLETE`.

## Execution model

**This ralph loop is the executor — you do the work yourself.** `/delegate` is **available** as an
optional tool to fan out a single story's disjoint files in parallel when that clearly helps, but it
is **optional and never replaces the loop**: do not turn the iteration into a pure `/delegate`
dispatcher (an Advisor running several independent tasks runs one ralph loop per task in parallel and
each loop may, but need not, use `/delegate` inside). Default to implementing directly; reach for
`/delegate` only for genuinely parallelizable, disjoint-file work within your one story.

## Your job in one iteration

Pick **one** user story, implement it, commit, mark it `passes: true`, and append a progress entry. Then exit. The next iteration handles the next story. Do not attempt multiple stories per iteration.

## Steps every iteration

1. **Read context** — in this order:
   - `.oh/tasks/audit-consolidation/prd.json` — find the lowest-`priority` story where `passes: false`. That is your story for this iteration.
   - `.oh/tasks/audit-consolidation/progress.txt` — read the "Codebase Patterns" section at the top (if any) and the most recent few iterations to see what's been done.
   - `.oh/tasks/audit-consolidation/critique.md` — if present, the critic findings the stories must satisfy.
   - If `.oh/tasks/audit-consolidation/prd.md` contains `## Wiki Alignment`, read it before choosing the story. When `Impact: REQUIRED`, the relevant story must keep wiki updates aligned with the PRD and the recorded DeepWiki comparison.
   - `.oh/skills/wiki/references/schema.md` when your story touches `.oh/skills/wiki/corpus/` or the PRD's Wiki Alignment section says `Impact: REQUIRED`.
   - `.claude/skills/git/SKILL.md` for branch + commit conventions.
   - `.oh/skills/t3/references/sandbox-processes.md` for tmux session conventions if your story spawns processes.
   - `.oh/agents/advisor.md` for any critic-gated story.

2. **Verify branch** — your branch is `<prefix>/<N>-audit-consolidation` (per `prd.json` `branchName`). If `/ship-spec`'s Advisor launched you in an isolated worktree at `.oh/worktrees/<prefix>/<N>-audit-consolidation`, that directory already has the branch checked out — `cd` into it and skip the checkout below. Otherwise, if you are not on the branch:
   ```bash
   : "${SHIP_SPEC_REMOTE:?SHIP_SPEC_REMOTE must name the git remote that matches SHIP_SPEC_REPO}"
   git fetch "$SHIP_SPEC_REMOTE" "${SHIP_SPEC_BASE:-development}"
   git checkout -b <prefix>/<N>-audit-consolidation "$SHIP_SPEC_REMOTE/${SHIP_SPEC_BASE:-development}" 2>/dev/null \
     || git checkout <prefix>/<N>-audit-consolidation
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

5. **Commit** with this message format (per `.claude/skills/git/SKILL.md`):
   ```
   <type>: US-<NNN> — <story title>

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
   ## US-<NNN> — <YYYY-MM-DD HH:MM UTC>

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
- **Never push** to `development` or `main`. Branch is `<prefix>/<N>-audit-consolidation`.
- **Never skip pre-commit hooks** (`--no-verify`).
- **Never run `git clone` or `git init`** — you're already in a checkout.
- **Confine writes** to repo-tracked paths. Do not write outside the repo or to `~/`.
- **Phase ordering matters.** Stories are priority-ordered by dependency — implement them in `priority` order. If a story depends on an artifact a later story creates, it is mis-ordered; surface it rather than implementing out of order.
- **CHANGELOG discipline.** Per `.claude/skills/git/SKILL.md`, every story with user-visible impact must add an entry under `## [Unreleased]` in the same commit. The PRD's individual stories spell out which `### Added`, `### Removed`, `### Changed` section to use.
- **Wiki alignment discipline.** If the PRD says `Wiki Alignment` is `REQUIRED`, update the named wiki entries in the same implementation branch so they match the final spec behavior, preserve the DeepWiki comparison, and pass `bash .oh/evals/probes/wiki-readme-index.sh`.
- **Don't modify completed stories** unless the current story explicitly requires it.

## Reference

- PRD: `.oh/tasks/audit-consolidation/prd.md`
- Structured stories: `.oh/tasks/audit-consolidation/prd.json`
- Branch: `<prefix>/<N>-audit-consolidation`
- Issue: #645
