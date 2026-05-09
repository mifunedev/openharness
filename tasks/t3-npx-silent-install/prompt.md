# Ralph iteration — t3-npx-silent-install

You are one iteration of a Ralph loop documenting the upstream `pingdotgg/t3code` `npx t3` silent-failure investigation as durable harness knowledge. The full PRD is at `tasks/t3-npx-silent-install/prd.md` and the structured task list is at `tasks/t3-npx-silent-install/prd.json`. The loop calls you again until `progress.txt` contains a line `STATUS: COMPLETE`.

This is a **documentation-only** task. No application code, no fork or PR against `pingdotgg/t3code`, no edits to anything outside the FR-6 allowlist in `prd.md`.

## Your job in one iteration

Pick **one** user story, implement it, commit, mark it `passes: true`, and append a progress entry. Then exit. The next iteration handles the next story. Do not attempt multiple stories per iteration.

## Steps every iteration

1. **Read context** — in this order:
   - `tasks/t3-npx-silent-install/prd.json` — find the lowest-`priority` story where `passes: false`. That is your story for this iteration.
   - `tasks/t3-npx-silent-install/prd.md` — full PRD with FR-6 allowlist, Non-Goals, and **Appendix A** (verbatim smoking-gun log lines you'll need for US-001).
   - `tasks/t3-npx-silent-install/critique.md` — the 2-critic review and which Mediums were mitigated; useful to understand why each AC is shaped the way it is.
   - `tasks/t3-npx-silent-install/progress.txt` — read the "Codebase Patterns" section at the top (if any) and the most recent few iterations to see what's been done.
   - `context/rules/memory.md` — memory tier conventions (US-001 and US-003 depend on these).
   - `context/rules/git.md` — branch + commit + CHANGELOG conventions (US-004).
   - `context/rules/directory-readme.md` — README convention (US-002).
   - `context/rules/repo-layout-source.md` — single-source-of-truth pattern (US-002 conditional AC).
   - `context/rules/advisor-model.md` — referenced for critic-gated context; not load-bearing for this task but available if a sub-decision needs framing.

2. **Verify branch** — your branch is `bug/263-t3-npx-silent-install` (per `prd.json` `branchName`). If you are not on it:
   ```bash
   git fetch origin
   git checkout -b bug/263-t3-npx-silent-install origin/development 2>/dev/null \
     || git checkout bug/263-t3-npx-silent-install
   ```
   Never push to `development` or `main` directly.

3. **Implement the chosen story** — make the file changes specified in the story's `acceptanceCriteria`. Confine the work to that story and to the FR-6 allowlist in `prd.md`. Resist scope creep. If the story would require touching a path outside the allowlist, mark `BLOCKED` and explain — do NOT touch the file.

4. **Run quality checks** before commit:
   ```bash
   git diff --check                            # whitespace errors
   pnpm run lint 2>/dev/null || true           # if lint config covers markdown
   ```
   This task is documentation-only — there are no typecheck or test gates. The pre-commit hook is the source of truth for what passes; if it exits 0, you're done.

5. **Commit** with this message format (per `context/rules/git.md`):
   ```
   bug: US-<NNN> — <story title>
   ```
   Example: `bug: US-001 — capture investigation as topic memory note`. Stage only files touched by this story (use explicit `git add <path>`, not `git add -A`).

6. **Update `prd.json`** — set `passes: true` for the completed story, and set `notes` to a one-line summary including iteration number and date:
   ```json
   "notes": "Completed iteration 1 on 2026-05-09; commit abc1234"
   ```
   This file is the only allowed metadata edit per iteration.

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

8. **Codebase Patterns** — if you discover a pattern other iterations should know (a non-obvious convention, a shared utility, a gotcha specific to documentation-only stories in this harness), append it to (or create) the `## Codebase Patterns` section at the **top** of `progress.txt`. Keep entries general and reusable, not story-specific.

9. **Stop condition** — after step 7, check whether all stories in `prd.json` now have `passes: true`. If yes, append a final line on its own to `progress.txt`:
   ```
   STATUS: COMPLETE
   ```
   This terminates the Ralph loop. The loop runner reads `progress.txt` for this exact string at the start of each iteration.

10. **End response normally** — do not emit any completion sentinel in your reply text. Only the `STATUS: COMPLETE` line in `progress.txt` matters.

## Blocked or deferred stories

If the chosen story cannot be completed this iteration:

- **Blocked** (external dependency, missing context, ambiguity): append to `progress.txt` with `**Result**: BLOCKED` and an explanation. Do NOT mark `passes: true`. The next iteration will skip this story or escalate.
- **Deferred** (out of scope per the PRD's Non-Goals): append with `**Result**: DEFERRED`. Do NOT mark `passes: true`. The story stays for human review.

## Critical rules

- **One story per iteration.** Resist doing two.
- **Never push** to `development` or `main`. Branch is `bug/263-t3-npx-silent-install`.
- **Never skip pre-commit hooks** (`--no-verify`).
- **Never run `git clone` or `git init`** — you're already in a checkout.
- **Confine writes** to the FR-6 allowlist in `prd.md`. Do NOT write to any other path. In particular, do not touch `.claude/protected-paths.txt` entries, `context/rules/`, `.claude/skills/`, `.claude/agents/`, or `crons/`.
- **No third-party fork or PR.** This task documents an upstream bug; it does not fix it. Do not clone `pingdotgg/t3code` or open a PR against it.
- **CHANGELOG discipline.** Per `context/rules/git.md`, US-004 adds the changelog entry. Other stories should NOT touch `CHANGELOG.md`.
- **Don't modify completed stories** unless the current story explicitly requires it (it shouldn't).
- **Smoking-gun text is in Appendix A of `prd.md`** — copy it verbatim for US-001 rather than trying to reconstruct it from memory or fishing through `~/.npm/_logs/`.

## Reference

- PRD: `tasks/t3-npx-silent-install/prd.md`
- Structured stories: `tasks/t3-npx-silent-install/prd.json`
- Critique: `tasks/t3-npx-silent-install/critique.md`
- Branch: `bug/263-t3-npx-silent-install`
- Tracking issue: [#263](https://github.com/ryaneggz/open-harness/issues/263)
- Upstream issue (read-only context): [pingdotgg/t3code#2621](https://github.com/pingdotgg/t3code/issues/2621)
- Plan that produced this PRD: `.claude/plans/address-resolution-shimmering-river.md`
