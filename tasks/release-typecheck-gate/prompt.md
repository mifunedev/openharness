# Ralph iteration — release-typecheck-gate

You are one iteration of a Ralph loop implementing the `release-typecheck-gate` task. The full plan is in `tasks/release-typecheck-gate/prd.md` and the structured task list is in `tasks/release-typecheck-gate/prd.json`. The loop calls you again until `progress.txt` contains a line `STATUS: COMPLETE`.

## Your job in one iteration

Pick **one** user story, implement it, commit, mark it `passes: true`, and append a progress entry. Then exit. The next iteration handles the next story. Do not attempt multiple stories per iteration.

## Steps every iteration

1. **Read context** — in this order:
   - `tasks/release-typecheck-gate/prd.json` — find the lowest-`priority` story where `passes: false`. That is your story for this iteration.
   - `tasks/release-typecheck-gate/progress.txt` — read the "Codebase Patterns" section at the top (if any) and the most recent few iterations.
   - `tasks/release-typecheck-gate/critique.md` — the critic findings the stories must satisfy.
   - `.github/workflows/ci-harness.yml` lines 72-95 — the SOURCE OF TRUTH to mirror (validate job: Lint, Format check, Typecheck workspace L80-81, Typecheck oh standalone L83-86, Build, Test, Root tests).
   - `.github/workflows/release.yml` validate job — the TARGET to edit.
   - `.claude/rules/git.md` for branch + commit + changelog conventions.

2. **Verify branch** — your branch is `feat/53-release-typecheck-gate` (per `prd.json` `branchName`). If you are not on it:
   ```bash
   git fetch origin
   git checkout -b feat/53-release-typecheck-gate origin/development 2>/dev/null \
     || git checkout feat/53-release-typecheck-gate
   ```
   Never push to `development` or `main` directly.

3. **Implement the chosen story** — make the file changes specified in the story's `acceptanceCriteria`. Confine the work to that story; resist scope creep. This task touches ONLY `.github/workflows/release.yml` and `CHANGELOG.md`. Do NOT modify `ci-harness.yml`, `scripts/`, or `.devcontainer/`.

4. **Verify YAML validity** before commit (workflow edits fail silently until a tag push):
   ```bash
   python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml'))" && echo "YAML OK"
   ```
   If it errors, fix the indentation. Do not commit a malformed workflow.

5. **Commit** with this message format (per `.claude/rules/git.md`):
   ```
   feat: US-<NNN> — <story title>
   ```
   Stage only files touched by this story.

6. **Update `prd.json`** — set `passes: true` for the completed story, and set `notes` to a one-line summary including iteration number and date:
   ```json
   "notes": "Completed iteration N on 2026-06-12; commit abc1234"
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
   This terminates the Ralph loop.

10. **End response normally** — do not emit any completion sentinel in your reply text. Only the `STATUS: COMPLETE` line in `progress.txt` matters.

## Blocked or deferred stories

- **Blocked** (external dependency, missing context, ambiguity): append with `**Result**: BLOCKED` + explanation. Do NOT mark `passes: true`.
- **Deferred** (out of scope per the PRD's Non-Goals): append with `**Result**: DEFERRED`. Do NOT mark `passes: true`.

## Critical rules

- **One story per iteration.** Resist doing two.
- **Never push** to `development` or `main`. Branch is `feat/53-release-typecheck-gate`.
- **Never skip pre-commit hooks** (`--no-verify`).
- **Mirror exactly.** The two typecheck steps must be byte-identical in `name:` and `run:` to `ci-harness.yml` L80-86. The standalone step's `run:` is the two npm command lines (L84-86), not the `name:` line.
- **pnpm-filter-workspace-trap.** `pnpm --filter './packages/**'` silently skips `packages/oh` (npm-standalone). The `npm --prefix packages/oh` step is REQUIRED — do not drop or collapse it.
- **CHANGELOG discipline.** Append to the EXISTING `### Changed` block under `## [Unreleased]` — do not create a duplicate heading.
- **Don't modify completed stories** unless the current story explicitly requires it.

## Reference

- PRD: `tasks/release-typecheck-gate/prd.md`
- Structured stories: `tasks/release-typecheck-gate/prd.json`
- Branch: `feat/53-release-typecheck-gate`
- Issue: #53
