# Ralph iteration — property-based-testing

You are one iteration of a Ralph loop (or one worker sub-agent dispatched by `/delegate`) implementing property-based testing with fast-check across the three TypeScript surfaces in the OpenHarness repository. The full PRD is in `tasks/property-based-testing/prd.md`, the structured task list is in `tasks/property-based-testing/prd.json`, and the critic-gated review is in `tasks/property-based-testing/critique.md`. The loop calls you again until `progress.txt` contains a line `STATUS: COMPLETE`.

## Your job in one iteration

Pick **one** user story, implement it, commit, mark it `passes: true`, and append a progress entry. Then exit. The next iteration handles the next story. Do not attempt multiple stories per iteration.

## Steps every iteration

1. **Read context** — in this order:
   - `tasks/property-based-testing/prd.json` — find the lowest-`priority` story where `passes: false` whose dependencies (encoded in `notes`) are met. That is your story for this iteration.
   - `tasks/property-based-testing/prd.md` — full acceptance criteria for the chosen story; the "Execution Model" section in the Introduction; and the Technical Considerations section for implementation gotchas.
   - `tasks/property-based-testing/critique.md` — what the critics flagged and how the PRD addressed it. The "Final synthesis" at the bottom names the residual M findings that stay implementation-time concerns.
   - `tasks/property-based-testing/progress.txt` — the `## Codebase Patterns` section at the top (if any) and recent iterations to see what previous waves established.
   - `context/rules/git.md` for branch + commit conventions, CHANGELOG discipline, PR title format.
   - `context/rules/memory.md` for the daily-log MIP shape every skill must follow.
   - For US-002/003/004: read `scripts/cron-runtime.ts` directly — particularly `parseCronFile` (lines 24-45) and `loadCrons` (lines 47-59) — to ground arbitrary shapes and fixture choices.
   - For US-005/US-006: read `.pi/extensions/path-guard.ts` and its existing example test.
   - For US-007/US-008: read `apps/oh/src/cli.ts` and `apps/oh/tsconfig.json` (NodeNext module resolution affects import extensions).

2. **Verify branch** — your branch is `feat/354-property-based-testing` (per `prd.json` `branchName`). If you are not on it:
   ```bash
   git fetch origin
   git checkout -b feat/354-property-based-testing origin/development 2>/dev/null \
     || git checkout feat/354-property-based-testing
   ```
   Never push to `development` or `main` directly.

3. **Implement the chosen story** — make the file changes specified in the story's `acceptanceCriteria`. Confine the work to that story; resist scope creep. The PRD's ACs are tight — they're the contract. Story-specific notes:

   - **US-001**: The vitest `include` glob change is additive. Verify with `npx vitest list` and paste output in the PR description (or the progress entry for this iteration if no PR exists yet). If root-hoisting of `fast-check` does not satisfy `apps/oh` typecheck, add `fast-check` to `apps/oh/package.json` devDependencies too.
   - **US-002/003/004**: **No modifications to `scripts/cron-runtime.ts`** (FR-11). Tests-only. The current implementation already satisfies all three invariants; do not "fix" what isn't broken. US-003 MUST use constrained arbitraries for YAML keys/values. US-004 MUST write files in REVERSE-alphabetical order before calling `loadCrons` — without this, the test cannot catch a regression.
   - **US-005**: Add `export` to the existing `SENSITIVE_PATHS` declaration AND add the new `isSensitivePath` function. Default-export behavior must remain unchanged. Existing path-guard example tests must continue to pass.
   - **US-006**: Import BOTH `isSensitivePath` and `SENSITIVE_PATHS` from path-guard — no re-declaration. Filter is regex non-match, NOT substring exclusion.
   - **US-007**: Just two `export` keyword additions. Smoke test (`node apps/oh/dist/oh.js --help` exits 0) confirms tree-shaking didn't break anything.
   - **US-008**: Use NodeNext-style import: `from "../cli.js"`. Determinism + no-throw only — mutual exclusion explicitly excluded.
   - **US-009**: Docs-only. Link from root `README.md` "Testing" section (create if absent). Reference fast-check.dev for upstream docs; do not duplicate.

4. **Run quality checks** before commit:
   ```bash
   npm test 2>/dev/null || pnpm test 2>/dev/null || true
   npm run typecheck 2>/dev/null || true
   # For apps/oh changes:
   (cd apps/oh && npm run typecheck && npm run build) 2>/dev/null || true
   ```
   If checks fail, fix them. Do not commit broken code.

5. **CHANGELOG discipline** — per `context/rules/git.md`, every story has a CHANGELOG entry under `## [Unreleased]` in the same commit. Use category `### Added` for new test files / docs / refactored exports.

6. **Commit** with this message format (per `context/rules/git.md`):
   ```
   <type>: US-<NNN> — <story title>
   ```
   Where `<type>` is `feat` for US-001/002/003/004/005/006/007/008/009. Stage only files touched by this story (do not bulk-stage with `git add -A`).

7. **Update `prd.json`** — set `passes: true` for the completed story, and set `notes` to a one-line summary including iteration date and commit SHA:
   ```json
   "notes": "Completed 2026-05-24; commit abc1234. Wave 1."
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
   <patterns, gotchas, useful context — especially anything subsequent waves must respect>

   ---
   ```

9. **Codebase Patterns** — if you discovered a pattern other iterations should know (canonical arbitrary shapes for cron frontmatter, NodeNext import gotchas, vitest discovery quirks), append it to (or create) the `## Codebase Patterns` section at the **top** of `progress.txt`. Keep entries general and reusable.

10. **Stop condition** — after step 8, check whether all stories in `prd.json` now have `passes: true`. If yes, append a final line on its own to `progress.txt`:
    ```
    STATUS: COMPLETE
    ```
    This terminates the Ralph loop.

11. **End response normally** — do not emit any completion sentinel in your reply text. Only the `STATUS: COMPLETE` line in `progress.txt` matters.

## Blocked or deferred stories

- **Blocked** (wave dependency not satisfied — e.g., US-006 picked before US-005 committed): append to `progress.txt` with `**Result**: BLOCKED` and an explanation. Do NOT mark `passes: true`. The next iteration will skip and pick the next eligible story.
- **Deferred** (out of scope per the PRD's Non-Goals): append with `**Result**: DEFERRED`. Do NOT mark `passes: true`. The story stays for human review.

## Wave ordering

- **Wave 1** (after US-001): US-002, US-003, US-004, US-005, US-007, US-009 — all independent and parallelizable.
- **Wave 2**: US-006 (requires US-005 committed), US-008 (requires US-007 committed).

`/delegate` invocations should spawn Wave 1 stories in parallel after US-001 commits, then Wave 2 stories in parallel after their dependencies commit.

## Critical rules

- **One story per iteration.** Resist doing two.
- **Never push** to `development` or `main`. Branch is `feat/354-property-based-testing`.
- **Never skip pre-commit hooks** (`--no-verify`).
- **Never modify `scripts/cron-runtime.ts` source.** FR-11 prohibits it; the file is on `.claude/protected-paths.txt`; the property tests are regression-prevention and require no source change.
- **Confine writes** to repo-tracked paths.
- **CHANGELOG discipline.** Every story has a `## [Unreleased]` entry in the same commit. Verify no duplicates before commit.
- **Don't modify completed stories** unless the current story explicitly requires it.

## Reference

- PRD: `tasks/property-based-testing/prd.md`
- Structured stories: `tasks/property-based-testing/prd.json`
- Critic gate (audit trail): `tasks/property-based-testing/critique.md`
- Spec sketch (gitignored upstream input): `.claude/specs/property-based-testing/spec.md`
- Branch: `feat/354-property-based-testing`
- Issue: [#354](https://github.com/ryaneggz/open-harness/issues/354)
- Advisor pattern (for sub-agent delegation within stories if needed): `context/rules/advisor-model.md`
- Recursive delegation bounds: `context/rules/recursive-delegation.md`
- fast-check upstream docs: https://fast-check.dev
