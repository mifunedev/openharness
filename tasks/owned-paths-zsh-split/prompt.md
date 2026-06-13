# Ralph iteration — owned-paths-zsh-split

You are one iteration of a Ralph loop implementing the `owned-paths-zsh-split` task. The full plan is in `tasks/owned-paths-zsh-split/prd.md` and the structured task list is in `tasks/owned-paths-zsh-split/prd.json`. The loop calls you again until `progress.txt` contains a line `STATUS: COMPLETE`.

## Your job in one iteration

Pick **one** user story, implement it, commit, mark it `passes: true`, and append a progress entry. Then exit. The next iteration handles the next story. Do not attempt multiple stories per iteration.

## Steps every iteration

1. **Read context** — in this order:
   - `tasks/owned-paths-zsh-split/prd.json` — find the lowest-`priority` story where `passes: false`. That is your story for this iteration.
   - `tasks/owned-paths-zsh-split/progress.txt` — read the "Codebase Patterns" section at the top (if any) and the most recent few iterations to see what's been done.
   - `tasks/owned-paths-zsh-split/critique.md` — if present, the critic findings the stories must satisfy.
   - `.claude/rules/git.md` for branch + commit conventions.
   - `.claude/rules/sandbox-processes.md` for tmux session conventions if your story spawns processes.
   - `.claude/rules/advisor-model.md` for any critic-gated story.

2. **Verify branch** — your branch is `feat/81-owned-paths-zsh-split` (per `prd.json` `branchName`). If you are not on it:
   ```bash
   git fetch origin
   git checkout -b feat/81-owned-paths-zsh-split origin/development 2>/dev/null \
     || git checkout feat/81-owned-paths-zsh-split
   ```
   Never push to `development` or `main` directly.

3. **Implement the chosen story** — make the file changes specified in the story's `acceptanceCriteria`. Confine the work to that story; resist scope creep.

   **Story-specific gotchas (read before editing):**
   - The fix form is a native shell ARRAY: `OWNED_PATHS=(.claude/ context/ docs/ scripts/ crons/ wiki/ evals/ memory/ tasks/ CHANGELOG.md)` expanded everywhere as `"${OWNED_PATHS[@]}"`. This is correct under BOTH bash and zsh (verified). Do NOT use the bare `$OWNED_PATHS` (collapses under zsh) or quoted `"$OWNED_PATHS"` (collapses everywhere).
   - The replacement text contains double-quotes (`"${OWNED_PATHS[@]}"`). Use the **Edit tool** for these substitutions, or a `sed` delimiter other than `"` (e.g. `|` or `#`). A `"`-delimited sed will break.
   - The two probes (`evals/probes/owned-surface-guard.sh`, `clean-restore.sh`) currently `grep -F` the OLD bare strings and PASS by asserting them present. After you remove the bare form from SKILL.md, you MUST update the probes in the SAME story/commit, or they flip to REGRESSION. US-001 bundles both deliberately — do not split them.
   - `grep -F` is load-bearing in the probes: `${OWNED_PATHS[@]}` contains `[` `]` `@` which are regex metacharacters. Keep every literal pathspec match as `grep -F`/`grep -Fq`/`grep -Fc`.
   - Verify after editing: `grep -F 'git diff --quiet -- $OWNED_PATHS' .claude/skills/autopilot/SKILL.md` (and the `--cached`, `checkout`, and quoted variants) must ALL return empty; then `bash evals/probes/owned-surface-guard.sh; echo $?` and `bash evals/probes/clean-restore.sh; echo $?` must both print 0.

4. **Run quality checks** before commit:
   ```bash
   pnpm run type-check 2>/dev/null || true
   pnpm run lint 2>/dev/null || true
   pnpm run test 2>/dev/null || true
   ```
   If checks fail, fix them. Do not commit broken code. (Note: the pre-commit hook runs `lint && vitest`; neither executes the eval probes — the probes are your own manual gate per step 3.)

5. **Commit** with this message format (per `.claude/rules/git.md`):
   ```
   fix: US-<NNN> — <story title>

   Submitted-by: <active submitter>
   ```
   `<type>` is `fix` for this task (it is a bug fix). Stage only files touched by this story.
   The `Submitted-by:` trailer is mandatory and must name the active harness identity (`$RALPH_HARNESS`, e.g. `Claude`, `Codex`, or `Pi`).

6. **Update `prd.json`** — set `passes: true` for the completed story, and set `notes` to a one-line summary including iteration number and date:
   ```json
   "notes": "Completed iteration N on 2026-06-13; commit abc1234"
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

8. **Codebase Patterns** — if you discovered a reusable pattern, append it to (or create) the `## Codebase Patterns` section at the **top** of `progress.txt`.

9. **Stop condition** — after step 7, check whether all stories in `prd.json` now have `passes: true`. If yes, append a final line on its own to `progress.txt`:
   ```
   STATUS: COMPLETE
   ```
   This terminates the Ralph loop. The runner reads for this exact whole-line string in `progress.txt` and your iteration output.

10. **Signal completion in your output only when terminal** — when (and only when) you have just appended `STATUS: COMPLETE` to `progress.txt`, also print `STATUS: COMPLETE` as the sole content of your final line. Never print that bare standalone line for any other reason.

## Blocked or deferred stories

- **Blocked** (external dependency, missing context, ambiguity): append with `**Result**: BLOCKED` and an explanation. Do NOT mark `passes: true`.
- **Deferred** (out of scope per the PRD's Non-Goals): append with `**Result**: DEFERRED`. Do NOT mark `passes: true`.

## Critical rules

- **One story per iteration.** Resist doing two. (US-001 is intentionally one story that touches SKILL.md AND both probes — that is the atomic unit, not scope creep.)
- **Never push** to `development` or `main`. Branch is `feat/81-owned-paths-zsh-split`.
- **Never skip pre-commit hooks** (`--no-verify`).
- **Never run `git clone` or `git init`** — you're already in a checkout.
- **Confine writes** to repo-tracked paths. Do not write outside the repo or to `~/`.
- **Phase ordering matters.** Implement stories in `priority` order (US-001 before US-002 — validation depends on the fix existing).
- **CHANGELOG discipline.** US-002 adds the `### Fixed` entry under `## [Unreleased]` per `.claude/rules/git.md`.
- **Don't modify completed stories** unless the current story explicitly requires it.

## Reference

- PRD: `tasks/owned-paths-zsh-split/prd.md`
- Structured stories: `tasks/owned-paths-zsh-split/prd.json`
- Branch: `feat/81-owned-paths-zsh-split`
- Issue: #81
