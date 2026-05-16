# Ralph iteration — mifune-skills-library

You are one iteration of a Ralph loop building V0 of the `mifunedev/skills` portable cross-agent skill library. The full plan is in `tasks/mifune-skills-library/prd.md`, the structured task list in `tasks/mifune-skills-library/prd.json`, the critic gate output in `tasks/mifune-skills-library/critique.md`, and per-iteration progress in `tasks/mifune-skills-library/progress.txt`. The loop calls you again until `progress.txt` contains a line `STATUS: COMPLETE`.

## Your job in one iteration

Pick **one** user story, implement it, commit, mark it `passes: true`, and append a progress entry. Then exit. The next iteration handles the next story. Do not attempt multiple stories per iteration.

## Steps every iteration

1. **Read context** — in this order:
   - `tasks/mifune-skills-library/prd.json` — find the lowest-`priority` story where `passes: false`. That is your story for this iteration.
   - `tasks/mifune-skills-library/prd.md` — read the full text of the chosen story for prose context.
   - `tasks/mifune-skills-library/critique.md` — surfaced risks; the AC text in `prd.json` already includes the mitigations, but the critique explains *why* each AC is shaped the way it is.
   - `tasks/mifune-skills-library/progress.txt` — read the "Codebase Patterns" section at the top (if any) and the most recent few iterations to see what prior iterations learned.
   - `.claude/specs/skill-library/01-architecture.md` for canonical layout, frontmatter rules, and `registry.json` shape.
   - `.claude/specs/skill-library/02-install-system.md` for install path / lock file schema.
   - `.claude/specs/skill-library/06-roadmap.md` § V0 for acceptance gates.
   - `.claude/specs/skill-library/07-risks.md` for known footguns (esp. Risks D + E).
   - `.claude/rules/git.md` for branch + commit conventions and worktree path rules.
   - `.claude/rules/advisor-model.md` — your story may itself benefit from a 3-step advisor/critic pattern when authoring non-trivial bash scripts (US-006, US-007).
   - `.claude/protected-paths.txt` — DO NOT modify any entry on this list. The seed skills `open-harness-review` and `github-prd` are *adaptations*; the originals stay untouched. Verification of byte-identity is part of US-010.

2. **Verify branch** — your branch is `feat/304-mifune-skills-library` (per `prd.json` `branchName`). If you are not on it:
   ```bash
   git fetch origin
   git checkout -b feat/304-mifune-skills-library origin/development 2>/dev/null \
     || git checkout feat/304-mifune-skills-library
   ```
   Never push to `development` or `main` directly.

3. **Implement the chosen story** — make the file changes, additions, deletions specified in the story's `acceptanceCriteria`. Confine the work to that story; resist scope creep. All V0 files live under `.worktrees/project/mifunedev/skills/` per the PRD's FR-1.

4. **Story-specific quality gates** — V0 has no `pnpm` workspace. Run the gates that apply to the file types you touched:
   ```bash
   # Bash scripts:
   shellcheck -x <new-or-modified>.sh

   # JSON files:
   node -e "JSON.parse(require('fs').readFileSync('<path>'))"

   # YAML files (workflows):
   python3 -c "import yaml,sys; yaml.safe_load(open('<path>'))"

   # SKILL.md frontmatter:
   # Run skills-ref validate per the recipe documented in verification.md (US-010 pre-flight)
   ```
   If checks fail, fix them. Do not commit broken code.

5. **Commit** with this message format (per `.claude/rules/git.md`):
   ```
   feat: US-<NNN> — <story title>
   ```
   Example: `feat: US-001 — scaffold repo skeleton at .worktrees/project/mifunedev/skills/`. Stage only files touched by this story.

6. **Update `prd.json`** — set `passes: true` for the completed story, and set `notes` to a one-line summary including iteration number, date, and short commit SHA:
   ```json
   "notes": "Completed iteration 3 on 2026-05-16; commit abc1234"
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
   <patterns, gotchas, useful context>

   ---
   ```

8. **Codebase Patterns** — if you discovered a pattern other iterations should know (a non-obvious convention, a shared utility, a gotcha), append it to (or create) the `## Codebase Patterns` section at the **top** of `progress.txt`. Keep entries general and reusable, not story-specific. Examples for this task:
   - "How to invoke /skill-lint against an external folder" (resolved by US-010 pre-flight)
   - "skills-ref install + invocation" (resolved by US-010 pre-flight)
   - "Checksum algorithm location" (`docs/checksum.md` after US-002)

9. **Stop condition** — after step 7, check whether all stories in `prd.json` now have `passes: true`. If yes, append a final line on its own to `progress.txt`:
   ```
   STATUS: COMPLETE
   ```
   This terminates the Ralph loop.

10. **End response normally** — do not emit any completion sentinel in your reply text. Only the `STATUS: COMPLETE` line in `progress.txt` matters.

## Blocked or deferred stories

If the chosen story cannot be completed this iteration:

- **Blocked** (external dependency, missing context, ambiguity): append to `progress.txt` with `**Result**: BLOCKED` and an explanation. Do NOT mark `passes: true`. The next iteration will skip and pick the next lowest-priority `passes: false` that isn't already BLOCKED in recent progress entries, or escalate.
- **Deferred** (out of scope per the PRD's Non-Goals): append with `**Result**: DEFERRED`. Do NOT mark `passes: true`. The story stays for human review.

## Critical rules

- **One story per iteration.** Resist doing two.
- **Never push** to `development` or `main`. Branch is `feat/304-mifune-skills-library`.
- **Never skip pre-commit hooks** (`--no-verify`).
- **Never run `git clone` or `git init`** in the worktree path during implementation — `.worktrees/project/mifunedev/skills/` is a working copy on the harness branch, not its own repo (PRD § 7).
- **Protected paths**: `.claude/skills/harness-audit/` and `.claude/skills/prd/` are sources for US-003 and US-005 respectively. READ them; do NOT modify them. US-010 verifies byte-identity post-implementation via `git diff --exit-code`.
- **Pre-flight gates (US-010 pre-flight 1 + 2)** — if you are working on US-003, US-004, US-005, US-007, or US-009 and `verification.md` does NOT yet document the `/skill-lint` recipe AND the `skills-ref` invocation, your story MUST result in `Result: BLOCKED` with an explanation. Do not invent the recipe inline. The next iteration that picks US-010 will resolve those pre-flights.
- **Phase ordering matters.** Stories are priority-ordered by dependency in `prd.json`. Examples: US-002 (registry.json checksums) cannot land before US-003/US-004/US-005 (the actual skill folders); US-006 (install.sh) needs the lock schema documented; US-009 (CI) needs the pinned skills-ref invocation from US-010 pre-flight.
- **CHANGELOG discipline.** The `mifunedev/skills` repo has its own CHANGELOG.md (scaffolded by US-001). Every V0 story with user-visible impact should append to that file's `## [Unreleased]` section in the same commit.

## Reference

- PRD: `tasks/mifune-skills-library/prd.md`
- Structured stories: `tasks/mifune-skills-library/prd.json`
- Critique gate output: `tasks/mifune-skills-library/critique.md`
- Spec source of truth: `.claude/specs/skill-library/` (9 files)
- Branch: `feat/304-mifune-skills-library`
- Issue: [#304](https://github.com/ryaneggz/open-harness/issues/304)
