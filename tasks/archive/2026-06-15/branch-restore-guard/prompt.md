# Ralph iteration — branch-restore-guard

You are one iteration of a Ralph loop implementing the `branch-restore-guard` task. The full plan is in `tasks/branch-restore-guard/prd.md` and the structured task list is in `tasks/branch-restore-guard/prd.json`. The loop calls you again until `progress.txt` contains a line `STATUS: COMPLETE`.

## Your job in one iteration

Pick **one** user story, implement it, commit, mark it `passes: true`, and append a progress entry. Then exit. The next iteration handles the next story. Do not attempt multiple stories per iteration.

## Steps every iteration

1. **Read context** — in this order:
   - `tasks/branch-restore-guard/prd.json` — find the lowest-`priority` story where `passes: false`. That is your story for this iteration.
   - `tasks/branch-restore-guard/progress.txt` — read the "Codebase Patterns" section at the top (if any) and the most recent few iterations to see what's been done.
   - `tasks/branch-restore-guard/critique.md` — if present, the critic findings the stories must satisfy.
   - `.claude/rules/git.md` for branch + commit conventions.
   - `.claude/rules/advisor-model.md` for any critic-gated story.

2. **Verify branch** — your branch is `feat/45-branch-restore-guard` (per `prd.json` `branchName`). If you are not on it:
   ```bash
   git fetch origin
   git checkout -b feat/45-branch-restore-guard origin/development 2>/dev/null \
     || git checkout feat/45-branch-restore-guard
   ```
   Never push to `development` or `main` directly.

3. **Implement the chosen story** — make the file changes specified in the story's `acceptanceCriteria`. Confine the work to that story; resist scope creep. All `SKILL.md` edits are made by a single worker (no parallel edits to the same file).

4. **Run quality checks** before commit:
   ```bash
   bash evals/probes/eval-gate.sh; echo "eval-gate exit=$?"
   bash evals/probes/clean-restore.sh; echo "clean-restore exit=$?"   # after US-005 exists
   ```
   If checks fail, fix them. Do not commit broken code.

5. **Commit** with this message format (per `.claude/rules/git.md`):
   ```
   <type>: US-<NNN> — <story title>
   ```
   Where `<type>` is `feat` for net-new functionality, `task` for most edits, `fix` for bugs. Stage only files touched by this story.

6. **Update `prd.json`** — set `passes: true` for the completed story, and set `notes` to a one-line summary including iteration number and date.

7. **Append to `progress.txt`** — append (never replace) using the standard format (Title / Files changed / Commit / Result / What I did / Learnings).

8. **Codebase Patterns** — append any reusable pattern to the `## Codebase Patterns` section at the **top** of `progress.txt`.

9. **Stop condition** — after step 7, if all stories in `prd.json` have `passes: true`, append a final line on its own to `progress.txt`:
   ```
   STATUS: COMPLETE
   ```

10. **End response normally** — only the `STATUS: COMPLETE` line in `progress.txt` matters.

## Critical rules

- **One story per iteration.** Resist doing two.
- **Never push** to `development` or `main`. Branch is `feat/45-branch-restore-guard`.
- **Never skip pre-commit hooks** (`--no-verify`).
- **Confine writes** to `.claude/skills/autopilot/SKILL.md` and `evals/probes/clean-restore.sh` (plus `tasks/branch-restore-guard/` bookkeeping). Harness-infra only — no application code.
- **Preserve §6 eval-gate vocabulary** byte-for-byte (`evals/probes/eval-gate.sh` greps it).
- **Phase ordering matters.** Implement in `priority` order; the probe (US-005) is authored last to validate the final state.

## Reference

- PRD: `tasks/branch-restore-guard/prd.md`
- Structured stories: `tasks/branch-restore-guard/prd.json`
- Branch: `feat/45-branch-restore-guard`
- Issue: #45
