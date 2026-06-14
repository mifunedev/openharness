# Ralph iteration — eval-probes-ci-gate

You are one iteration of a Ralph loop implementing the `eval-probes-ci-gate` task. The full plan is in `tasks/eval-probes-ci-gate/prd.md` and the structured task list is in `tasks/eval-probes-ci-gate/prd.json`. The loop calls you again until `progress.txt` contains a line `STATUS: COMPLETE`.

## Your job in one iteration

Pick **one** user story, implement it, commit, mark it `passes: true`, and append a progress entry. Then exit. The next iteration handles the next story. Do not attempt multiple stories per iteration.

## Steps every iteration

1. **Read context** — in this order:
   - `tasks/eval-probes-ci-gate/prd.json` — find the lowest-`priority` story where `passes: false`. That is your story for this iteration.
   - `tasks/eval-probes-ci-gate/prd.md` — the full PRD with § Story ordering, § Technical Considerations, and § Critic synthesis. READ the Technical Considerations — the regression semantics (run.sh:106, PASS→SKIPPED is not a regression) are load-bearing.
   - `tasks/eval-probes-ci-gate/progress.txt` — read the "Codebase Patterns" section at the top (if any) and the most recent few iterations.
   - `tasks/eval-probes-ci-gate/critique.md` — the two-critic findings the stories must satisfy.
   - `.claude/rules/git.md` for branch + commit conventions.
   - `.claude/skills/eval/run.sh` and `evals/README.md` — the runner contract you are gating. Do NOT modify run.sh (Non-Goal).
   - `evals/probes/boot-lint-glob.sh` — the canonical static-grep probe pattern to mirror for US-004.

2. **Verify branch** — your branch is `feat/103-eval-probes-ci-gate` (per `prd.json` `branchName`). If you are not on it:
   ```bash
   git fetch origin
   git checkout -b feat/103-eval-probes-ci-gate origin/development 2>/dev/null \
     || git checkout feat/103-eval-probes-ci-gate
   ```
   Never push to `development` or `main` directly.

3. **Implement the chosen story** — make the changes specified in the story's `acceptanceCriteria`. Confine the work to that story; resist scope creep. **Story ordering is critical**: US-002 (probe hermeticity) MUST be complete before US-003 (the blocking job) — implement in `priority` order.

4. **Run quality checks** before commit (this is a shell/CI task — there is no TypeScript to typecheck):
   ```bash
   # shellcheck any shell files you created/modified
   shellcheck -S warning <files-you-touched>.sh 2>/dev/null || true
   # if you changed ci-harness.yml, confirm it parses
   python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci-harness.yml'))" 2>/dev/null || true
   # the eval suite must still exit cleanly (run after US-002/US-003/US-004)
   bash .claude/skills/eval/run.sh 2>&1 | tail -5 || true
   ```
   If checks fail, fix them. Do not commit broken code. The pre-commit hook runs lint + tests — do not bypass it.

5. **Commit** with this message format (per `.claude/rules/git.md`):
   ```
   <type>: US-<NNN> — <story title>

   Submitted-by: <active submitter>
   ```
   `<type>` is `task` for most stories, `feat` for the net-new self-guard probe (US-004) and the CI job (US-003). Stage only files touched by this story. The `Submitted-by:` trailer is mandatory and must name the active harness (`$RALPH_HARNESS`, e.g. `Claude` or `Codex`).

6. **Update `prd.json`** — set `passes: true` for the completed story and set `notes` to a one-line summary including iteration number and date, e.g. `"Completed iteration 2 on 2026-06-13; commit abc1234"`.

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

8. **Codebase Patterns** — if you discovered a reusable pattern (e.g. how a probe self-SKIPs on a missing dep, the YAML-indentation grep idiom), append it to the `## Codebase Patterns` section at the **top** of `progress.txt`.

9. **Stop condition** — after step 7, check whether all stories in `prd.json` now have `passes: true`. If yes, append a final line on its own to `progress.txt`:
   ```
   STATUS: COMPLETE
   ```

10. **Signal completion in your output only when terminal** — when (and only when) you have just appended `STATUS: COMPLETE` to `progress.txt`, also print `STATUS: COMPLETE` as the sole content of your final line. Never print that bare standalone line for any other reason.

## Blocked or deferred stories

- **Blocked** (external dependency, missing context, ambiguity): append with `**Result**: BLOCKED` and an explanation. Do NOT mark `passes: true`.
- **Deferred** (out of scope per the PRD's Non-Goals): append with `**Result**: DEFERRED`. Do NOT mark `passes: true`.

## Critical rules

- **One story per iteration.** Resist doing two.
- **Never push** to `development` or `main`. Branch is `feat/103-eval-probes-ci-gate`.
- **Never skip pre-commit hooks** (`--no-verify`).
- **Never run `git clone` or `git init`** — you're already in a checkout.
- **Do NOT modify `.claude/skills/eval/run.sh`** or change any probe's 0/1/2 oracle semantics (Non-Goal). US-002 only adds SKIP guards for missing deps.
- **Confine writes** to repo-tracked paths under `.github/workflows/`, `evals/`, `crons/eval-weekly.md`, `CHANGELOG.md`, and this task dir.
- **Phase ordering matters.** US-002 (hermeticity) before US-003 (blocking job) — the PRD § Story ordering explains the bootstrap-circularity reason.
- **CHANGELOG discipline.** US-005 adds the `[Unreleased]` `### Added` entry referencing #103.
- **Don't modify completed stories** unless the current story explicitly requires it.

## Reference

- PRD: `tasks/eval-probes-ci-gate/prd.md`
- Structured stories: `tasks/eval-probes-ci-gate/prd.json`
- Critique: `tasks/eval-probes-ci-gate/critique.md`
- Branch: `feat/103-eval-probes-ci-gate`
- Issue: #103
