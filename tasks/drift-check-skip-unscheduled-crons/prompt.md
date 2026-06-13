# Ralph iteration — drift-check-skip-unscheduled-crons

You are one iteration of a Ralph loop implementing the `drift-check-skip-unscheduled-crons` task. The full plan is in `tasks/drift-check-skip-unscheduled-crons/prd.md` and the structured task list is in `tasks/drift-check-skip-unscheduled-crons/prd.json`. The loop calls you again until `progress.txt` contains a line `STATUS: COMPLETE`.

This is a **harness-infra** task: it edits `.claude/skills/drift-check/SKILL.md` and adds `evals/probes/drift-check-cron-staleness-glob.sh`. It must NOT change `scripts/cron-runtime.ts` behavior and must NOT touch sandbox application code.

## Your job in one iteration

Pick **one** user story, implement it, commit, mark it `passes: true`, and append a progress entry. Then exit. The next iteration handles the next story. Do not attempt multiple stories per iteration.

## Steps every iteration

1. **Read context** — in this order:
   - `tasks/drift-check-skip-unscheduled-crons/prd.json` — find the lowest-`priority` story where `passes: false`. That is your story for this iteration.
   - `tasks/drift-check-skip-unscheduled-crons/prd.md` — the full spec, including the **Predicate definition** block under US-001 and the **Probe strategy** block under US-003.
   - `tasks/drift-check-skip-unscheduled-crons/progress.txt` — read the "Codebase Patterns" section at the top (if any) and the most recent few iterations.
   - `tasks/drift-check-skip-unscheduled-crons/critique.md` — the critic findings the stories must satisfy (esp. the US-003 probe-robustness High finding and the US-001 CRLF/closing-`---`/anchored-`schedule:` Mediums).
   - `.claude/skills/drift-check/SKILL.md` — Steps C-1/C-2/C-3 (~lines 190–313) and the Output Contract.
   - `scripts/cron-runtime.ts` lines 25–90 — `parseCronFile`/`loadCrons`, the predicate to mirror (REFERENCE ONLY — do not modify).
   - `evals/probes/boot-lint-glob.sh` — the probe convention (header shape, 3-state oracle, stderr, exit 0/1/2).
   - `.claude/rules/git.md` for branch + commit conventions.

2. **Verify branch** — your branch is `feat/98-drift-check-skip-unscheduled-crons` (per `prd.json` `branchName`). If you are not on it:
   ```bash
   git fetch origin
   git checkout -b feat/98-drift-check-skip-unscheduled-crons origin/development 2>/dev/null \
     || git checkout feat/98-drift-check-skip-unscheduled-crons
   ```
   Never push to `development` or `main` directly.

3. **Implement the chosen story** — make the changes specified in the story's `acceptanceCriteria`. Confine the work to that story; resist scope creep. Key gotchas (from the critics):
   - The opening `---` must be the **first line** of the file (strip a trailing `\r` for CRLF safety) — a `---` inside a fenced code block must NOT match (the `crons/README.md` trap).
   - `schedule:` detection must be anchored (`^[[:space:]]*schedule:`) and exclude `#`-comment lines.
   - A schedulable file needs BOTH an opening and a closing `---` (mirrors `parseCronFile`).
   - `enabled: false` (bare or quoted) disqualifies a file.
   - US-003's probe must **extract and run** the live Step C-2 block against fixtures — a bare text-presence grep is rejected.

4. **Run quality checks** before commit (this repo uses pnpm workspaces; checks may no-op for a pure docs/shell change):
   ```bash
   pnpm run typecheck 2>/dev/null || true
   pnpm run lint 2>/dev/null || true
   pnpm run test:scripts 2>/dev/null || true
   # For the new probe (US-003): syntax + lint + run
   bash -n evals/probes/drift-check-cron-staleness-glob.sh
   shellcheck -S warning evals/probes/drift-check-cron-staleness-glob.sh
   bash evals/probes/drift-check-cron-staleness-glob.sh; echo "probe exit: $?"
   ```
   If checks fail, fix them. Do not commit broken code.

5. **Commit** with this message format (per `.claude/rules/git.md`):
   ```
   feat: US-<NNN> — <story title>

   Submitted-by: <active submitter>
   ```
   Use `feat` (this is net-new drift-check behavior + a new probe). Stage only files touched by this story. The `Submitted-by:` trailer is mandatory and must name the model/agent that actually submits the commit (`$RALPH_HARNESS`, e.g. `Claude`, `Codex`, or `Pi`).

6. **Update `prd.json`** — set `passes: true` for the completed story and set `notes` to a one-line summary, e.g. `"Completed iteration 1 on 2026-06-13; commit abc1234"`.

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

8. **Codebase Patterns** — if you discovered a reusable pattern, append it to (or create) the `## Codebase Patterns` section at the **top** of `progress.txt`.

9. **Stop condition** — after step 7, check whether all stories in `prd.json` now have `passes: true`. If yes, append a final line on its own to `progress.txt`:
   ```
   STATUS: COMPLETE
   ```

10. **Signal completion in your output only when terminal** — when (and only when) you have just appended `STATUS: COMPLETE` to `progress.txt`, also print `STATUS: COMPLETE` as the sole content of your final line. Never print that bare standalone line for any other reason.

## Blocked or deferred stories

- **Blocked** (external dependency, missing context, ambiguity): append with `**Result**: BLOCKED` and an explanation. Do NOT mark `passes: true`.
- **Deferred** (out of scope per the PRD's Non-Goals): append with `**Result**: DEFERRED`. Do NOT mark `passes: true`.

## Critical rules

- **One story per iteration.** Resist doing two.
- **Never push** to `development` or `main`. Branch is `feat/98-drift-check-skip-unscheduled-crons`.
- **Never skip pre-commit hooks** (`--no-verify`).
- **Never run `git clone` or `git init`** — you're already in a checkout.
- **Scope guard**: edit only `.claude/skills/drift-check/SKILL.md`, `evals/probes/drift-check-cron-staleness-glob.sh`, `tasks/drift-check-skip-unscheduled-crons/`, and `CHANGELOG.md`. Do NOT modify `scripts/cron-runtime.ts` or any sandbox application code.
- **CHANGELOG discipline.** Per `.claude/rules/git.md`, add an entry under `## [Unreleased]` `### Fixed` (the README false-positive fix) in the same commit as US-001, and `### Added` (the new probe) with US-003.
- **Don't modify completed stories** unless the current story explicitly requires it.

## Reference

- PRD: `tasks/drift-check-skip-unscheduled-crons/prd.md`
- Structured stories: `tasks/drift-check-skip-unscheduled-crons/prd.json`
- Branch: `feat/98-drift-check-skip-unscheduled-crons`
- Issue: #98
