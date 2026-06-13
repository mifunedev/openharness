# Ralph iteration — cron-schedule-fault-isolation

You are one iteration of a Ralph loop implementing the `cron-schedule-fault-isolation` task. The full plan is in `tasks/cron-schedule-fault-isolation/prd.md` and the structured task list is in `tasks/cron-schedule-fault-isolation/prd.json`. The loop calls you again until `progress.txt` contains a line `STATUS: COMPLETE`.

## Your job in one iteration

Pick **one** user story, implement it, commit, mark it `passes: true`, and append a progress entry. Then exit. The next iteration handles the next story. Do not attempt multiple stories per iteration.

## Scope (hard boundary)

Harness-infra only. Touch ONLY these files:
- `scripts/cron-runtime.ts`
- `scripts/__tests__/cron-runtime.test.ts`
- `crons/README.md`

Do not touch sandbox application code, other skills, or other crons. `scripts/cron-runtime.ts` is on `.claude/protected-paths.txt` — you are MODIFYING it (permitted), never deleting it.

## Steps every iteration

1. **Read context** — in this order:
   - `tasks/cron-schedule-fault-isolation/prd.json` — find the lowest-`priority` story where `passes: false`. That is your story for this iteration.
   - `tasks/cron-schedule-fault-isolation/prd.md` — the full ACs and Technical Considerations for that story.
   - `tasks/cron-schedule-fault-isolation/progress.txt` — read the "Codebase Patterns" section at the top (if any) and the most recent few iterations to see what's been done.
   - `tasks/cron-schedule-fault-isolation/critique.md` — the critic findings the stories must satisfy (especially the US-001 croner-probe details and the US-002 distinct-skip-paths boundary).
   - `.claude/rules/git.md` for branch + commit conventions.

2. **Verify branch** — your branch is `feat/67-cron-schedule-fault-isolation` (per `prd.json` `branchName`). If you are not on it:
   ```bash
   git fetch origin
   git checkout -b feat/67-cron-schedule-fault-isolation origin/development 2>/dev/null \
     || git checkout feat/67-cron-schedule-fault-isolation
   ```
   Never push to `development` or `main` directly.

3. **Implement the chosen story** — make the file changes specified in the story's `acceptanceCriteria`. Confine the work to that story; resist scope creep.

4. **Run quality checks** before commit (use the repo's real scripts):
   ```bash
   pnpm run typecheck 2>/dev/null || true
   pnpm run lint 2>/dev/null || true
   pnpm run test:scripts          # vitest run over scripts/__tests__ — MUST pass
   ```
   `pnpm run test:scripts` is the authoritative gate for this task (the cron-runtime tests live there). If checks fail, fix them. Do not commit broken code.

5. **Commit** with this message format (per `.claude/rules/git.md`):
   ```
   <type>: US-<NNN> — <story title>

   Submitted-by: <active submitter>
   ```
   Where `<type>` is `feat` for US-001/002/003 (net-new runtime behavior) and `task` or `feat` for US-004 (docs). Stage only files touched by this story.
   The `Submitted-by:` trailer is mandatory and must name the active harness identity (`$RALPH_HARNESS`, e.g. `Claude` or `Codex`). If Ralph fell back from Claude to Codex, use `Submitted-by: Codex`.

6. **Update `prd.json`** — set `passes: true` for the completed story, and set `notes` to a one-line summary including iteration number and date:
   ```json
   "notes": "Completed iteration N on <YYYY-MM-DD>; commit abc1234"
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
   This terminates the Ralph loop. The loop runner reads `progress.txt` for this exact string at the start of each iteration.

10. **End response normally** — do not emit any completion sentinel in your reply text. Only the `STATUS: COMPLETE` line in `progress.txt` matters.

## Blocked or deferred stories

If the chosen story cannot be completed this iteration:

- **Blocked** (external dependency, missing context, ambiguity): append to `progress.txt` with `**Result**: BLOCKED` and an explanation. Do NOT mark `passes: true`.
- **Deferred** (out of scope per the PRD's Non-Goals): append with `**Result**: DEFERRED`. Do NOT mark `passes: true`.

## Critical rules

- **One story per iteration.** Resist doing two.
- **Never push** to `development` or `main`. Branch is `feat/67-cron-schedule-fault-isolation`.
- **Never skip pre-commit hooks** (`--no-verify`).
- **Never run `git clone` or `git init`** — you're already in a checkout.
- **Confine writes** to the three in-scope files. Do not write outside the repo or to `~/`.
- **Phase ordering matters.** Implement stories in `priority` order (US-001 → US-002 → US-003 → US-004): US-002/003 depend on `isValidSchedule` from US-001.
- **CHANGELOG discipline.** Per `.claude/rules/git.md`, this change is harness-infra reliability with user-visible (operator-visible) impact — add a one-line `### Added` or `### Fixed` entry under `## [Unreleased]` in `CHANGELOG.md` in the same commit as US-003 (the behavior change), if a CHANGELOG exists. (Add `CHANGELOG.md` to the touched-files allowance for that one commit.)
- **Don't modify completed stories** unless the current story explicitly requires it.

## Reference

- PRD: `tasks/cron-schedule-fault-isolation/prd.md`
- Structured stories: `tasks/cron-schedule-fault-isolation/prd.json`
- Critique: `tasks/cron-schedule-fault-isolation/critique.md`
- Branch: `feat/67-cron-schedule-fault-isolation`
- Issue: #67
