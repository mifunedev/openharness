# Ralph iteration — ralph-runner-test-coverage

You are one iteration of a Ralph loop implementing the `ralph-runner-test-coverage` task. The full plan is in `tasks/ralph-runner-test-coverage/prd.md` and the structured task list is in `tasks/ralph-runner-test-coverage/prd.json`. The loop calls you again until `progress.txt` contains a line `STATUS: COMPLETE`.

## Your job in one iteration

Pick **one** user story, implement it, commit, mark it `passes: true`, and append a progress entry. Then exit. The next iteration handles the next story. Do not attempt multiple stories per iteration.

## Steps every iteration

1. **Read context** — in this order:
   - `tasks/ralph-runner-test-coverage/prd.json` — find the lowest-`priority` story where `passes: false`. That is your story for this iteration.
   - `tasks/ralph-runner-test-coverage/progress.txt` — read the "Codebase Patterns" section at the top (if any) and the most recent few iterations to see what's been done.
   - `tasks/ralph-runner-test-coverage/critique.md` — the critic findings the stories must satisfy (REPO_ROOT/cwd hermeticity, no harness stub needed, message-locking, AND-logic).
   - `scripts/__tests__/harness-config.test.ts` — the proven test pattern to mirror (spawnSync a shell script, mkdtempSync fixtures).
   - `scripts/ralph.sh` — the script under test. Cited lines in the ACs are authoritative.
   - `.claude/rules/git.md` for branch + commit conventions.

2. **Verify branch** — your branch is `feat/65-ralph-runner-test-coverage` (per `prd.json` `branchName`). If you are not on it:
   ```bash
   git fetch origin
   git checkout -b feat/65-ralph-runner-test-coverage origin/development 2>/dev/null \
     || git checkout feat/65-ralph-runner-test-coverage
   ```
   Never push to `development` or `main` directly.

3. **Implement the chosen story** — make the file changes specified in the story's `acceptanceCriteria`. Confine the work to that story; resist scope creep. The ONLY permitted edit to `scripts/ralph.sh` is the US-003 behavior-preserving source guard — and only if it is a strict no-op for all three documented invocation paths.

4. **Run quality checks** before commit (this repo's actual gates):
   ```bash
   pnpm test:scripts        # vitest over scripts/__tests__ — the core gate for this task
   pnpm run typecheck 2>/dev/null || true
   pnpm run lint 2>/dev/null || true
   ```
   All new tests MUST pass and no pre-existing suite may regress. Do not commit broken or red tests.

5. **Commit** with this message format (per `.claude/rules/git.md`):
   ```
   test: US-<NNN> — <story title>

   Submitted-by: <active submitter>
   ```
   Use `test:` as the type for these test-only stories (`feat:` only if US-003 actually edits `ralph.sh`). Stage only files touched by this story. The `Submitted-by:` trailer is mandatory and must name the active harness (`$RALPH_HARNESS`, e.g. `Claude` or `Codex`).

6. **Update `prd.json`** — set `passes: true` for the completed story, and set `notes` to a one-line summary including iteration number and date, e.g. `"Completed iteration 1 on 2026-06-12; commit abc1234"`.

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

8. **Codebase Patterns** — if you discovered a reusable pattern (e.g. how to inject `cwd`/`PATH` for hermetic shell-script tests), append it to (or create) the `## Codebase Patterns` section at the **top** of `progress.txt`.

9. **Stop condition** — after step 7, check whether all stories in `prd.json` now have `passes: true` (a DROPPED US-003 + skipped US-004 per the conditional-drop branch also counts as terminal — mark them `passes: true` with a `notes` explaining the drop, or leave a DEFERRED progress entry and still emit COMPLETE once US-001/US-002 pass and US-003/US-004 are resolved). If terminal, append a final line on its own to `progress.txt`:
   ```
   STATUS: COMPLETE
   ```
   This terminates the Ralph loop.

10. **End response normally** — do not emit any completion sentinel in your reply text. Only the `STATUS: COMPLETE` line in `progress.txt` matters.

## Blocked or deferred stories

- **Blocked** (external dependency, missing context, ambiguity): append to `progress.txt` with `**Result**: BLOCKED` and an explanation. Do NOT mark `passes: true`.
- **Deferred / Dropped** (US-003 source guard infeasible per the PRD's conditional-drop branch): append with `**Result**: DEFERRED`, note that US-004 is skipped per its gate, and leave `ralph.sh` unchanged. US-001/US-002 alone satisfy the run; emit `STATUS: COMPLETE` once they pass.

## Critical rules

- **One story per iteration.** Resist doing two.
- **Never push** to `development` or `main`. Branch is `feat/65-ralph-runner-test-coverage`.
- **Never skip pre-commit hooks** (`--no-verify`).
- **Never run `git clone` or `git init`** — you're already in a checkout.
- **Confine writes** to repo-tracked paths. Tests must be hermetic (temp `cwd`/`PATH`, no network, no `claude`/`codex`/`pi`/`tmux`).
- **Phase ordering matters.** Implement stories in `priority` order. US-004 depends on US-003.
- **Scope guard:** harness-infra only — `scripts/__tests__/ralph.test.ts` (new) and, only for US-003, a behavior-preserving guard in `scripts/ralph.sh`. No CI workflow changes (this is a test-only/internal change — no CHANGELOG entry required).
- **Don't modify completed stories** unless the current story explicitly requires it.

## Reference

- PRD: `tasks/ralph-runner-test-coverage/prd.md`
- Structured stories: `tasks/ralph-runner-test-coverage/prd.json`
- Critique: `tasks/ralph-runner-test-coverage/critique.md`
- Branch: `feat/65-ralph-runner-test-coverage`
- Issue: #65
