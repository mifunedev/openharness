# Ralph iteration — tokenmaxxing-openharness

You are one iteration of a Ralph loop implementing the `tokenmaxxing-openharness` task. The full plan is in `tasks/tokenmaxxing-openharness/prd.md` and the structured task list is in `tasks/tokenmaxxing-openharness/prd.json`. The loop calls you again until `progress.txt` contains a line `STATUS: COMPLETE`.

## Your job in one iteration

Pick **one** user story, implement it, commit, mark it `passes: true`, and append a progress entry. Then exit. The next iteration handles the next story. Do not attempt multiple stories per iteration.

## Steps every iteration

1. **Read context** — in this order:
   - `tasks/tokenmaxxing-openharness/prd.json` — find the lowest-`priority` story where `passes: false`. That is your story for this iteration.
   - `tasks/tokenmaxxing-openharness/progress.txt` — read the "Codebase Patterns" section at the top (if any) and the most recent few iterations to see what's been done.
   - `tasks/tokenmaxxing-openharness/critique.md` — if present, the critic findings the stories must satisfy.
   - `.claude/rules/git.md` for branch + commit conventions.
   - `.claude/rules/sandbox-processes.md` for tmux session conventions if your story spawns processes.
   - `.claude/rules/advisor-model.md` for any critic-gated story.

2. **Verify branch** — your branch is `feat/212-tokenmaxxing-openharness` (per `prd.json` `branchName`). If `/ship-spec`'s Advisor launched you in an isolated worktree at `.worktrees/feat/212-tokenmaxxing-openharness`, that directory already has the branch checked out — `cd` into it and skip the checkout below. Otherwise, if you are not on the branch:
   ```bash
   git fetch origin
   git checkout -b feat/212-tokenmaxxing-openharness origin/development 2>/dev/null \
     || git checkout feat/212-tokenmaxxing-openharness
   ```
   Never push to `development` or `main` directly.

3. **Implement the chosen story** — make the file changes, additions, deletions specified in the story's `acceptanceCriteria`. Confine the work to that story; resist scope creep.

4. **Run quality checks** before commit:
   ```bash
   pnpm docs:build
   test -f packages/docs/build/blog/tokenmaxxing-openharness/index.html
   ```
   If checks fail, fix them. Do not commit broken code.

5. **Commit** with this message format (per `.claude/rules/git.md`):
   ```
   <type>: US-<NNN> — <story title>

   Submitted-by: <active submitter>
   ```
   Where `<type>` is `task` for most stories, `feat` for net-new functionality, `fix` for bugs. Stage only files touched by this story.
   The `Submitted-by:` trailer is mandatory. It must name the model/agent that actually submits the commit, using the active harness identity when available (`$RALPH_HARNESS`, e.g. `Claude`, `Codex`, or `Pi`). If Ralph fell back from Claude to Codex, use `Submitted-by: Codex`.

6. **Update `prd.json`** — set `passes: true` for the completed story, and set `notes` to a one-line summary including iteration number and date.

7. **Append to `progress.txt`** — append using the format in the template. When all stories are complete, append `STATUS: COMPLETE`.

## Reference

- PRD: `tasks/tokenmaxxing-openharness/prd.md`
- Structured stories: `tasks/tokenmaxxing-openharness/prd.json`
- Branch: `feat/212-tokenmaxxing-openharness`
- Issue: #212
