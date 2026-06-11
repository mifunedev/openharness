# Ralph iteration — release-validation-gate

You are one iteration of a Ralph loop implementing the `release-validation-gate` task. The full plan is in `tasks/release-validation-gate/prd.md` and the structured task list is in `tasks/release-validation-gate/prd.json`. The loop calls you again until `progress.txt` contains a line `STATUS: COMPLETE`.

## Your job in one iteration

Pick **one** user story, implement it, commit, mark it `passes: true`, and append a progress entry. Then exit. The next iteration handles the next story. Do not attempt multiple stories per iteration.

## Steps every iteration

1. **Read context** — in this order:
   - `tasks/release-validation-gate/prd.json` — find the lowest-`priority` story where `passes: false`. That is your story for this iteration.
   - `tasks/release-validation-gate/progress.txt` — read the "Codebase Patterns" section at the top (if any) and the most recent few iterations to see what's been done.
   - `tasks/release-validation-gate/critique.md` — the critic findings the stories must satisfy (esp. the US-002 PROTECTED-PATH override note).
   - `.claude/rules/git.md` for branch + commit conventions.
   - `.claude/rules/advisor-model.md` for this critic-gated task.

2. **Verify branch** — your branch is `feat/24-release-validation-gate` (per `prd.json` `branchName`). If you are not on it:
   ```bash
   git fetch origin
   git checkout -b feat/24-release-validation-gate origin/development 2>/dev/null \
     || git checkout feat/24-release-validation-gate
   ```
   Never push to `development` or `main` directly.

3. **Implement the chosen story** — make the file changes specified in the story's `acceptanceCriteria`. The reference for US-001 is the `ci` job in `.github/workflows/ci-harness.yml` — mirror its step list verbatim. Confine the work to that story; resist scope creep.

4. **Run quality checks** before commit:
   ```bash
   python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml'))" && echo "release.yml YAML OK"
   pnpm test:scripts 2>/dev/null || true
   ```
   For US-002, also verify `diff context/rules/git.md .claude/rules/git.md` exits 0. If checks fail, fix them. Do not commit broken state.

5. **Commit** with this message format (per `.claude/rules/git.md`):
   ```
   <type>: US-<NNN> — <story title>
   ```
   Where `<type>` is `feat` for US-001 (net-new gate), `task`/`feat` for US-002/US-003. Example: `feat: US-001 — add validate job that gates the publish job in release.yml`. Stage only files touched by this story.

6. **Update `prd.json`** — set `passes: true` for the completed story, and set `notes` to a one-line summary including iteration number and date.

7. **Append to `progress.txt`** — append (never replace) using the standard format (Title / Files changed / Commit / Result / What I did / Learnings).

8. **Codebase Patterns** — if you discovered a reusable pattern, append it to the `## Codebase Patterns` section at the **top** of `progress.txt`.

9. **Stop condition** — after step 7, if all stories in `prd.json` now have `passes: true`, append a final line on its own to `progress.txt`:
   ```
   STATUS: COMPLETE
   ```

10. **End response normally** — no completion sentinel in your reply text.

## Critical rules

- **One story per iteration.** Resist doing two.
- **Never push** to `development` or `main`. Branch is `feat/24-release-validation-gate`.
- **Never skip pre-commit hooks** (`--no-verify`).
- **Scope guard: harness-infra only.** Touch only `.github/workflows/release.yml`, `context/rules/git.md`, `CHANGELOG.md`, and the `tasks/release-validation-gate/` task files. Do NOT modify `ci-harness.yml` or any sandbox application code.
- **PROTECTED-PATH (US-002):** `context/rules/git.md` is protected (`.claude/rules/git.md` symlink, protected-paths:50). The edit is a permitted documentation correction — do NOT delete or deprecate; edit the canonical `context/rules/git.md` and verify the symlink diff is clean.
- **Phase ordering matters.** Implement in `priority` order (US-001 → US-002 → US-003). US-003's CHANGELOG entry can also be folded into US-001's commit if the runner prefers, but the story stays the source of truth.
- **Don't modify completed stories** unless the current story explicitly requires it.

## Reference

- PRD: `tasks/release-validation-gate/prd.md`
- Structured stories: `tasks/release-validation-gate/prd.json`
- Critique: `tasks/release-validation-gate/critique.md`
- Branch: `feat/24-release-validation-gate`
- Issue: #24
- Mirror target for US-001: `.github/workflows/ci-harness.yml` (`ci` job)
