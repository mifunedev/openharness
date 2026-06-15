# Ralph iteration — autopilot-stray-wip-guard

You are one iteration of a Ralph loop implementing the `autopilot-stray-wip-guard` task. The full plan is in `tasks/autopilot-stray-wip-guard/prd.md` and the structured task list is in `tasks/autopilot-stray-wip-guard/prd.json`. The loop calls you again until `progress.txt` contains a line `STATUS: COMPLETE`.

## Your job in one iteration

Pick **one** user story, implement it, commit, mark it `passes: true`, and append a progress entry. Then exit. The next iteration handles the next story. Do not attempt multiple stories per iteration.

## Steps every iteration

1. **Read context** — in this order:
   - `tasks/autopilot-stray-wip-guard/prd.json` — find the lowest-`priority` story where `passes: false`. That is your story for this iteration.
   - `tasks/autopilot-stray-wip-guard/progress.txt` — read the "Codebase Patterns" section at the top (if any) and the most recent few iterations to see what's been done.
   - `tasks/autopilot-stray-wip-guard/critique.md` — if present, the critic findings the stories must satisfy.
   - `.claude/rules/git.md` for branch + commit conventions.
   - `.claude/rules/sandbox-processes.md` for tmux session conventions if your story spawns processes.
   - `.claude/rules/advisor-model.md` for any critic-gated story.

2. **Verify branch** — your branch is `feat/63-autopilot-stray-wip-guard` (per `prd.json` `branchName`). If you are not on it:
   ```bash
   git fetch origin
   git checkout -b feat/63-autopilot-stray-wip-guard origin/development 2>/dev/null \
     || git checkout feat/63-autopilot-stray-wip-guard
   ```
   Never push to `development` or `main` directly.

3. **Implement the chosen story** — make the file changes, additions, deletions specified in the story's `acceptanceCriteria`. Confine the work to that story; resist scope creep.

4. **Run quality checks** before commit:
   ```bash
   pnpm run type-check 2>/dev/null || true
   pnpm run lint 2>/dev/null || true
   pnpm run test 2>/dev/null || true
   ```
   If checks fail, fix them. Do not commit broken code.

5. **Commit** with this message format (per `.claude/rules/git.md`):
   ```
   <type>: US-<NNN> — <story title>

   Submitted-by: <active submitter>
   ```
   Where `<type>` is `task` for most stories, `feat` for net-new functionality, `fix` for bugs. Example: `task: US-001 — <story title>`. Stage only files touched by this story.
   The `Submitted-by:` trailer is mandatory. It must name the model/agent that actually submits the commit, using the active harness identity when available (`$RALPH_HARNESS`, e.g. `Claude`, `Codex`, or `Pi`). If Ralph fell back from Claude to Codex, use `Submitted-by: Codex`.

6. **Update `prd.json`** — set `passes: true` for the completed story, and set `notes` to a one-line summary including iteration number and date:
   ```json
   "notes": "Completed iteration 3 on <YYYY-MM-DD>; commit abc1234"
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

8. **Codebase Patterns** — if you discovered a pattern other iterations should know (a non-obvious convention, a shared utility, a gotcha), append it to (or create) the `## Codebase Patterns` section at the **top** of `progress.txt`. Keep entries general and reusable, not story-specific.

9. **Stop condition** — after step 7, check whether all stories in `prd.json` now have `passes: true`. If yes, append a final line on its own to `progress.txt`:
   ```
   STATUS: COMPLETE
   ```
   This terminates the Ralph loop. The loop runner reads `progress.txt` for this exact string at the start of each iteration.

10. **End response normally** — do not emit any completion sentinel in your reply text. Only the `STATUS: COMPLETE` line in `progress.txt` matters.

## Blocked or deferred stories

If the chosen story cannot be completed this iteration:

- **Blocked** (external dependency, missing context, ambiguity): append to `progress.txt` with `**Result**: BLOCKED` and an explanation. Do NOT mark `passes: true`. The next iteration will skip this story (find the next lowest-priority `passes: false` that isn't already BLOCKED in recent progress entries) or escalate.
- **Deferred** (out of scope per the PRD's Non-Goals): append with `**Result**: DEFERRED`. Do NOT mark `passes: true`. The story stays for human review.

## Critical rules

- **One story per iteration.** Resist doing two.
- **Never push** to `development` or `main`. Branch is `feat/63-autopilot-stray-wip-guard`.
- **Never skip pre-commit hooks** (`--no-verify`).
- **Never run `git clone` or `git init`** — you're already in a checkout.
- **Confine writes** to repo-tracked paths. Do not write outside the repo or to `~/`.
- **Phase ordering matters.** Stories are priority-ordered by dependency — implement them in `priority` order. If a story depends on an artifact a later story creates, it is mis-ordered; surface it rather than implementing out of order.
- **CHANGELOG discipline.** Per `.claude/rules/git.md`, every story with user-visible impact must add an entry under `## [Unreleased]` in the same commit. The PRD's individual stories spell out which `### Added`, `### Removed`, `### Changed` section to use.
- **Don't modify completed stories** unless the current story explicitly requires it.

## Reference

- PRD: `tasks/autopilot-stray-wip-guard/prd.md`
- Structured stories: `tasks/autopilot-stray-wip-guard/prd.json`
- Branch: `feat/63-autopilot-stray-wip-guard`
- Issue: #63
