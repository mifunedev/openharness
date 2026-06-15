# Ralph iteration — eval-results-atomic-write

You are one iteration of a Ralph loop implementing the `eval-results-atomic-write` task. The full plan is in `tasks/eval-results-atomic-write/prd.md` and the structured task list is in `tasks/eval-results-atomic-write/prd.json`. The loop calls you again until `progress.txt` contains a line `STATUS: COMPLETE`.

## Your job in one iteration

Pick **one** user story, implement it, commit, mark it `passes: true`, and append a progress entry. Then exit. The next iteration handles the next story. Do not attempt multiple stories per iteration.

## Steps every iteration

1. **Read context** — in this order:
   - `tasks/eval-results-atomic-write/prd.json` — find the lowest-`priority` story where `passes: false`. That is your story for this iteration.
   - `tasks/eval-results-atomic-write/progress.txt` — read the "Codebase Patterns" section at the top (if any) and the most recent few iterations.
   - `tasks/eval-results-atomic-write/critique.md` — the critic findings the stories must satisfy (the H findings are baked into US-001's acceptance criteria).
   - `.claude/skills/eval/run.sh` — the file US-001 refactors (~137 lines); `evals/probes/eval-runner-exit.sh` — the existing Tier-A probe style + its `tail -n 12` window constraint.
   - `.claude/rules/git.md` for branch + commit conventions.
   - `.claude/rules/advisor-model.md` for this critic-gated task.

2. **Verify branch** — your branch is `feat/83-eval-results-atomic-write` (per `prd.json` `branchName`). If you are not on it:
   ```bash
   git fetch origin
   git checkout -b feat/83-eval-results-atomic-write origin/development 2>/dev/null \
     || git checkout feat/83-eval-results-atomic-write
   ```
   Never push to `development` or `main` directly.

3. **Implement the chosen story** — make the changes specified in the story's `acceptanceCriteria`. Confine the work to that story; resist scope creep.

4. **Run quality checks** before commit (this is a bash/markdown harness task — there is no TypeScript to type-check for these files):
   ```bash
   bash -n .claude/skills/eval/run.sh                 # syntax-check any shell you touched
   pnpm test:scripts 2>&1 | tail -20                  # scripts/__tests__ vitest suite must stay green
   ```
   For US-001/US-002, ALSO empirically verify the runner with a scratch copy before committing:
   - full run produces a structurally-equivalent RESULTS.md (diff with the timestamp column masked);
   - a filtered run (`--probe <id>`) does NOT reset other rows to `(not run)`;
   - the new probe (US-002) exits 0 against the refactored run.sh and exits 1 against a doctored copy where `cat > "$RESULTS"` is reintroduced.
   Do the empirical RESULTS.md experiments against a TEMP copy of run.sh / a scratch dir where possible; only the final US-003 step regenerates and stages the real `evals/RESULTS.md`. If checks fail, fix them. Do not commit broken code.

5. **Commit** with this message format (per `.claude/rules/git.md`):
   ```
   <type>: US-<NNN> — <story title>

   Submitted-by: <active submitter>
   ```
   Use `feat` for US-001/US-002 (net-new behavior/probe), `task`/`docs` for US-003. Stage only files touched by this story. The `Submitted-by:` trailer is mandatory and must name the active harness (`$RALPH_HARNESS`, e.g. `Claude`, `Codex`).

6. **Update `prd.json`** — set `passes: true` for the completed story and set `notes` to a one-line summary including iteration number and date.

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

8. **Codebase Patterns** — if you discovered a reusable pattern (a non-obvious convention, gotcha), append it to (or create) the `## Codebase Patterns` section at the **top** of `progress.txt`.

9. **Stop condition** — after step 7, check whether all stories in `prd.json` now have `passes: true`. If yes, append a final line on its own to `progress.txt`:
   ```
   STATUS: COMPLETE
   ```
   The runner reads for this exact whole-line string in `progress.txt` and in your iteration output.

10. **Signal completion in your output only when terminal** — when (and only when) you have just appended `STATUS: COMPLETE` to `progress.txt`, also print `STATUS: COMPLETE` as the sole content of your final line. Never print that bare standalone line otherwise; to refer to it in prose, call it "the completion marker."

## Blocked or deferred stories

- **Blocked** (external dependency, missing context, ambiguity): append with `**Result**: BLOCKED` and an explanation. Do NOT mark `passes: true`.
- **Deferred** (out of scope per the PRD's Non-Goals): append with `**Result**: DEFERRED`. Do NOT mark `passes: true`.

## Critical rules

- **One story per iteration.** Resist doing two.
- **Never push** to `development` or `main`. Branch is `feat/83-eval-results-atomic-write`.
- **Never skip pre-commit hooks** (`--no-verify`).
- **Never run `git clone` or `git init`** — you're already in a checkout.
- **Confine writes** to repo-tracked paths. Scope: `.claude/skills/eval/run.sh`, `evals/probes/eval-results-atomic.sh`, `evals/README.md`, `.claude/skills/eval/SKILL.md`, `evals/RESULTS.md`, `CHANGELOG.md`, and the four `tasks/eval-results-atomic-write/` state files. Do NOT touch sandbox application code.
- **Preserve no-regression invariant.** A full unfiltered run must stay structurally identical (timestamp-masked) to today's output, and the exit-1-on-regression block must stay in run.sh's last 12 lines (or update `eval-runner-exit.sh` in the same story).
- **CHANGELOG discipline.** US-003 adds the `## [Unreleased]` → `### Fixed` entry linking #83.
- **Don't modify completed stories** unless the current story explicitly requires it.

## Reference

- PRD: `tasks/eval-results-atomic-write/prd.md`
- Structured stories: `tasks/eval-results-atomic-write/prd.json`
- Branch: `feat/83-eval-results-atomic-write`
- Issue: #83
