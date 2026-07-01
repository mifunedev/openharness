## Advisor Briefing

**Goal**: Complete issue #521 by making the devcontainer root pnpm install gate refresh when package manifest inputs change while preserving fast boot and existing failure/skip behavior.

**Constraints / gotchas**:
- `.devcontainer/entrypoint.sh` is protected; edit only the root pnpm install gate, do not delete/rename/relocate the entrypoint.
- Do not fingerprint `.oh/cli/package.json` unless it is a declared pnpm workspace package; root `pnpm-workspace.yaml` currently has `packages: []`.
- `.github/workflows/sandbox-boot-guard.yml` uses `SKIP_PNPM_INSTALL=1`, so preserve that escape hatch and update only stale comments if needed.
- Wiki corpus entries are gitignored by default; force-add the new `sandbox-dependency-installs` entry before verifying it is tracked.

**Acceptance criteria**:
- All unchecked criteria in `.oh/tasks/manifest-aware-sandbox-installs/prd.json` pass, one story per Ralph iteration.
- Targeted Vitest and eval probes pass before each story is marked complete.
- `progress.txt` records each completed story and ends with `STATUS: COMPLETE` only after all stories pass.

**Start here**: `.oh/tasks/manifest-aware-sandbox-installs/prd.json`, `.oh/tasks/manifest-aware-sandbox-installs/prd.md`, `.oh/tasks/manifest-aware-sandbox-installs/critique.md`, `.devcontainer/entrypoint.sh`, `.oh/scripts/__tests__/entrypoint-pnpm-install.test.ts`, `.github/workflows/sandbox-boot-guard.yml`, `.oh/skills/wiki/references/schema.md`.

**Out of scope**: Do not change package manager, delete/prune `node_modules`, change `.oh/cli` package-local installs, alter optional agent-browser installs, modify sandbox application code, or merge the PR.

---

# Ralph iteration — manifest-aware-sandbox-installs

You are one iteration of a Ralph loop implementing the `manifest-aware-sandbox-installs` task. The full plan is in `.oh/tasks/manifest-aware-sandbox-installs/prd.md` and the structured task list is in `.oh/tasks/manifest-aware-sandbox-installs/prd.json`. The loop calls you again until `progress.txt` contains a line `STATUS: COMPLETE`.

## Execution model

**This ralph loop is the executor — you do the work yourself.** `/delegate` is **available** as an optional tool to fan out a single story's disjoint files in parallel when that clearly helps, but it is **optional and never replaces the loop**: do not turn the iteration into a pure `/delegate` dispatcher. Default to implementing directly; reach for `/delegate` only for genuinely parallelizable, disjoint-file work within your one story.

## Your job in one iteration

Pick **one** user story, implement it, commit, mark it `passes: true`, and append a progress entry. Then exit. The next iteration handles the next story. Do not attempt multiple stories per iteration.

## Steps every iteration

1. **Read context** — in this order:
   - `.oh/tasks/manifest-aware-sandbox-installs/prd.json` — find the lowest-`priority` story where `passes: false`. That is your story for this iteration.
   - `.oh/tasks/manifest-aware-sandbox-installs/progress.txt` — read the "Codebase Patterns" section at the top (if any) and the most recent few iterations to see what's been done.
   - `.oh/tasks/manifest-aware-sandbox-installs/critique.md` — the critic findings the stories must satisfy.
   - `.oh/tasks/manifest-aware-sandbox-installs/prd.md` — especially `## Wiki Alignment`.
   - `.oh/skills/wiki/references/schema.md` when your story touches `.oh/skills/wiki/corpus/` or the PRD's Wiki Alignment section says `Impact: REQUIRED`.
   - `.claude/skills/git/SKILL.md` for branch + commit conventions.
   - `.oh/skills/t3/references/sandbox-processes.md` for tmux session conventions if your story spawns processes.
   - `.oh/skills/advisor/SKILL.md` for this critic-gated story.

2. **Verify branch** — your branch is `bug/521-manifest-aware-sandbox-installs` (per `prd.json` `branchName`). If you are not on the branch:
   ```bash
   : "${SHIP_SPEC_REMOTE:=origin}"
   git fetch "$SHIP_SPEC_REMOTE" "${SHIP_SPEC_BASE:-development}"
   git checkout -b bug/521-manifest-aware-sandbox-installs "$SHIP_SPEC_REMOTE/${SHIP_SPEC_BASE:-development}" 2>/dev/null \
     || git checkout bug/521-manifest-aware-sandbox-installs
   ```
   Never push to `development` or `main` directly.

3. **Implement the chosen story** — make the file changes, additions, deletions specified in the story's `acceptanceCriteria`. Confine the work to that story; resist scope creep.

4. **Run quality checks** before commit:
   ```bash
   pnpm exec vitest run .oh/scripts/__tests__/entrypoint-pnpm-install.test.ts 2>/dev/null || true
   bash .oh/evals/probes/entrypoint-pnpm-manifest-fingerprint.sh 2>/dev/null || true
   bash .oh/evals/probes/wiki-readme-index.sh 2>/dev/null || true
   pnpm run typecheck 2>/dev/null || true
   pnpm run test 2>/dev/null || true
   ```
   If a check is relevant to the story and fails, fix it. Do not commit broken code.

5. **Commit** with this message format:
   ```
   <type>: US-<NNN> — <story title>

   Submitted-by: Pi
   ```
   Use `fix` for the entrypoint behavior, `test` is not an allowed project type so use `task` for tests/probes/docs as needed. Stage only files touched by this story.

6. **Update `prd.json`** — set `passes: true` for the completed story, and set `notes` to a one-line summary including iteration number/date and commit SHA.

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

8. **Codebase Patterns** — if you discovered a pattern other iterations should know, append it to (or create) the `## Codebase Patterns` section at the **top** of `progress.txt`.

9. **Stop condition** — after step 7, check whether all stories in `prd.json` now have `passes: true`. If yes, append a final line on its own to `progress.txt`:
   ```
   STATUS: COMPLETE
   ```

10. **Signal completion in your output only when terminal** — when (and only when) you have just appended `STATUS: COMPLETE` to `progress.txt`, also print `STATUS: COMPLETE` as the sole content of your final line.

## Critical rules

- One story per iteration.
- Never push to `development` or `main`.
- Never skip pre-commit hooks (`--no-verify`).
- Never run `git clone` or `git init`.
- Confine writes to repo-tracked paths.
- Add a `CHANGELOG.md` entry under `## [Unreleased]` for user-visible behavior.
- If the PRD says `Wiki Alignment` is `REQUIRED`, update `.oh/skills/wiki/corpus/sandbox-dependency-installs.md` and `.oh/skills/wiki/corpus/README.md`, then verify `bash .oh/evals/probes/wiki-readme-index.sh`.
- Don't modify completed stories unless the current story explicitly requires it.

## Reference

- PRD: `.oh/tasks/manifest-aware-sandbox-installs/prd.md`
- Structured stories: `.oh/tasks/manifest-aware-sandbox-installs/prd.json`
- Branch: `bug/521-manifest-aware-sandbox-installs`
- Issue: #521
