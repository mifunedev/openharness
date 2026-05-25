# Ralph iteration — karpathy-llm-wiki

You are one iteration of a Ralph loop implementing Karpathy's LLM Wiki pattern in the OpenHarness repository. The full PRD is in `tasks/karpathy-llm-wiki/prd.md`, the structured task list is in `tasks/karpathy-llm-wiki/prd.json`, and the critic-gated review is in `tasks/karpathy-llm-wiki/critique.md`. The locked plan + post-audit tightenings live in `.claude/plans/karpathy-llm-wiki.md` (on PR #347's branch). The loop calls you again until `progress.txt` contains a line `STATUS: COMPLETE`.

## Your job in one iteration

Pick **one** user story, implement it, commit, mark it `passes: true`, and append a progress entry. Then exit. The next iteration handles the next story. Do not attempt multiple stories per iteration.

## Steps every iteration

1. **Read context** — in this order:
   - `tasks/karpathy-llm-wiki/prd.json` — find the lowest-`priority` story where `passes: false`. That is your story for this iteration. **Respect the wave gates encoded in the `notes` field**: US-002 + US-003 are parallelizable (Wave 2), but US-002's smoke test must commit before US-003's smoke test runs; US-004 (Wave 3) requires US-002 + US-003 committed first; US-005 (Wave 4) requires US-002 + US-003 + US-004 all committed first.
   - `tasks/karpathy-llm-wiki/prd.md` — full acceptance criteria for the chosen story, with the load-bearing instance-specific gotchas the prd.json bullets compress.
   - `tasks/karpathy-llm-wiki/progress.txt` — read the `## Codebase Patterns` section at the top (if any) and the most recent few iterations to see what previous waves established (especially the canonical frontmatter extraction one-liner from US-001).
   - `context/rules/wiki.md` (after US-001 lands) — the canonical schema doc; every entry decision routes through this rule.
   - `context/rules/git.md` for branch + commit conventions, CHANGELOG discipline, PR title format.
   - `context/rules/memory.md` for the daily-log MIP shape every skill must follow.
   - `context/rules/directory-readme.md` for the wiki/README.md + wiki/raw/README.md conventions.
   - `.claude/plans/karpathy-llm-wiki.md` (on the `feat/346-karpathy-llm-wiki` branch via worktree or `git show`) — the original plan + pm-audit tightenings if you need deeper rationale than the PRD AC compresses.

2. **Verify branch** — your branch is `feat/350-karpathy-llm-wiki` (per `prd.json` `branchName`). If you are not on it:
   ```bash
   git fetch origin
   git checkout -b feat/350-karpathy-llm-wiki origin/development 2>/dev/null \
     || git checkout feat/350-karpathy-llm-wiki
   ```
   Never push to `development` or `main` directly.

3. **Implement the chosen story** — make the file changes specified in the story's `acceptanceCriteria`. Confine the work to that story; resist scope creep. The PRD's ACs are tight — they're the contract.

   For US-001 (schema rule): The `context/rules/wiki.md` MUST contain ALL 7 required sections, each non-empty. A stub with section headings only does NOT satisfy "complete." Each section's required content is enumerated in the AC.

   For US-002 (`/wiki-ingest`): The update-existing-page logic is in scope — do not ship create-only and defer update. Follow the body-merge strategy locked in `context/rules/wiki.md` § *Body-merge strategy*.

   For US-003 (`/wiki-query`): Use the canonical frontmatter extraction command from `context/rules/wiki.md` (`awk '/^---$/{f=!f; next} f{print}'`) — the same command US-004 uses. Divergence here creates silent inconsistency.

   For US-004 (`/wiki-lint`): Contradiction detection is **explicitly descoped** for v1 — ship the stub text from the AC, do NOT attempt the heuristic. Atomic README regen is required (write to `.tmp`, validate, atomic rename).

   For US-005 (AGENTS.md registration): Edit only `AGENTS.md` — `CLAUDE.md` is a symlink and the Edit tool refuses to write through it. Verify the symlink inode is intact before and after via `ls -li CLAUDE.md AGENTS.md`.

4. **Run quality checks** before commit:
   ```bash
   pnpm run type-check 2>/dev/null || true
   pnpm run lint 2>/dev/null || true
   pnpm run test 2>/dev/null || true
   ```
   If checks fail, fix them. Do not commit broken code.

   Each story's CHANGELOG entry is part of the commit — verify with `git diff CHANGELOG.md` before commit.

5. **Commit** with this message format (per `context/rules/git.md`):
   ```
   <type>: US-<NNN> — <story title>
   ```
   Where `<type>` is `feat` for net-new functionality (US-001, US-002, US-003, US-004) or `task` for housekeeping/registration (US-005). Stage only files touched by this story (do not bulk-stage with `git add -A`).

6. **Update `prd.json`** — set `passes: true` for the completed story, and set `notes` to a one-line summary including iteration date and commit SHA:
   ```json
   "notes": "Completed 2026-05-24; commit abc1234. Wave 2 — smoke ran and committed."
   ```

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
   <patterns, gotchas, useful context — especially anything subsequent waves must respect>

   ---
   ```

8. **Codebase Patterns** — if you discovered a pattern other iterations should know (the locked extraction command, the slug derivation edge cases, the body-merge convention), append it to (or create) the `## Codebase Patterns` section at the **top** of `progress.txt`. Keep entries general and reusable.

9. **Stop condition** — after step 7, check whether all stories in `prd.json` now have `passes: true`. If yes, append a final line on its own to `progress.txt`:
   ```
   STATUS: COMPLETE
   ```
   This terminates the Ralph loop.

10. **End response normally** — do not emit any completion sentinel in your reply text. Only the `STATUS: COMPLETE` line in `progress.txt` matters.

## Blocked or deferred stories

If the chosen story cannot be completed this iteration:

- **Blocked** (wave dependency not satisfied, missing context, ambiguity): append to `progress.txt` with `**Result**: BLOCKED` and an explanation. Do NOT mark `passes: true`. The next iteration will skip this story (find the next lowest-priority `passes: false` that isn't already BLOCKED) or escalate. For wave-dependency blocks specifically, the blocker is "US-NNN not yet committed" — the next iteration may be able to unblock by picking a different story whose deps ARE met.
- **Deferred** (out of scope per the PRD's Non-Goals): append with `**Result**: DEFERRED`. Do NOT mark `passes: true`. The story stays for human review.

## Critical rules

- **One story per iteration.** Resist doing two.
- **Never push** to `development` or `main`. Branch is `feat/350-karpathy-llm-wiki`.
- **Never skip pre-commit hooks** (`--no-verify`).
- **Never run `git clone` or `git init`** — you're already in a checkout.
- **Confine writes** to repo-tracked paths. Do not write outside the repo or to `~/`.
- **Wave ordering matters.** US-002 + US-003 may run in either order (Wave 2 — parallelizable), BUT US-002's smoke must commit before US-003's smoke runs. US-004 requires both committed; US-005 requires all three of US-002/3/4 committed. Do not run US-005 in parallel with the others under any circumstance.
- **CHANGELOG discipline.** Per `context/rules/git.md`, every story has a CHANGELOG entry in the same commit. The PRD spells out which `### Added` / `### Changed` line for each story. Verify no duplicate entries before commit (`grep -c "<skill-name>" CHANGELOG.md`).
- **Symlink discipline (US-005).** Edit `AGENTS.md`, never `CLAUDE.md`. Verify inode before and after.
- **Don't modify completed stories** unless the current story explicitly requires it.

## Reference

- PRD: `tasks/karpathy-llm-wiki/prd.md`
- Structured stories: `tasks/karpathy-llm-wiki/prd.json`
- Critic gate (audit trail): `tasks/karpathy-llm-wiki/critique.md`
- Original plan + pm-audit appendix: `.claude/plans/karpathy-llm-wiki.md` (on branch `feat/346-karpathy-llm-wiki`, PR [#347](https://github.com/ryaneggz/open-harness/pull/347))
- Branch: `feat/350-karpathy-llm-wiki`
- Issue: [#350](https://github.com/ryaneggz/open-harness/issues/350)
- Tracking parent: [#346](https://github.com/ryaneggz/open-harness/issues/346)
- Canonical wiki rule (after US-001 lands): `context/rules/wiki.md`
- Advisor pattern (relevant for sub-agent delegation within stories): `context/rules/advisor-model.md`
- Recursive delegation bounds (if any story spawns its own sub-agents): `context/rules/recursive-delegation.md`
