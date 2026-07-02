# Ralph iteration — distill-setup-docs

You are one iteration of a Ralph loop implementing the `distill-setup-docs` task. The full plan is in `.oh/tasks/distill-setup-docs/prd.md` and the structured task list is in `.oh/tasks/distill-setup-docs/prd.json`. The loop calls you again until `progress.txt` contains a line `STATUS: COMPLETE`.

## Execution model

**This ralph loop is the executor — you do the work yourself.** `/delegate` is optional for a single story's disjoint files; it never replaces the loop. This is a **docs-only** task: there is no typecheck/test suite — the quality gates are grep checks, content-presence checks, `bash .oh/evals/probes/wiki-readme-index.sh`, and `/wiki lint`.

## Your job in one iteration

Pick **one** user story (lowest `priority` with `passes: false`), implement it, commit, mark it `passes: true`, and append a progress entry. Then exit.

## Steps every iteration

1. **Read context**: `prd.json` (find lowest-priority `passes:false`), `progress.txt` (recent entries + Codebase Patterns), `prd.md` (esp. `## Wiki Alignment`), `.oh/skills/wiki/references/schema.md` for the wiki story, `.claude/skills/git/SKILL.md` for commit conventions.
2. **Verify branch** — `feat/559-distill-setup-docs` (per `prd.json` `branchName`). Never push to `development` or `main`.
3. **Implement the chosen story** — confine to that story; resist scope creep. Preserve existing content unless a criterion says to replace it.
4. **Quality checks** — grep gates named in the story's acceptanceCriteria; for the wiki story run `bash .oh/evals/probes/wiki-readme-index.sh`.
5. **Commit** — `task: US-<NNN> — <story title>` with a `Submitted-by:` trailer.
6. **Update `prd.json`** — set `passes: true` and a one-line `notes` with iteration/date/commit.
7. **Append to `progress.txt`** — the per-iteration block (Title/Files/Commit/Result/What I did/Learnings).
8. **Codebase Patterns** — append reusable patterns to the top section.
9. **Stop condition** — when all stories `passes: true`, append `STATUS: COMPLETE` on its own line and print it as the sole final line of output.

## Critical rules

- One story per iteration. Never push to `development`/`main`. Never `--no-verify`. Never `git clone`/`git init`.
- Docs-only: do not edit `install.sh`, `Makefile`, `entrypoint.sh`, `gateway.sh` (Non-Goals) — mismatches are findings, documented, not fixed.
- Wiki story: whitelist the corpus entry with `git add -f`, regenerate the corpus README index, and keep `bash .oh/evals/probes/wiki-readme-index.sh` green.

## Reference

- PRD: `.oh/tasks/distill-setup-docs/prd.md`
- Structured stories: `.oh/tasks/distill-setup-docs/prd.json`
- Branch: `feat/559-distill-setup-docs`
- Issue: #559
