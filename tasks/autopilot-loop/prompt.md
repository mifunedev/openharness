# Ralph iteration — autopilot-loop

You are one iteration of a Ralph loop implementing the `autopilot-loop` task. The full plan is in `tasks/autopilot-loop/prd.md` and the structured task list is in `tasks/autopilot-loop/prd.json`. The loop calls you again until `progress.txt` contains a line `STATUS: COMPLETE`.

## Your job in one iteration

Pick **one** user story, implement it, commit, mark it `passes: true`, and append a progress entry. Then exit. The next iteration handles the next story. Do not attempt multiple stories per iteration.

## Steps every iteration

1. **Read context** — in this order:
   - `tasks/autopilot-loop/prd.json` — find the lowest-`priority` story where `passes: false`. That is your story for this iteration.
   - `tasks/autopilot-loop/progress.txt` — read the "Codebase Patterns" section at the top (if any) and the most recent few iterations to see what's been done.
   - `tasks/autopilot-loop/critique.md` — the critic findings the stories must satisfy (7 HIGH, resolved in-place; see prd.md `## Critic-gate mitigations`).
   - `.claude/rules/git.md` for branch + commit conventions.
   - `.claude/rules/sandbox-processes.md` for tmux session conventions if your story spawns processes.
   - `.claude/rules/advisor-model.md` for any critic-gated story.

2. **Verify branch** — your branch is `feat/4-autopilot-loop` (per `prd.json` `branchName`). If you are not on it:
   ```bash
   git fetch origin
   git checkout -b feat/4-autopilot-loop origin/development 2>/dev/null \
     || git checkout feat/4-autopilot-loop
   ```
   Never push to `development` or `main` directly.

3. **Implement the chosen story** — make the file changes specified in the story's `acceptanceCriteria`. Confine the work to that story; resist scope creep. Precedents to mirror: `.claude/skills/health-check/SKILL.md`, `.claude/skills/skill-lint/SKILL.md` (skill shape); `crons/heartbeat.md` (cron shape + closing liveness line).

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
   ```
   `<type>` is `feat` for the skill/cron/backlog (net-new), `task`/`docs` for the doc edits. Stage only files touched by this story.

6. **Update `prd.json`** — set `passes: true` for the completed story, and set `notes` to a one-line summary including iteration number and date.

7. **Append to `progress.txt`** — append (never replace) using the format:
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

8. **Codebase Patterns** — if you discovered a reusable pattern, append it to the `## Codebase Patterns` section at the **top** of `progress.txt`.

9. **Stop condition** — after step 7, if all stories in `prd.json` have `passes: true`, append a final line on its own to `progress.txt`:
   ```
   STATUS: COMPLETE
   ```

10. **End response normally** — only the `STATUS: COMPLETE` line in `progress.txt` matters.

## Blocked or deferred stories

- **Blocked**: append with `**Result**: BLOCKED` + explanation; do NOT mark `passes: true`.
- **Deferred** (out of scope per Non-Goals): append with `**Result**: DEFERRED`; do NOT mark `passes: true`.

## Critical rules

- **One story per iteration.** Resist doing two.
- **Never push** to `development` or `main`. Branch is `feat/4-autopilot-loop`.
- **Never skip pre-commit hooks** (`--no-verify`).
- **Never run `git clone` or `git init`** — you're already in a checkout.
- **Confine writes** to repo-tracked paths.
- **Phase ordering matters.** Implement in `priority` order; surface mis-ordering rather than implementing out of order.
- **Do NOT touch `crons/heartbeat.md` or `scripts/cron-runtime.ts`** (explicit Non-Goals).
- **CHANGELOG discipline** — US-006 owns the `## [Unreleased]` `### Added` entry.
- **Don't modify completed stories** unless the current story explicitly requires it.

## Reference

- PRD: `tasks/autopilot-loop/prd.md`
- Structured stories: `tasks/autopilot-loop/prd.json`
- Branch: `feat/4-autopilot-loop`
- Issue: #4
