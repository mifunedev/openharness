# Ralph iteration — fork-friendly-install

You are one iteration of a Ralph loop implementing the fork-friendly install for OpenHarness. The full plan is in `tasks/fork-friendly-install/prd.md` and the structured task list is in `tasks/fork-friendly-install/prd.json`. The two-critic review is in `tasks/fork-friendly-install/critique.md` and explains *why* each AC is shaped the way it is. The loop calls you again until `progress.txt` contains a line `STATUS: COMPLETE`.

## Your job in one iteration

Pick **one** user story, implement it, commit, mark it `passes: true`, and append a progress entry. Then exit. The next iteration handles the next story. Do not attempt multiple stories per iteration.

## Steps every iteration

1. **Read context** — in this order:
   - `tasks/fork-friendly-install/prd.json` — find the lowest-`priority` story where `passes: false`. That is your story for this iteration.
   - `tasks/fork-friendly-install/prd.md` — the story's full prose acceptance criteria with formatting and code fences intact. The JSON form flattens nested bullets; the markdown is canonical.
   - `tasks/fork-friendly-install/critique.md` — read the H-severity mitigation notes for your story before implementing; they capture *why* each AC bullet was sharpened.
   - `tasks/fork-friendly-install/progress.txt` — read the "Codebase Patterns" section at the top (if any) and the most recent iterations to see what's been done.
   - `scripts/install.sh` — the file most stories modify. Pay attention to the existing `set -euo pipefail`, the `warn`/`die` helpers at lines 13-14, and the migration block at 183-227 that mutates the filesystem before the clone branch at 229.
   - `context/rules/git.md` for branch + commit conventions.
   - `context/rules/advisor-model.md` if you delegate to a sub-agent.

2. **Verify branch** — your branch is `feat/308-fork-friendly-install` (per `prd.json` `branchName`). If you are not on it:
   ```bash
   git fetch origin
   git checkout -b feat/308-fork-friendly-install origin/development 2>/dev/null \
     || git checkout feat/308-fork-friendly-install
   ```
   Never push to `development` or `main` directly.

3. **Implement the chosen story** — make the file changes specified in the story's `acceptanceCriteria`. Confine the work to that story; resist scope creep. Cross-reference `critique.md` if any AC bullet seems redundant or over-specified — it almost certainly mitigates a specific critic finding and must NOT be relaxed.

4. **Run quality checks** before commit:
   ```bash
   bash -n scripts/install.sh
   shellcheck scripts/install.sh 2>&1 | tee /tmp/shellcheck.log || true
   ```
   The baseline shellcheck count was captured in the PR description by US-001's implementer. New warnings beyond baseline = fix before commit.

5. **Story-specific verification** (run when relevant to the current story):
   - US-001/US-002/US-003: with `git` shimmed to print arguments, dry-run `bash scripts/install.sh` under each env-var combination listed in the AC. Assert the emitted clone command matches expectations.
   - US-001: explicitly test `OH_GITHUB_REPO='evil; rm -rf /'` dies BEFORE any filesystem mutation (validation must fire pre-migration block).
   - US-003: build a fixture `$REPO_DIR` with both `https://github.com/...` and `git@github.com:...` remotes; verify normalization treats them as equivalent.
   - US-005/US-006: render the markdown (or grep for balanced ``` fences) and verify the visual-hierarchy blockquote sits immediately above the fork block.

6. **Commit** with this message format (per `context/rules/git.md`):
   ```
   feat: US-<NNN> — <story title>
   ```
   Example: `feat: US-001 — OH_GITHUB_REPO env var parameterizes the clone`. Stage only files touched by this story.

7. **Update `prd.json`** — set `passes: true` for the completed story, and set `notes` to a one-line summary including iteration number and date:
   ```json
   "notes": "Completed iteration 1 on 2026-05-17; commit abc1234"
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

9. **Codebase Patterns** — if you discovered a pattern other iterations should know (a non-obvious convention in `scripts/install.sh`, a shared helper to reuse, a gotcha about `set -euo pipefail` interaction), append it to (or create) the `## Codebase Patterns` section at the **top** of `progress.txt`. Keep entries general and reusable, not story-specific.

10. **Stop condition** — after step 8, check whether all stories in `prd.json` now have `passes: true`. If yes, append a final line on its own to `progress.txt`:
    ```
    STATUS: COMPLETE
    ```
    This terminates the Ralph loop.

11. **End response normally** — do not emit any completion sentinel in your reply text. Only the `STATUS: COMPLETE` line in `progress.txt` matters.

## Blocked or deferred stories

If the chosen story cannot be completed this iteration:

- **Blocked** (external dependency, missing context, ambiguity in `prd.md`): append to `progress.txt` with `**Result**: BLOCKED` and an explanation. Do NOT mark `passes: true`. The next iteration will skip this story.
- **Deferred** (out of scope per the PRD's Non-Goals): append with `**Result**: DEFERRED`. Do NOT mark `passes: true`. The story stays for human review.

## Critical rules

- **One story per iteration.** Resist doing two.
- **Never push** to `development` or `main`. Branch is `feat/308-fork-friendly-install`.
- **Never skip pre-commit hooks** (`--no-verify`).
- **Never run `git clone` or `git init`** — you're already in a checkout.
- **Confine writes** to repo-tracked paths. Do not write outside the repo or to `~/`.
- **DO NOT modify `README.md:17`** — that line is the canonical upstream install one-liner and is EXPLICITLY UNCHANGED per US-005 AC bullet 1 and FR-10.
- **DO NOT skip the bash `=~` regex form** for `OH_GITHUB_REPO` validation in US-001. The AC explicitly forbids `grep` substring matching; honor it.
- **DO NOT place the validation inside the clone-or-pull branch at line 229** — it must fire BEFORE the migration block at 183-227 so a bad input dies before filesystem mutation.
- **DO NOT collapse the multi-line recovery guidance in US-003** to a single line. Each step (backup, rm -rf, re-run) is its own AC bullet sub-item.
- **CHANGELOG discipline.** Per `context/rules/git.md`, the story with user-visible impact (US-007) adds the `## [Unreleased]` entries in the same commit. PR link uses `(#TBD)` at commit time; replaced after `gh pr create` in a follow-up commit.
- **Don't modify completed stories** unless the current story explicitly requires it.

## Story execution order (priority-locked)

The stories are dependency-ordered. Respect the priority field:
1. US-001 — landed first; subsequent stories depend on `OH_GITHUB_REPO` existing
2. US-002 — depends on US-001 having defined the env-var pattern
3. US-003 — depends on US-001 (compares against `OH_GITHUB_REPO`)
4. US-004 — depends on US-001 + US-002 (documents both vars in help text)
5. US-005 — independent of script changes; documents the new flow
6. US-006 — same as US-005, in long-form docs
7. US-007 — last; CHANGELOG entry references the work landed by prior stories

## Reference

- PRD (canonical): `tasks/fork-friendly-install/prd.md`
- Structured stories: `tasks/fork-friendly-install/prd.json`
- Critic review: `tasks/fork-friendly-install/critique.md`
- Branch: `feat/308-fork-friendly-install`
- Issue: [#308](https://github.com/ryaneggz/open-harness/issues/308)
