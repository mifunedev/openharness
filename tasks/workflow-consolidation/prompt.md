# Ralph iteration — workflow-consolidation

You are one iteration of a Ralph loop implementing the `workflow-consolidation` task. The full plan is in `tasks/workflow-consolidation/prd.md` and the structured task list is in `tasks/workflow-consolidation/prd.json`. The loop calls you again until `progress.txt` contains a line `STATUS: COMPLETE`.

## Your job in one iteration

Pick **one** user story, implement it, commit, mark it `passes: true`, and append a progress entry. Then exit. Do not attempt multiple stories per iteration.

## Steps every iteration

1. **Read context** — in this order:
   - `tasks/workflow-consolidation/prd.json` — find the lowest-`priority` story where `passes: false`. That is your story.
   - `tasks/workflow-consolidation/progress.txt` — read the `## Codebase Patterns` section at the top (it carries the critic mitigations — read it carefully) and recent iterations.
   - `tasks/workflow-consolidation/critique.md` — the critic findings the stories must satisfy.
   - `.claude/skills/git/SKILL.md` for branch + commit conventions.
   - For US-001/US-002, read the CURRENT `AGENTS.md` "The Loop" section and `context/rules/loop.md` top + See-Also before editing.

2. **Verify branch** — your branch is `feat/259-workflow-consolidation` (per `prd.json` `branchName`). If launched in an isolated worktree at `.worktrees/feat/259-workflow-consolidation`, `cd` into it. Never push to `development` or `main` directly.

3. **Implement the chosen story** — make exactly the changes in the story's `acceptanceCriteria`. Confine work to that story; resist scope creep. **This task touches EXACTLY five files** (AGENTS.md narrative section, loop.md banner+cross-refs, the new probe, RESULTS.md, CHANGELOG.md) and **no protected path / no Skills table / no `crons/*.md` / no `.claude/skills/*`** — see Codebase Patterns.

4. **Run quality checks** before commit:
   ```bash
   bash evals/probes/workflow-boundaries.sh; echo "rc=$?"     # for US-003
   for p in evals/probes/*.sh; do bash "$p" >/dev/null 2>&1 || echo "non-pass: $p ($?)"; done
   ```
   The full suite must stay regressions=0 (PASS/SKIPPED only). If a loop/autopilot/watchdog probe flips, you edited something out of scope — revert it.

5. **Commit** (per `.claude/skills/git/SKILL.md`):
   ```
   <type>: US-<NNN> — <story title>

   Submitted-by: <active submitter>
   ```
   `<type>` = `feat` (US-001/002/003 net-new doc/probe) or `task` (US-004 issue-filing). Stage only files touched by this story. The `Submitted-by:` trailer is mandatory (active harness identity, e.g. `Claude`, `Codex`, `Pi`).

6. **Update `prd.json`** — set `passes: true` for the completed story; set `notes` to a one-line summary with iteration number + date + commit.

7. **Append to `progress.txt`** (never replace):
   ```markdown
   ## US-<NNN> — <YYYY-MM-DD HH:MM UTC>

   **Title**: <story title>
   **Files changed**: <list>
   **Commit**: <short SHA>
   **Result**: PASS | BLOCKED | DEFERRED

   ### What I did
   <2-4 sentences>

   ### Learnings for future iterations
   <patterns, gotchas>

   ---
   ```

8. **Codebase Patterns** — append any newly-discovered reusable pattern to the `## Codebase Patterns` section at the **top** of `progress.txt`.

9. **Stop condition** — after step 7, if all stories in `prd.json` have `passes: true`, append a final line on its own to `progress.txt`:
   ```
   STATUS: COMPLETE
   ```

10. **Signal completion in your output only when terminal** — when (and only when) you just appended `STATUS: COMPLETE`, also print `STATUS: COMPLETE` as the sole content of your final line.

## Blocked or deferred stories

- **Blocked**: append `**Result**: BLOCKED` + explanation; do NOT mark `passes: true`.
- **Deferred** (out of scope per Non-Goals): append `**Result**: DEFERRED`; do NOT mark `passes: true`.

## Critical rules

- **One story per iteration.**
- **Never push** to `development` or `main`. Branch is `feat/259-workflow-consolidation`.
- **Never skip pre-commit hooks** (`--no-verify`).
- **Confine writes** to the five files in scope. Touch no protected path (`.claude/protected-paths.txt`), no AGENTS.md Skills table, no `crons/*.md`, no `scripts/cron-runtime.ts`, no `.claude/skills/*`.
- **Run the full probe suite before every push.** A flipped loop/autopilot/watchdog probe means out-of-scope drift — revert it.
- **CHANGELOG discipline** — US-003 adds one `[Unreleased] ### Added` line.
- **Wiki Alignment is NOT-APPLICABLE** for this task — do not create a wiki entry.

## Reference

- PRD: `tasks/workflow-consolidation/prd.md`
- Structured stories: `tasks/workflow-consolidation/prd.json`
- Branch: `feat/259-workflow-consolidation`
- Issue: #259
