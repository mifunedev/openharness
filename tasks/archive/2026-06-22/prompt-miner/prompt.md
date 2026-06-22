# Ralph iteration — prompt-miner

You are one iteration of a Ralph loop implementing the `prompt-miner` task. The full plan is in `tasks/prompt-miner/prd.md` and the structured task list is in `tasks/prompt-miner/prd.json`. The loop calls you again until `progress.txt` contains a line `STATUS: COMPLETE`.

## Your job in one iteration

Pick **one** user story, implement it, commit, mark it `passes: true`, and append a progress entry. Then exit. The next iteration handles the next story. Do not attempt multiple stories per iteration.

## Steps every iteration

1. **Read context** — in this order:
   - `tasks/prompt-miner/prd.json` — find the lowest-`priority` story where `passes: false`. That is your story for this iteration.
   - `tasks/prompt-miner/progress.txt` — read the "Codebase Patterns" section at the top (if any) and the most recent few iterations to see what's been done.
   - `tasks/prompt-miner/critique.md` — the critic findings the stories must satisfy (two-critic gate + re-gate; the cron uses `/ship-spec --repo`, NOT `/orchestrate`).
   - `tasks/prompt-miner/prd.md` `## Wiki Alignment` — `Impact: REQUIRED`; US-012 owns `wiki/prompt-miner.md`. Read `context/rules/wiki.md` when your story touches `wiki/`.
   - `.claude/skills/git/SKILL.md` for branch + commit conventions.
   - `.claude/rules/sandbox-processes.md` for tmux conventions if your story spawns processes.
   - `.claude/rules/advisor-model.md` for any critic-gated story.

2. **Verify branch** — your branch is `feat/253-prompt-miner` (per `prd.json` `branchName`). If `/ship-spec`'s Advisor launched you in an isolated worktree at `.worktrees/feat/253-prompt-miner`, that directory already has the branch checked out — `cd` into it and skip the checkout below. Otherwise, if you are not on the branch:
   ```bash
   : "${SHIP_SPEC_REMOTE:?SHIP_SPEC_REMOTE must name the git remote that matches SHIP_SPEC_REPO}"
   git fetch "$SHIP_SPEC_REMOTE" "${SHIP_SPEC_BASE:-development}"
   git checkout -b feat/253-prompt-miner "$SHIP_SPEC_REMOTE/${SHIP_SPEC_BASE:-development}" 2>/dev/null \
     || git checkout feat/253-prompt-miner
   ```
   `SHIP_SPEC_REMOTE` is `origin` (this task targets `ryaneggz/openharness`), `SHIP_SPEC_BASE` is `development`. Never push to `development` or `main` directly.

3. **Implement the chosen story** — make the file changes specified in the story's `acceptanceCriteria`. Confine the work to that story; resist scope creep. This is harness infra (skills/scripts/crons/evals/wiki) — no sandbox application code.

4. **Run quality checks** before commit:
   ```bash
   node --check .claude/skills/prompt-miner/scripts/mine-traces.mjs 2>/dev/null || true
   node --test .claude/skills/prompt-miner/scripts/__tests__/ 2>/dev/null || true
   bash evals/probes/prompt-miner-schema-compat.sh 2>/dev/null || true
   ```
   This task has no pnpm typecheck/lint (it is node built-ins + bash). If checks fail, fix them. Do not commit broken code.

5. **Commit** with this message format (per `.claude/skills/git/SKILL.md`):
   ```
   feat: US-<NNN> — <story title>

   Submitted-by: <active submitter>
   ```
   Use `feat` for net-new functionality, `task` for scaffolding/docs, `skill` for skill files. Stage only files touched by this story. The `Submitted-by:` trailer is mandatory (`$RALPH_HARNESS`, e.g. `Claude`/`Codex`/`Pi`).

6. **Update `prd.json`** — set `passes: true` for the completed story and set `notes` to a one-line summary including iteration number and date.

7. **Append to `progress.txt`** — append (never replace) using the template's per-iteration format (Title / Files changed / Commit / Result / What I did / Learnings).

8. **Codebase Patterns** — append non-obvious conventions to the `## Codebase Patterns` section at the **top** of `progress.txt`.

9. **Stop condition** — after step 7, if all stories in `prd.json` have `passes: true`, append a final standalone line to `progress.txt`:
   ```
   STATUS: COMPLETE
   ```

10. **Signal completion in your output only when terminal** — when (and only when) you just appended `STATUS: COMPLETE`, also print `STATUS: COMPLETE` as the sole content of your final line.

## Blocked or deferred stories

- **Blocked**: append with `**Result**: BLOCKED` + explanation; do NOT mark `passes: true`.
- **Deferred** (out of scope per Non-Goals): append with `**Result**: DEFERRED`; do NOT mark `passes: true`.

## Critical rules

- **One story per iteration.** Resist doing two.
- **Never push** to `development` or `main`. Branch is `feat/253-prompt-miner`.
- **Never skip pre-commit hooks** (`--no-verify`).
- **Never run `git clone` or `git init`** — you're already in a checkout.
- **Confine writes** to repo-tracked paths. Never write raw session transcripts or `--include-prompt-text` output into git — engine artifacts go to gitignored `memory/<date>/`.
- **Origin-only.** Ground-truth cross-ref, the cron issue, and the cron PR all target `origin` (`ryaneggz/openharness` / `origin/development`) — never `upstream`/mifunedev.
- **Phase ordering matters.** Implement in `priority` order; the engine stories (US-001..US-006) precede references/skill/cron/probe/registration/wiki.
- **CHANGELOG discipline.** Per `.claude/skills/git/SKILL.md`, add an `## [Unreleased]` entry for user-visible stories in the same commit.
- **Additive edits only** to `CLAUDE.md`, `crons/README.md`, `scripts/README.md`, `evals/RESULTS.md` — single rows, no deletions, no protected-path removal.
- **Don't modify completed stories** unless the current story explicitly requires it.

## Reference

- PRD: `tasks/prompt-miner/prd.md`
- Structured stories: `tasks/prompt-miner/prd.json`
- Branch: `feat/253-prompt-miner`
- Issue: #253 (ryaneggz/openharness)
