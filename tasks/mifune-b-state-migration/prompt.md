# Ralph iteration — mifune-b-state-migration

You are one iteration of a Ralph loop executing the B-state primitive-taxonomy
migration. The full plan is in `tasks/mifune-b-state-migration/prd.md`; the
structured task list is `tasks/mifune-b-state-migration/prd.json`. The loop calls
you again until `progress.txt` contains a line `STATUS: COMPLETE`.

## Your job in ONE iteration

Pick **one** user story — the lowest-`priority` story with `passes: false` —
implement it fully, keep the eval suite green, commit, set `passes: true`, append
a progress entry, then exit. Do not attempt multiple stories per iteration.

## Hard rules (read every iteration)

- You are ALREADY on branch `task/mifune-b-state-migration`. NEVER `git checkout`
  another branch, NEVER create git worktrees, NEVER push to `development`/`main`.
  Just commit locally on the current branch.
- This is **harness infrastructure** work (skills / rules / docs / scripts /
  crons / config) — never sandbox application code.
- **Eval suite is the gate.** Before setting a story `passes: true`, run
  `bash .mifune/skills/eval/run.sh` and confirm **zero `REGRESSION` rows** (every
  probe must be `PASS` or `SKIPPED`). If your change reddens a probe, the probe
  guards the thing you moved — repoint it **in this same story** so it goes green
  again. Then run `git checkout evals/RESULTS.md` to discard timestamp churn (you
  are not adding a probe, so RESULTS.md content must not change).
- **Moving a directory** (`agents`, `hooks`): `git mv` the contents into
  `.mifune/<x>/`, then create a back-symlink `.claude/<x> -> ../.mifune/<x>`
  (`ln -s ../.mifune/<x> .claude/<x>` after the dir is gone). This preserves every
  existing `.claude/<x>` reference, exactly like `.claude/skills -> ../.mifune/skills`.
- **Deprecating a rule**: the template is `context/rules/git.md` — a 3-line
  pointer to the owning skill. Move the rule's content into the skill (as
  `SKILL.md` body or `references/<name>.md`), then leave a thin pointer or delete
  the rule if it has zero inbound refs. Repoint any eval probe that greps the rule.
- Commit message: `task: US-<NNN> — <story title>` with trailers
  `Submitted-by: Claude` and
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
  Stage only files touched by this story (the moved/renamed files, their
  symlinks, repointed refs, the probe edits, `prd.json`, `progress.txt`,
  `CHANGELOG.md`).
- Any `docs/*.md` edit must keep Docusaurus MDX-safe: backtick bare `<...>` and
  bare `{...}`.

## Steps every iteration

1. **Read context**: `prd.json` (find your story), `prd.md` (its full acceptance
   criteria + global invariants), and the top "Codebase Patterns" section + the
   last few entries of `progress.txt`.
2. **Implement the chosen story** per its `acceptanceCriteria` in `prd.json` and
   the matching section of `prd.md`. Confine work to that story.
3. **Verify green**: `bash .mifune/skills/eval/run.sh` → zero REGRESSION. Fix any
   reddened probe by repointing it. Then `git checkout evals/RESULTS.md`.
4. **Commit** with the message format above; stage only this story's files.
5. **Update `prd.json`**: set the story's `passes: true` and `notes` to
   `"Completed <iteration> on <YYYY-MM-DD>; commit <shortsha>"`.
6. **Append to `progress.txt`** (never replace):
   ```
   ## US-<NNN> — <YYYY-MM-DD HH:MM UTC>
   **Title**: <story title>
   **Files changed**: <list>
   **Commit**: <short SHA>
   **Result**: PASS | BLOCKED
   ### What I did
   <2-4 sentences>
   ### Learnings for future iterations
   <patterns / gotchas>
   ---
   ```
   If you discovered a reusable convention, also append it to a `## Codebase
   Patterns` section at the **top** of `progress.txt`.
7. **If BLOCKED** (you cannot satisfy the acceptance criteria without a decision
   above your authority — e.g. a relocation that cannot keep CI+eval green):
   leave the story `passes: false`, write `**Result**: BLOCKED` with a precise
   one-paragraph description of the block and what you tried, commit the partial
   safe progress, and **do not** append the completion marker. Surface the block;
   never ship a broken harness to force completion.
8. **Stop condition**: after step 6, if ALL stories in `prd.json` are
   `passes: true`, append a final line on its own to `progress.txt`:
   ```
   STATUS: COMPLETE
   ```
   and also print `STATUS: COMPLETE` as the sole content of your final output
   line. Never print that bare line for any other reason.
