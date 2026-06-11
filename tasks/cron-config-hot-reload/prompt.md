# Ralph iteration — cron-config-hot-reload

You are one iteration of a Ralph loop implementing the `cron-config-hot-reload` task. The full plan is in `tasks/cron-config-hot-reload/prd.md` and the structured task list is in `tasks/cron-config-hot-reload/prd.json`. The loop calls you again until `progress.txt` contains a line `STATUS: COMPLETE`.

## Your job in one iteration

Pick **one** user story, implement it, commit, mark it `passes: true`, and append a progress entry. Then exit. The next iteration handles the next story. Do not attempt multiple stories per iteration.

## Steps every iteration

1. **Read context** — in this order:
   - `tasks/cron-config-hot-reload/prd.json` — find the lowest-`priority` story where `passes: false`. That is your story for this iteration.
   - `tasks/cron-config-hot-reload/progress.txt` — read the "Codebase Patterns" section at the top (if any) and the most recent few iterations to see what's been done.
   - `tasks/cron-config-hot-reload/critique.md` — the critic findings the stories must satisfy (5 high-severity findings, all folded into the ACs).
   - `.claude/rules/git.md` for branch + commit conventions.
   - `.claude/rules/advisor-model.md` for any critic-gated story.

2. **Verify branch** — your branch is `feat/47-cron-config-hot-reload` (per `prd.json` `branchName`). If you are not on it:
   ```bash
   git fetch origin
   git checkout -b feat/47-cron-config-hot-reload origin/development 2>/dev/null \
     || git checkout feat/47-cron-config-hot-reload
   ```
   Never push to `development` or `main` directly.

3. **Implement the chosen story** — make the file changes specified in the story's `acceptanceCriteria`. Confine the work to that story; resist scope creep. The only source files in scope are `scripts/cron-runtime.ts`, `scripts/__tests__/cron-runtime.test.ts`, and `crons/README.md`.

4. **Run quality checks** before commit (this repo's actual scripts):
   ```bash
   pnpm test:scripts                              # vitest run — the cron-runtime suite
   npx tsc --noEmit -p tsconfig.json 2>/dev/null || npx tsc --noEmit 2>/dev/null || true
   pnpm lint 2>/dev/null || true
   pnpm format:check 2>/dev/null || true
   ```
   If checks fail, fix them. Do not commit broken code.

5. **Commit** with this message format (per `.claude/rules/git.md`):
   ```
   <type>: US-<NNN> — <story title>
   ```
   Where `<type>` is `feat` for the runtime changes, `task`/`test` for the test and docs stories. Stage only files touched by this story.

6. **Update `prd.json`** — set `passes: true` for the completed story, and set `notes` to a one-line summary including iteration number and date:
   ```json
   "notes": "Completed iteration N on 2026-06-11; commit abc1234"
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

8. **Codebase Patterns** — if you discovered a pattern other iterations should know, append it to (or create) the `## Codebase Patterns` section at the **top** of `progress.txt`.

9. **Stop condition** — after step 7, check whether all stories in `prd.json` now have `passes: true`. If yes, append a final line on its own to `progress.txt`:
   ```
   STATUS: COMPLETE
   ```

10. **End response normally** — do not emit any completion sentinel in your reply text. Only the `STATUS: COMPLETE` line in `progress.txt` matters.

## Blocked or deferred stories

- **Blocked** (external dependency, missing context, ambiguity): append to `progress.txt` with `**Result**: BLOCKED` and an explanation. Do NOT mark `passes: true`.
- **Deferred** (out of scope per the PRD's Non-Goals — e.g. the `fs.watch` schedule-reconciler): append with `**Result**: DEFERRED`. Do NOT mark `passes: true`.

## Critical rules

- **One story per iteration.** Resist doing two.
- **Never push** to `development` or `main`. Branch is `feat/47-cron-config-hot-reload`.
- **Never skip pre-commit hooks** (`--no-verify`).
- **Never run `git clone` or `git init`** — you're already in a checkout.
- **Confine writes** to repo-tracked paths. Harness-infra only: `scripts/`, `crons/`, tests. No sandbox application code, no security-model changes.
- **`scripts/cron-runtime.ts` is on `.claude/protected-paths.txt`** — changes here must be additive (new exported `reloadBody`, the `loadCrons` `filePath` join, swapping two `entry.body` reads). Do not remove existing exports or behavior.
- **Phase ordering matters.** Implement in `priority` order: US-001 (`loadCrons` filePath) → US-002 (`reloadBody`) → US-003 (call sites) → US-004 (tests) → US-005 (docs).
- **CHANGELOG discipline.** Per `.claude/rules/git.md`, add an entry under `## [Unreleased]` for the user-visible behavior change (hot-reload) — use `### Changed` or `### Fixed`.
- **Don't modify completed stories** unless the current story explicitly requires it.

## Reference

- PRD: `tasks/cron-config-hot-reload/prd.md`
- Structured stories: `tasks/cron-config-hot-reload/prd.json`
- Critique: `tasks/cron-config-hot-reload/critique.md`
- Branch: `feat/47-cron-config-hot-reload`
- Issue: #47
