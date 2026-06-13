# Ralph iteration — boot-lint-shellcheck-coverage

You are one iteration of a Ralph loop implementing the `boot-lint-shellcheck-coverage` task. The full plan is in `tasks/boot-lint-shellcheck-coverage/prd.md` and the structured task list is in `tasks/boot-lint-shellcheck-coverage/prd.json`. The loop calls you again until `progress.txt` contains a line `STATUS: COMPLETE`.

## Your job in one iteration

Pick **one** user story, implement it, commit, mark it `passes: true`, and append a progress entry. Then exit. The next iteration handles the next story. Do not attempt multiple stories per iteration.

## Steps every iteration

1. **Read context** — in this order:
   - `tasks/boot-lint-shellcheck-coverage/prd.json` — find the lowest-`priority` story where `passes: false`. That is your story for this iteration.
   - `tasks/boot-lint-shellcheck-coverage/progress.txt` — read the "Codebase Patterns" section at the top (if any) and the most recent few iterations to see what's been done.
   - `tasks/boot-lint-shellcheck-coverage/critique.md` — if present, the critic findings the stories must satisfy.
   - `.claude/rules/git.md` for branch + commit conventions.
   - `.claude/rules/sandbox-processes.md` for tmux session conventions if your story spawns processes.
   - `.claude/rules/advisor-model.md` for any critic-gated story.

2. **Verify branch** — your branch is `feat/90-boot-lint-shellcheck-coverage` (per `prd.json` `branchName`). If you are not on it:
   ```bash
   git fetch origin
   git checkout -b feat/90-boot-lint-shellcheck-coverage origin/development 2>/dev/null \
     || git checkout feat/90-boot-lint-shellcheck-coverage
   ```
   Never push to `development` or `main` directly.

3. **Implement the chosen story** — make the file changes specified in the story's `acceptanceCriteria`. Confine the work to that story; resist scope creep.

4. **Run quality checks** before commit. This is a harness-infra (shell + CI workflow + evals) task — the relevant gates are:
   ```bash
   # shell lint on any boot script you touched (and the full extended set for US-002):
   shellcheck -S warning .devcontainer/*.sh install/*.sh scripts/*.sh workspace/*.sh
   # the probe (US-003 onward):
   bash evals/probes/boot-lint-glob.sh; echo "probe exit: $?"
   # root tests (every story):
   pnpm test:scripts
   ```
   If checks fail, fix them. Do not commit broken code.

5. **Commit** with this message format (per `.claude/rules/git.md`):
   ```
   <type>: US-<NNN> — <story title>

   Submitted-by: <active submitter>
   ```
   Where `<type>` is `task` for most stories, `feat` for net-new functionality, `fix` for bugs. Stage only files touched by this story. The `Submitted-by:` trailer is mandatory and must name the model/agent that actually submits (use `$RALPH_HARNESS` — e.g. `Claude`, `Codex`, or `Pi`; if Ralph fell back from Claude to Codex, use `Submitted-by: Codex`).

6. **Update `prd.json`** — set `passes: true` for the completed story, and set `notes` to a one-line summary including iteration number and date:
   ```json
   "notes": "Completed iteration 2 on 2026-06-13; commit abc1234"
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

8. **Codebase Patterns** — if you discovered a pattern other iterations should know (a non-obvious convention, a shared utility, a gotcha), append it to (or create) the `## Codebase Patterns` section at the **top** of `progress.txt`. Keep entries general and reusable.

9. **Stop condition** — after step 7, check whether all stories in `prd.json` now have `passes: true`. If yes, append a final line on its own to `progress.txt`:
   ```
   STATUS: COMPLETE
   ```
   This terminates the Ralph loop. The runner reads for this exact whole-line string in **two** places — `progress.txt` (at the start of each iteration) and your iteration output (after each iteration) — so either channel ends the loop.

10. **Signal completion in your output only when terminal** — when (and only when) you have just appended `STATUS: COMPLETE` to `progress.txt`, also print `STATUS: COMPLETE` as the sole content of your final line. Never print that bare standalone line for any other reason; to refer to it in prose, call it "the completion marker."

## Blocked or deferred stories

- **Blocked** (external dependency, missing context, ambiguity): append with `**Result**: BLOCKED` and an explanation. Do NOT mark `passes: true`.
- **Deferred** (out of scope per the PRD's Non-Goals): append with `**Result**: DEFERRED`. Do NOT mark `passes: true`.

## Critical rules

- **One story per iteration.** Resist doing two.
- **Never push** to `development` or `main`. Branch is `feat/90-boot-lint-shellcheck-coverage`.
- **Never skip pre-commit hooks** (`--no-verify`).
- **Never run `git clone` or `git init`** — you're already in a checkout.
- **Confine writes** to repo-tracked paths. Do not write outside the repo or to `~/`.
- **Harness-infra scope only.** This task touches `.github/workflows/ci-harness.yml`, `scripts/install.sh`, `evals/probes/`, `evals/RESULTS.md`, `CHANGELOG.md`. Do NOT touch sandbox application code, and do NOT change installer logic beyond the SC2088 lint-disable comment.
- **Phase ordering matters.** Implement stories in `priority` order (US-001 → US-004); US-002's clean-glob assertion depends on US-001, US-003's probe depends on US-002, US-004 depends on US-003.
- **CHANGELOG discipline.** The CHANGELOG entry is US-004's job (under `## [Unreleased]` → `### Fixed`, referencing #90) — do not duplicate it in earlier stories.

## Reference

- PRD: `tasks/boot-lint-shellcheck-coverage/prd.md`
- Structured stories: `tasks/boot-lint-shellcheck-coverage/prd.json`
- Branch: `feat/90-boot-lint-shellcheck-coverage`
- Issue: #90
