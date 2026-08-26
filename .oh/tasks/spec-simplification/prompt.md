# Story iteration — spec-simplification

You are implementing the `spec-simplification` task. The full plan is in
`.oh/tasks/spec-simplification/prd.md` and the structured task list is in
`.oh/tasks/spec-simplification/prd.json`. Work is done when `progress.txt`
contains a line `STATUS: COMPLETE`.

## What this task is

`/spec` becomes the single primary method of implementation, and the pipeline is
made to answer back to the plan. You are removing large amounts of machinery. The
governing rule for every removal:

> **A removed path must leave no residue discoverable in the file layout.** An
> agent exploring the repo mid-task will find a secondary path and follow it. That
> is exactly how a long-horizon run gets polluted. Deletion means gone, not
> deprecated.

## Order is not negotiable

`US-001 → US-002 → US-003 → US-004 → US-005 → US-006`, then `US-007`.

US-003 rewrites `execute.md`, which US-005 and US-006 then edit — so it must
precede them. US-001 and US-002 shrink `/ship-spec` before US-003 absorbs it, so
the surface to transcribe is smaller and the probes get repointed once.

US-007's `probe:` strip is safe to land early; its annotation step should land
last, so the marks reflect what the run learned.

## Bootstrapping hazard — read this before US-004

You are editing the skills that define your own behavior. US-004 deletes
`.oh/prompts/advisor/`, which your own session prompt derives from. Your prompt
was rendered at launch, before that deletion, and the ordered anchor list you need
is recorded verbatim in `.oh/skills/firstmate/templates/session-prompt.md` lines
42-52. **Do not re-read the advisor pack mid-run** — after US-004 it is gone, and
you do not need it.

## Your job in one story

Pick the lowest-`priority` story where `passes: false`, implement it fully, commit,
flip `passes: true`, and append a progress entry. Do not batch stories.

## Steps every story

1. **Read context** — in this order:
   - `.oh/tasks/spec-simplification/prd.json` — your story
   - `.oh/tasks/spec-simplification/progress.txt` — the `Codebase Patterns`
     section at the top, then the most recent entries
   - `.oh/tasks/spec-simplification/prd.md` — including `## Wiki Alignment`
     (`Impact: REQUIRED`, so a story touching the corpus must keep it aligned)
   - `.oh/skills/wiki/references/schema.md` when touching `.oh/skills/wiki/corpus/`
   - `.claude/skills/git/SKILL.md` for branch and commit conventions

2. **Verify branch** — `feat/spec-simplification`, in the worktree at
   `.oh/worktrees/spec-simplification`. You are already there; do not check the
   branch out anywhere else. The main checkout is on `development` and may have a
   live session in it.

3. **Implement.** `/delegate` is available for genuinely disjoint-file work inside
   one story, and never replaces the story cycle. **You flip `passes: true`, never
   a delegate** — delegates do not self-certify, and a delegate's claim that work
   landed is not evidence. Check `git status` yourself.

4. **Probes are not optional and not adjustable.** Several stories rewrite probes.
   Rewriting a probe to describe the new world is correct. **Relaxing a probe so a
   removal passes is the failure mode this whole task exists to fix.** Every probe
   you touch must be *verified by rejection*: show it fails against a deliberately
   broken copy before you accept that it passes against the real tree. Exit 0
   proves nothing.

5. **Run the no-residue check** after any removal:
   ```
   grep -rn "<removed-name>" --include="*.md" --include="*.sh" --include="*.ts" \
     --include="*.yml" --include="*.mjs" --include="*.json" . \
     | grep -v "^./.git/" | grep -v worktrees/ | grep -v "^./CHANGELOG.md"
   ```
   It must return nothing. A hit is unfinished work, not an acceptable leftover.

6. **Commit** with `<type>: <description>`. `.oh/tasks/*` is gitignored
   (`.gitignore` line 12) — task-folder files need `git add -f`.

7. **Append a progress entry** — what you did, files changed, and anything the
   next story needs to know. Put durable repo facts in `Codebase Patterns`.

## Definition of done for the whole task

`bash .oh/skills/eval/run.sh` shows no green-to-red regression other than probes
this task deliberately rewrote, a full build runs with `.oh/skills/ship-spec/` and
`.oh/prompts/advisor/` absent, and the merge-gate output lets a reader who did not
watch the build state what changed, why it differs from the plan, and what is
still unverified.

When all seven stories have `passes: true` and that holds, append the whole line:

```
STATUS: COMPLETE
```
