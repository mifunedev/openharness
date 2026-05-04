# Ralph iteration — deepagents-cli-support

You are one iteration of a Ralph loop adding DeepAgents CLI as a supported Open Harness runtime. The full plan is in `tasks/deepagents-cli-support/prd.md`, the structured task list is in `tasks/deepagents-cli-support/prd.json`, and the critic gate is in `tasks/deepagents-cli-support/critique.md`. The loop calls you again until `progress.txt` contains a line `STATUS: COMPLETE`.

## Your job in one iteration

Pick **one** user story, implement it, commit, mark it `passes: true`, and append a progress entry. Then exit. The next iteration handles the next story. Do not attempt multiple stories per iteration.

## Steps every iteration

1. **Read context** — in this order:
   - `tasks/deepagents-cli-support/prd.json` — find the lowest-`priority` story where `passes: false`. That is your story for this iteration.
   - `tasks/deepagents-cli-support/prd.md` — read the user story's full description and rationale.
   - `tasks/deepagents-cli-support/critique.md` — preserve the mitigations from the critic gate, especially the DeepAgents shell allow-list and protected-path constraints.
   - `tasks/deepagents-cli-support/progress.txt` — read the "Codebase Patterns" section at the top, if present, and the most recent few iterations.
   - `.claude/protected-paths.txt` — protected entries must not be deleted or deprecated without an explicit override note.
   - `.claude/rules/git.md` for branch, commit, changelog, and worktree conventions.
   - `.claude/rules/sandbox-processes.md` if your story touches tmux or long-running process guidance.

2. **Verify branch** — your branch is `feat/237-deepagents-cli-support` (per `prd.json` `branchName`). If you are not on it:
   ```bash
   git fetch origin
   git checkout -b feat/237-deepagents-cli-support origin/development 2>/dev/null \
     || git checkout feat/237-deepagents-cli-support
   ```
   Never push to `development` or `main` directly.

3. **Implement the chosen story** — make only the changes required by that story's `acceptanceCriteria`. Keep changes additive and conservative around protected files such as `.devcontainer/Dockerfile`, `.devcontainer/entrypoint.sh`, `install/banner.sh`, and `scripts/ralph.sh`.

4. **DeepAgents safety constraints** — when working on Ralph support, do not default to unrestricted shell execution. The default DeepAgents flags must use `--shell-allow-list recommended`; `--shell-allow-list all` is only allowed through an explicit operator override such as `RALPH_DEEPAGENTS_FLAGS`. Include a per-call `--max-turns` cap through `RALPH_DEEPAGENTS_MAX_TURNS`.

5. **Run quality checks** before commit:
   ```bash
   pnpm run lint 2>/dev/null || true
   pnpm run test 2>/dev/null || true
   ```
   For docs changes, also run `pnpm docs:build` when practical. The pre-commit hook runs lint + test; do not bypass with `--no-verify`.

6. **Commit** with this message format (per `.claude/rules/git.md`):
   ```
   feat: US-<NNN> — <story title>
   ```
   Example: `feat: US-001 — install DeepAgents in the sandbox image`. Stage only files touched by this story.

7. **Update `prd.json`** — set `passes: true` for the completed story, and set `notes` to a one-line summary including iteration number, date, and short commit SHA:
   ```json
   "notes": "Completed iteration 1 on 2026-05-04; commit abc1234"
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

9. **Codebase Patterns** — if you discovered a pattern other iterations should know, append it to or create the `## Codebase Patterns` section at the **top** of `progress.txt`.

10. **Stop condition** — after step 8, check whether all stories in `prd.json` now have `passes: true`. If yes, append a final line on its own to `progress.txt`:
   ```
   STATUS: COMPLETE
   ```
   This terminates the Ralph loop.

11. **End response normally** — do not emit any completion sentinel in your reply text. Only the `STATUS: COMPLETE` line in `progress.txt` matters.

## Critical rules

- **One story per iteration.** Resist doing two.
- **Never push** to `development` or `main`. Branch is `feat/237-deepagents-cli-support`.
- **Never skip pre-commit hooks** (`--no-verify`).
- **Never run `git clone` or `git init`** — you are already in a checkout.
- **Do not delete protected paths.** `.claude/protected-paths.txt` is authoritative; any deletion/deprecation of an entry requires an explicit override note and human review.
- **Preserve existing agents.** Claude Code, Codex, OpenCode, and Pi support must remain intact.
- **Do not commit secrets.** Provider keys belong in `~/.deepagents/.env` or ignored local files, not in tracked docs or repo-local `.deepagents/`.
- **CHANGELOG discipline.** US-006 owns the release note; do not add duplicate changelog entries in earlier story commits unless the story explicitly requires it.

## Reference

- PRD: `tasks/deepagents-cli-support/prd.md`
- Critique: `tasks/deepagents-cli-support/critique.md`
- Structured stories: `tasks/deepagents-cli-support/prd.json`
- Branch: `feat/237-deepagents-cli-support`
- Issue: [#237](https://github.com/ryaneggz/open-harness/issues/237)
- Related prior art: [#130](https://github.com/ryaneggz/open-harness/issues/130) and closed PR #131
