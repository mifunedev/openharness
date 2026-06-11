# Ralph iteration — autopilot-eval-gate-delta

You are one iteration of a Ralph loop implementing the `autopilot-eval-gate-delta` task. The full plan is in `tasks/autopilot-eval-gate-delta/prd.md` and the structured task list is in `tasks/autopilot-eval-gate-delta/prd.json`. The loop calls you again until `progress.txt` contains a line `STATUS: COMPLETE`.

## Your job in one iteration

Pick **one** user story, implement it, commit, mark it `passes: true`, and append a progress entry. Then exit. The next iteration handles the next story. Do not attempt multiple stories per iteration.

## Steps every iteration

1. **Read context** — in this order:
   - `tasks/autopilot-eval-gate-delta/prd.json` — find the lowest-`priority` story where `passes: false`. That is your story for this iteration.
   - `tasks/autopilot-eval-gate-delta/progress.txt` — read the "Codebase Patterns" section at the top (if any) and the most recent few iterations to see what's been done.
   - `tasks/autopilot-eval-gate-delta/critique.md` — if present, the critic findings the stories must satisfy.
   - `.claude/rules/git.md` for branch + commit conventions.
   - `.claude/rules/advisor-model.md` for any critic-gated story.

2. **Verify branch** — your branch is `feat/22-autopilot-eval-gate-delta` (per `prd.json` `branchName`). If you are not on it:
   ```bash
   git fetch origin
   git checkout -b feat/22-autopilot-eval-gate-delta origin/development 2>/dev/null \
     || git checkout feat/22-autopilot-eval-gate-delta
   ```
   Never push to `development` or `main` directly.

3. **Implement the chosen story** — make the file changes specified in the story's `acceptanceCriteria`. Confine the work to that story; resist scope creep. Scope is harness-infra only: `.claude/skills/autopilot/SKILL.md` and `evals/probes/eval-gate.sh` (+ the `/eval`-regenerated `evals/RESULTS.md`).

4. **Run quality checks** before commit:
   ```bash
   bash -n evals/probes/eval-gate.sh 2>/dev/null || true   # shell syntax (US-003)
   ```
   (No TS typecheck applies — this task touches markdown + bash only.)

5. **Commit** with this message format (per `.claude/rules/git.md`):
   ```
   feat: US-<NNN> — <story title>
   ```
   Stage only files touched by this story.

6. **Update `prd.json`** — set `passes: true` for the completed story, and set `notes` to a one-line summary including iteration number and date.

7. **Append to `progress.txt`** — append (never replace) using the standard format (Title / Files changed / Commit / Result / What I did / Learnings).

8. **Codebase Patterns** — append reusable patterns to the `## Codebase Patterns` section at the **top** of `progress.txt`.

9. **Stop condition** — after step 7, if all stories in `prd.json` have `passes: true`, append `STATUS: COMPLETE` on its own line to `progress.txt`.

## Critical rules

- **One story per iteration.**
- **Never push** to `development` or `main`. Branch is `feat/22-autopilot-eval-gate-delta`.
- **Never skip pre-commit hooks** (`--no-verify`).
- **Confine writes** to repo-tracked paths.
- **Phase ordering matters** — implement in `priority` order (US-001 → US-002 → US-003 → US-004).
- **CHANGELOG discipline** — add an `### Changed` / `### Added` entry under `## [Unreleased]` for the user-visible changes (the §6 rule change and the new probe).

## Reference

- PRD: `tasks/autopilot-eval-gate-delta/prd.md`
- Structured stories: `tasks/autopilot-eval-gate-delta/prd.json`
- Branch: `feat/22-autopilot-eval-gate-delta`
- Issue: #22
