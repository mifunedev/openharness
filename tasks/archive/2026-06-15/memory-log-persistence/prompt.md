# Ralph iteration — memory-log-persistence

You are one iteration of a Ralph loop implementing the `memory-log-persistence` task. The full plan is in `tasks/memory-log-persistence/prd.md` and the structured task list is in `tasks/memory-log-persistence/prd.json`. The loop calls you again until `progress.txt` contains a line `STATUS: COMPLETE`.

## Your job in one iteration

Pick **one** user story, implement it, commit, mark it `passes: true`, and append a progress entry. Then exit. The next iteration handles the next story. Do not attempt multiple stories per iteration.

## Steps every iteration

1. **Read context** — in this order:
   - `tasks/memory-log-persistence/prd.json` — find the lowest-`priority` story where `passes: false`. That is your story for this iteration.
   - `tasks/memory-log-persistence/progress.txt` — read the "Codebase Patterns" section at the top (if any) and the most recent few iterations.
   - `tasks/memory-log-persistence/critique.md` — the critic findings the stories must satisfy (already folded into the ACs; honor them).
   - `.claude/rules/git.md` for branch + commit conventions.
   - For US-002, read `evals/probes/boot-lint-glob.sh` as the exact probe pattern to mirror.

2. **Verify branch** — your branch is `feat/101-memory-log-persistence` (per `prd.json` `branchName`). If you are not on it:
   ```bash
   git fetch origin
   git checkout -b feat/101-memory-log-persistence origin/development 2>/dev/null \
     || git checkout feat/101-memory-log-persistence
   ```
   Never push to `development` or `main` directly.

3. **Implement the chosen story** — make exactly the changes specified in the story's `acceptanceCriteria`. Confine the work to that story; resist scope creep. This task is documentation + one read-only shell probe + a CHANGELOG line — there is NO sandbox application code and NO runtime/cron behavior change. Do NOT edit `.gitignore`, do NOT remove the vestigial tracked logs (`memory/2026-05-03`, `memory/2026-05-04`), do NOT edit `crons/heartbeat.md` or the 2026-05-24 `memory/MEMORY.md` lesson (memory entries are immutable).

4. **Run quality checks** before commit:
   ```bash
   pnpm typecheck 2>/dev/null || true
   pnpm lint 2>/dev/null || true
   pnpm test:scripts 2>/dev/null || true
   ```
   **For US-002 additionally:**
   ```bash
   bash -n evals/probes/memory-gitignore-claim.sh
   shellcheck -S warning evals/probes/memory-gitignore-claim.sh   # must be clean
   bash evals/probes/memory-gitignore-claim.sh; echo "exit=$?"     # expect PASS / exit 0 on corrected tree
   ```
   And run the negative test: temporarily reintroduce `tracked inside` into `context/rules/memory.md` → confirm probe exits 1; remove the `memory/[0-9]*/` line from `.gitignore` → confirm probe exits 1; **revert both temporary edits** before committing. If checks fail, fix them. Do not commit broken code.

5. **Commit** (per `.claude/rules/git.md`):
   ```
   <type>: US-<NNN> — <story title>

   Submitted-by: <active submitter>
   ```
   `<type>` = `fix` for US-001 (correcting a false rule claim), `feat` for US-002 (new probe), `docs`/`fix` for US-003 — pick the most accurate. Stage only files touched by this story. The `Submitted-by:` trailer is mandatory and must name the active harness (`$RALPH_HARNESS`, e.g. `Claude`, `Codex`, or `Pi`).

6. **Update `prd.json`** — set `passes: true` for the completed story; set `notes` to a one-line summary with iteration number and date.

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
   <patterns, gotchas, useful context>

   ---
   ```

8. **Codebase Patterns** — append non-obvious reusable conventions to a `## Codebase Patterns` section at the **top** of `progress.txt`.

9. **Stop condition** — after step 7, if all stories in `prd.json` now have `passes: true`, append a final line on its own to `progress.txt`:
   ```
   STATUS: COMPLETE
   ```

10. **Signal completion in your output only when terminal** — when (and only when) you just appended `STATUS: COMPLETE` to `progress.txt`, also print `STATUS: COMPLETE` as the sole content of your final line. Never print that bare standalone line otherwise.

## Blocked or deferred stories

- **Blocked**: append with `**Result**: BLOCKED` + explanation; do NOT mark `passes: true`.
- **Deferred** (out of scope per Non-Goals): append with `**Result**: DEFERRED`; do NOT mark `passes: true`.

## Critical rules

- **One story per iteration.** Resist doing two.
- **Never push** to `development` or `main`. Branch is `feat/101-memory-log-persistence`.
- **Never skip pre-commit hooks** (`--no-verify`).
- **Never run `git clone` or `git init`** — you're already in a checkout.
- **Confine writes** to repo-tracked paths. Do not write outside the repo or to `~/`.
- **Phase ordering matters.** Implement stories in `priority` order (US-001 → US-002 → US-003); US-002's probe asserts US-001's correction, so US-001 must land first.
- **CHANGELOG discipline** is US-003's job — do not pre-empt it in US-001/US-002 commits.
- **Don't modify completed stories** unless the current story explicitly requires it.

## Reference

- PRD: `tasks/memory-log-persistence/prd.md`
- Structured stories: `tasks/memory-log-persistence/prd.json`
- Critique: `tasks/memory-log-persistence/critique.md`
- Branch: `feat/101-memory-log-persistence`
- Issue: #101
