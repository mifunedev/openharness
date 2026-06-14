# Ralph iteration — release-validate-ci-parity

You are one iteration of a Ralph loop implementing the `release-validate-ci-parity` task. The full plan is in `tasks/release-validate-ci-parity/prd.md` and the structured task list is in `tasks/release-validate-ci-parity/prd.json`. The loop calls you again until `progress.txt` contains a line `STATUS: COMPLETE`.

> **Task nature**: This is a **harness-infra CI/CD change** — editing `.github/workflows/release.yml`, `context/rules/git.md`, and `CHANGELOG.md`. There is NO sandbox application code, NO TypeScript, and NO UI in this task. Do not run `agent-browser`. The reference implementation to copy is in `.github/workflows/ci-harness.yml` (jobs `boot-lint` at lines ~101-120 and `eval-probes` at ~122-131) — copy those jobs **faithfully** into `release.yml`; do not "improve" them (divergence between the two files is a future drift hazard). Add `permissions:` with `contents: read` to each new job (the critic gate requires this — `release.yml` has no workflow-level `permissions:` so the new jobs would otherwise inherit broad repo defaults).

## Your job in one iteration

Pick **one** user story, implement it, commit, mark it `passes: true`, and append a progress entry. Then exit. The next iteration handles the next story. Do not attempt multiple stories per iteration.

## Steps every iteration

1. **Read context** — in this order:
   - `tasks/release-validate-ci-parity/prd.json` — find the lowest-`priority` story where `passes: false`. That is your story for this iteration.
   - `tasks/release-validate-ci-parity/progress.txt` — read the "Codebase Patterns" section at the top (if any) and the most recent few iterations to see what's been done.
   - `tasks/release-validate-ci-parity/critique.md` — the critic findings the stories must satisfy (especially: eval-probes is a green→red *delta* gate that won't jam releases; each new job needs `permissions: contents: read`; the git.md edit must be targeted, not a rewrite).
   - `.claude/rules/git.md` for branch + commit conventions.
   - `.github/workflows/ci-harness.yml` — the source of the `boot-lint` and `eval-probes` jobs to copy.

2. **Verify branch** — your branch is `feat/111-release-validate-ci-parity` (per `prd.json` `branchName`). If you are not on it:
   ```bash
   git fetch origin
   git checkout -b feat/111-release-validate-ci-parity origin/development 2>/dev/null \
     || git checkout feat/111-release-validate-ci-parity
   ```
   Never push to `development` or `main` directly.

3. **Implement the chosen story** — make the file changes specified in the story's `acceptanceCriteria`. Confine the work to that story; resist scope creep. For US-001/US-002 copy the matching job from `ci-harness.yml`; for US-003 edit only the `release` job's `needs:` line; for US-004 use a **targeted Edit** on the one git.md sentence (no whole-file rewrite) plus the CHANGELOG bullet.

4. **Run quality checks** before commit (this repo's real checks — the template defaults may not exist):
   ```bash
   pnpm test:scripts 2>&1 | tail -5     # vitest — the root test gate; must pass
   ```
   The pre-commit hook runs lint + tests; do not bypass it. If checks fail, fix them. Do not commit broken code.

5. **Commit** with this message format (per `.claude/rules/git.md`):
   ```
   feat: US-<NNN> — <story title>

   Submitted-by: <active submitter>
   ```
   Use `feat:` for the workflow/job additions (US-001/002/003) and `feat:`/`task:` for US-004. Stage only files touched by this story.
   The `Submitted-by:` trailer is mandatory and must name the model/agent that actually submits the commit (use `$RALPH_HARNESS` when set — e.g. `Claude`, `Codex`, or `Pi`; if Ralph fell back from Claude to Codex, use `Submitted-by: Codex`).

6. **Update `prd.json`** — set `passes: true` for the completed story, and set `notes` to a one-line summary including iteration number and date, e.g. `"Completed iteration 1 on 2026-06-14; commit abc1234"`.

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
   The runner reads for this exact whole-line string in both `progress.txt` and your iteration output.

10. **Signal completion in your output only when terminal** — when (and only when) you have just appended `STATUS: COMPLETE` to `progress.txt`, also print `STATUS: COMPLETE` as the sole content of your final line. Never print that bare standalone line for any other reason.

## Blocked or deferred stories

- **Blocked** (external dependency, missing context, ambiguity): append with `**Result**: BLOCKED` and an explanation. Do NOT mark `passes: true`.
- **Deferred** (out of scope per the PRD's Non-Goals): append with `**Result**: DEFERRED`. Do NOT mark `passes: true`.

## Critical rules

- **One story per iteration.** Resist doing two.
- **Never push** to `development` or `main`. Branch is `feat/111-release-validate-ci-parity`.
- **Never skip pre-commit hooks** (`--no-verify`).
- **Never run `git clone` or `git init`** — you're already in a checkout.
- **Do NOT modify `.github/workflows/ci-harness.yml` or `.claude/skills/eval/run.sh`** — they are explicit Non-Goals; several ACs assert `git diff --quiet` on them.
- **Phase ordering matters.** US-003 (the `needs:` gate) depends on US-001 and US-002 having added the jobs — implement in `priority` order.
- **CHANGELOG discipline.** US-004 adds the `[Unreleased]` > `### Changed` entry.
- **Don't modify completed stories** unless the current story explicitly requires it.

## Reference

- PRD: `tasks/release-validate-ci-parity/prd.md`
- Structured stories: `tasks/release-validate-ci-parity/prd.json`
- Critique: `tasks/release-validate-ci-parity/critique.md`
- Branch: `feat/111-release-validate-ci-parity`
- Issue: #111
