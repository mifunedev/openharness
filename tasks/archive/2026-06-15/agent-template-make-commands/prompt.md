# Ralph iteration — agent-template-make-commands

You are one iteration of a Ralph loop implementing the `agent-template-make-commands` task. The full plan is in `tasks/agent-template-make-commands/prd.md` and the structured task list is in `tasks/agent-template-make-commands/prd.json`. The loop calls you again until `progress.txt` contains a line `STATUS: COMPLETE`.

This is a **documentation-correctness** task: the only file you edit is `.github/ISSUE_TEMPLATE/agent.md`. There is no application code to change. The relevant quality gate is `pnpm format:check` (markdown formatting), not type-check.

## Your job in one iteration

Pick **one** user story, implement it, commit, mark it `passes: true`, and append a progress entry. Then exit. The next iteration handles the next story. Do not attempt multiple stories per iteration.

## Steps every iteration

1. **Read context** — in this order:
   - `tasks/agent-template-make-commands/prd.json` — find the lowest-`priority` story where `passes: false`. That is your story for this iteration.
   - `tasks/agent-template-make-commands/progress.txt` — read the "Codebase Patterns" section at the top (if any) and the most recent few iterations.
   - `tasks/agent-template-make-commands/critique.md` — the 2-critic findings the stories must satisfy (esp. the worktree/framing coherence and verify-checklist enumeration findings).
   - `.github/ISSUE_TEMPLATE/agent.md` — the file you are correcting; read it fully first.
   - `Makefile` — the source of truth for real targets (`sandbox, shell, destroy, stop, logs, ps, restart, config, help`); `shell` takes a positional container arg (lines 34–40), not `NAME=`.
   - `CLAUDE.md` §Lifecycle and `context/rules/git.md` §Worktrees — for the manual `git worktree add` convention and `make shell` prose.
   - `.claude/rules/git.md` for branch + commit conventions.

2. **Verify branch** — your branch is `feat/71-agent-template-make-commands` (per `prd.json` `branchName`). If you are not on it:
   ```bash
   git fetch origin
   git checkout -b feat/71-agent-template-make-commands origin/development 2>/dev/null \
     || git checkout feat/71-agent-template-make-commands
   ```
   Never push to `development` or `main` directly.

3. **Implement the chosen story** — make the edits specified in the story's `acceptanceCriteria`, confined to `.github/ISSUE_TEMPLATE/agent.md`. Resist scope creep. Do NOT touch the frontmatter or any section above `### 1. Provision the agent` (US-003 guards this); the Metadata `branch`/`worktree_path` fields are intentionally preserved.

4. **Run quality checks** before commit:
   ```bash
   pnpm format:check 2>/dev/null || pnpm run format:check 2>/dev/null || true
   ```
   If the format check flags `agent.md`, run `pnpm format` (or the project formatter) and re-stage. Do not commit a file that fails format:check.

5. **Commit** with this message format (per `.claude/rules/git.md`):
   ```
   fix: US-<NNN> — <story title>

   Submitted-by: <active submitter>
   ```
   Stage only `.github/ISSUE_TEMPLATE/agent.md` (and `tasks/agent-template-make-commands/` state files). The `Submitted-by:` trailer is mandatory and must name the active harness identity (`$RALPH_HARNESS`, e.g. `Claude`, `Codex`, or `Pi`).

6. **Update `prd.json`** — set `passes: true` for the completed story, and set `notes` to a one-line summary:
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

8. **Codebase Patterns** — if you discovered a reusable pattern, append it to the `## Codebase Patterns` section at the **top** of `progress.txt`.

9. **Stop condition** — after step 7, check whether all stories in `prd.json` now have `passes: true`. If yes, append a final line on its own to `progress.txt`:
   ```
   STATUS: COMPLETE
   ```
   This terminates the Ralph loop.

10. **End response normally** — do not emit any completion sentinel in your reply text. Only the `STATUS: COMPLETE` line in `progress.txt` matters.

## Blocked or deferred stories

- **Blocked** (missing context, ambiguity): append with `**Result**: BLOCKED` and an explanation. Do NOT mark `passes: true`.
- **Deferred** (out of scope per the PRD's Non-Goals): append with `**Result**: DEFERRED`. Do NOT mark `passes: true`.

## Critical rules

- **One story per iteration.** Resist doing two.
- **Never push** to `development` or `main`. Branch is `feat/71-agent-template-make-commands`.
- **Never skip pre-commit hooks** (`--no-verify`).
- **Never run `git clone` or `git init`** — you're already in a checkout.
- **Confine writes** to `.github/ISSUE_TEMPLATE/agent.md` and `tasks/agent-template-make-commands/`. Do NOT modify the `Makefile`, `CLAUDE.md`, other templates, or workspace files (PRD Non-Goals).
- **No CHANGELOG entry** is required: this corrects a broken internal issue template (a pure docs/chore fix with no user-facing runtime impact), per `.claude/rules/git.md` ("Skip entries only for pure chores").
- **Don't modify completed stories** unless the current story explicitly requires it.

## Reference

- PRD: `tasks/agent-template-make-commands/prd.md`
- Structured stories: `tasks/agent-template-make-commands/prd.json`
- Critique: `tasks/agent-template-make-commands/critique.md`
- Branch: `feat/71-agent-template-make-commands`
- Issue: #71
