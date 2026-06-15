# Ralph iteration — drift-sentinel

You are one iteration of a Ralph loop implementing the `drift-sentinel` task. The full plan is in `tasks/drift-sentinel/prd.md` and the structured task list is in `tasks/drift-sentinel/prd.json`. The loop calls you again until `progress.txt` contains a line `STATUS: COMPLETE`.

## Your job in one iteration

Pick **one** user story, implement it, commit, mark it `passes: true`, and append a progress entry. Then exit. The next iteration handles the next story. Do not attempt multiple stories per iteration.

## Steps every iteration

1. **Read context** — in this order:
   - `tasks/drift-sentinel/prd.json` — find the lowest-`priority` story where `passes: false`. That is your story for this iteration.
   - `tasks/drift-sentinel/progress.txt` — read the "Codebase Patterns" section at the top (if any) and the most recent few iterations to see what's been done.
   - `tasks/drift-sentinel/critique.md` — if present, the critic findings the stories must satisfy.
   - `.claude/rules/git.md` for branch + commit conventions.
   - `.claude/rules/sandbox-processes.md` for tmux session conventions if your story spawns processes.
   - `.claude/rules/advisor-model.md` for any critic-gated story.

2. **Verify branch** — your branch is `feat/7-drift-sentinel` (per `prd.json` `branchName`). If you are not on it:
   ```bash
   git fetch origin
   git checkout -b feat/7-drift-sentinel origin/development 2>/dev/null \
     || git checkout feat/7-drift-sentinel
   ```
   Never push to `development` or `main` directly.

3. **Implement the chosen story** — make the file changes specified in the story's `acceptanceCriteria`. Confine the work to that story; resist scope creep.

4. **Run quality checks** before commit:
   ```bash
   pnpm run type-check 2>/dev/null || true
   pnpm run lint 2>/dev/null || true
   pnpm run test 2>/dev/null || true
   ```
   If checks fail, fix them. Do not commit broken code.

5. **Commit** with this message format (per `.claude/rules/git.md`):
   ```
   <type>: US-<NNN> — <story title>
   ```
   Where `<type>` is `feat` for net-new functionality. Stage only files touched by this story.

6. **Update `prd.json`** — set `passes: true` for the completed story, and set `notes` to a one-line summary including iteration number and date.

7. **Append to `progress.txt`** — append (never replace) the standard per-iteration block (Title / Files changed / Commit / Result + What I did + Learnings).

8. **Codebase Patterns** — append any reusable pattern discovered to the `## Codebase Patterns` section at the **top** of `progress.txt`.

9. **Stop condition** — after step 7, if all stories in `prd.json` have `passes: true`, append a final line on its own to `progress.txt`:
   ```
   STATUS: COMPLETE
   ```

10. **End response normally** — only the `STATUS: COMPLETE` line in `progress.txt` matters.

## Critical rules

- **One story per iteration.** Resist doing two.
- **Never push** to `development` or `main`. Branch is `feat/7-drift-sentinel`.
- **Never skip pre-commit hooks** (`--no-verify`).
- **Confine writes** to repo-tracked paths. This is harness-infra only (skills/rules/docs/scripts/crons/wiki) — never sandbox application code.
- **The skill must stay read-only/non-destructive** — no command in `.claude/skills/drift-check/SKILL.md` may mutate git history, the working tree, or host state (`git fetch` of remote-tracking refs is the only permitted, non-destructive write).
- **Phase ordering matters.** Implement stories in `priority` order (US-001 creates the skill that US-002/US-003 reference).

## Reference

- PRD: `tasks/drift-sentinel/prd.md`
- Structured stories: `tasks/drift-sentinel/prd.json`
- Critique: `tasks/drift-sentinel/critique.md`
- Branch: `feat/7-drift-sentinel`
- Issue: #7
