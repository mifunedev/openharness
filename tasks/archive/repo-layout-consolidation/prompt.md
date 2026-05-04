# Ralph iteration — repo-layout-consolidation

You are one iteration of a Ralph loop converging the OpenHarness repo's self-description against reality. The full plan is in `tasks/repo-layout-consolidation/prd.md` and the structured task list is in `tasks/repo-layout-consolidation/prd.json`. The loop calls you again until `progress.txt` contains a line `STATUS: COMPLETE`.

## Your job in one iteration

Pick **one** user story, implement it, commit, mark it `passes: true`, and append a progress entry. Then exit. The next iteration handles the next story. Do not attempt multiple stories per iteration.

## Steps every iteration

1. **Read context** — in this order:
   - `tasks/repo-layout-consolidation/prd.json` — find the lowest-`priority` story where `passes: false`. That is your story for this iteration.
   - `tasks/repo-layout-consolidation/prd.md` — read the user story's full description and rationale.
   - `tasks/repo-layout-consolidation/progress.txt` — read the "Codebase Patterns" section at the top (if any) and the most recent few iterations to see what's been done.
   - `.claude/plans/we-can-focus-on-cuddly-harp.md` — the canonical plan with full file-by-file edits, exact replacement text, and acceptance criteria for both PR-A (this task) and PR-B (the stacked follow-up).
   - `.claude/rules/git.md` for branch + commit conventions.
   - `.claude/rules/sandbox-processes.md` if your story interacts with tmux conventions (US-001 mentions the system-cron session in the canonical tree annotation).

2. **Verify branch** — your branch is `feat/235-repo-layout-consolidation` (per `prd.json` `branchName`). If you are not on it:
   ```bash
   git fetch origin
   git checkout -b feat/235-repo-layout-consolidation origin/development 2>/dev/null \
     || git checkout feat/235-repo-layout-consolidation
   ```
   Never push to `development` or `main` directly.

3. **Implement the chosen story** — make the file changes specified in the story's `acceptanceCriteria`. The plan file (`.claude/plans/we-can-focus-on-cuddly-harp.md`) carries the **exact replacement text** for nearly every story — use it verbatim rather than re-deriving. Confine the work to one story; resist scope creep.

4. **Run quality checks** before commit:
   ```bash
   pnpm run lint 2>/dev/null || true
   pnpm run test 2>/dev/null || true
   ```
   This is a doc-only PR, so type checks are not load-bearing. The pre-commit hook runs lint + test; do not bypass with `--no-verify`.

5. **Commit** with this message format (per `.claude/rules/git.md`):
   ```
   feat: US-<NNN> — <story title>
   ```
   Example: `feat: US-001 — rewrite canonical tree in container-runtime.md`. Stage only files touched by this story.

6. **Update `prd.json`** — set `passes: true` for the completed story, and set `notes` to a one-line summary including iteration number, date, and short commit SHA:
   ```json
   "notes": "Completed iteration 1 on 2026-05-03; commit abc1234"
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

8. **Codebase Patterns** — if you discovered a pattern other iterations should know (e.g. a doc-link convention, a Docusaurus anchor gotcha, the symlink-edit-once trick for `CLAUDE.md` → `AGENTS.md`), append it to (or create) the `## Codebase Patterns` section at the **top** of `progress.txt`.

9. **Stop condition** — after step 7, check whether all stories in `prd.json` now have `passes: true`. If yes, append a final line on its own to `progress.txt`:
   ```
   STATUS: COMPLETE
   ```
   This terminates the Ralph loop.

10. **End response normally** — do not emit any completion sentinel in your reply text. Only the `STATUS: COMPLETE` line in `progress.txt` matters.

## Blocked or deferred stories

- **Blocked** (e.g. parallel `.devcontainer/` session has not landed yet and US-005 conflicts on `.devcontainer/.example.env` lines): append with `**Result**: BLOCKED` and an explanation. Do NOT mark `passes: true`. Next iteration will skip and pick the next lowest-priority `passes: false` story.
- **Deferred** (out of scope per the PRD's Non-Goals): append with `**Result**: DEFERRED`. Do NOT mark `passes: true`. Stays for human review.

## Critical rules

- **One story per iteration.** Resist doing two.
- **Never push** to `development` or `main`. Branch is `feat/235-repo-layout-consolidation`.
- **Never skip pre-commit hooks** (`--no-verify`).
- **Never run `git clone` or `git init`** — you're already in a checkout.
- **Confine writes** to repo-tracked paths. No writes outside the repo or to `~/`.
- **Phase ordering matters.** US-001 (canonical tree rewrite) must complete before US-002, US-003, US-004 reference the `{#repo-layout}` anchor — those stories link to it. US-008 (the new `.claude/rules/repo-layout-source.md`) is independent and can run early or late.
- **The plan file is the spec.** When acceptance criteria say "per the plan file §X", read that section and use the exact replacement text. Don't paraphrase — drift is exactly what we're fixing.
- **Don't touch behavioural `.devcontainer/` files** — only `.devcontainer/.example.env` (a comment block) is in scope. If the parallel `.devcontainer/` session has touched lines 43-51, mark US-005 as BLOCKED until that PR lands.
- **CHANGELOG discipline** is one story (US-009), not appended to every commit. Each story's commit can mention the change but the actual `## [Unreleased]` entry is added in the US-009 commit.
- **Don't modify completed stories** unless the current story explicitly requires it.

## Reference

- PRD: `tasks/repo-layout-consolidation/prd.md`
- Plan: `.claude/plans/we-can-focus-on-cuddly-harp.md` (full canonical content + exact replacement text)
- Structured stories: `tasks/repo-layout-consolidation/prd.json`
- Branch: `feat/235-repo-layout-consolidation`
- Issue: [#235](https://github.com/ryaneggz/open-harness/issues/235)
- Stacked PR: PR-B (crons & heartbeats canonical doc) will branch off this branch after PR-A merges.
