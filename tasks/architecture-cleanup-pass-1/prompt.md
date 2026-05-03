# Ralph iteration — architecture-cleanup-pass-1

You are one iteration of a Ralph loop executing the first architecture-cleanup pass after the v0.7 convergence. The full plan is in `tasks/architecture-cleanup-pass-1/prd.md` and the structured task list is in `tasks/architecture-cleanup-pass-1/prd.json`. The loop calls you again until `progress.txt` contains a line `STATUS: COMPLETE`.

## Your job in one iteration

Pick **one** user story, implement it, commit, mark it `passes: true`, and append a progress entry. Then exit. The next iteration handles the next story. Do not attempt multiple stories per iteration.

## Steps every iteration

1. **Read context** — in this order:
   - `tasks/architecture-cleanup-pass-1/prd.json` — find the lowest-`priority` story where `passes: false`. That is your story for this iteration.
   - `tasks/architecture-cleanup-pass-1/progress.txt` — read the "Codebase patterns" section at the top (if any) and the most recent few iterations to see what's been done.
   - `tasks/architecture-cleanup-pass-1/prd.md` — the human-readable story narrative (matches `prd.json`).
   - `.claude/plans/i-want-to-improve-delightful-honey.md` — the planning document this PRD was derived from; useful for non-goals and "what NOT to do" context.
   - `.claude/rules/git.md` for branch + commit conventions.
   - `.claude/rules/sandbox-processes.md` for tmux session conventions if your story spawns processes.
   - `.claude/rules/advisor-model.md` for the critic-spawn pattern (US-003, US-005, US-006 are critic-gated).

2. **Verify branch** — your branch is `audit/213-architecture-cleanup-pass-1` (per `prd.json` `branchName`). If you are not on it:
   ```bash
   git fetch origin
   git checkout -b audit/213-architecture-cleanup-pass-1 origin/development 2>/dev/null \
     || git checkout audit/213-architecture-cleanup-pass-1
   ```
   Never push to `development` or `main` directly.

3. **Implement the chosen story** — make the file changes, additions, deletions specified in the story's `acceptanceCriteria`. Confine the work to that story; resist scope creep.

4. **Critic gate (US-003, US-005, US-006 only)** — before any destructive action, spawn `.claude/agents/critic.md` via the Task tool with `subagent_type: "critic"`. Pass the deletion list / candidate list / PR diff and capture the Risk Assessment in the commit body. Do not proceed if any high-severity finding lacks a documented mitigation.

5. **Run quality checks** before commit:
   ```bash
   pnpm run lint 2>/dev/null || true
   pnpm run test 2>/dev/null || true
   ```
   The pre-commit hook (`.husky/pre-commit`) also runs these. If checks fail, fix them. Do not commit broken code.

6. **Commit** with this message format (per `.claude/rules/git.md`):
   ```
   <type>: US-<NNN> — <story title>
   ```
   Where `<type>` is `audit` for story-level cleanup commits in this task (matches the issue prefix), `task` if a story is mostly housekeeping, `fix` for bugs. Stage only files touched by this story. Co-author trailer optional but consistent with the convergence task.

7. **Update `prd.json`** — set `passes: true` for the completed story, and set `notes` to a one-line summary including iteration number, date, and short SHA:
   ```json
   "notes": "Completed iteration 3 on 2026-05-02; commit abc1234"
   ```

8. **Append to `progress.txt`** — append (never replace) using this format:
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

9. **Codebase Patterns** — if you discovered a pattern other iterations should know (a non-obvious convention, a shared utility, a gotcha), append it to (or create) the `## Codebase Patterns` section at the **top** of `progress.txt`. Keep entries general and reusable, not story-specific.

10. **Stop condition** — after step 8, check whether all stories in `prd.json` now have `passes: true`. If yes, append a final line on its own to `progress.txt`:
    ```
    STATUS: COMPLETE
    ```
    This terminates the Ralph loop. The loop runner reads `progress.txt` for this exact string at the start of each iteration.

11. **End response normally** — do not emit any completion sentinel in your reply text. Only the `STATUS: COMPLETE` line in `progress.txt` matters.

## Blocked or deferred stories

If the chosen story cannot be completed this iteration:

- **Blocked** (external dependency, missing context, ambiguity): append to `progress.txt` with `**Result**: BLOCKED` and an explanation. Do NOT mark `passes: true`. The next iteration will skip this story (find the next lowest-priority `passes: false` that isn't already BLOCKED in recent progress entries) or escalate.
- **Deferred** (out of scope per the PRD's Non-Goals): append with `**Result**: DEFERRED`. Do NOT mark `passes: true`. The story stays for human review.

## Non-goals reminder

The plan at `.claude/plans/i-want-to-improve-delightful-honey.md` § "What NOT to do" lists explicit non-goals — do not delete any of:

- `.devcontainer/docker-compose.cloudflared.yml`, `docker-compose.git.yml`, `docker-compose.gateway.yml` (or any of the 9 overlays)
- `install/cloudflared-tunnel.sh`, `install/banner.sh`
- `.claude/plans/` directory (gitignored session artifacts)
- `tasks/openharness-v07-convergence/` (already STATUS: COMPLETE; the cleanup cron archives it next Sunday)

No new skills, no new crons, no new sub-agents — restored skills + existing critic agent already cover the need. No SPEC v0.8 bump.
