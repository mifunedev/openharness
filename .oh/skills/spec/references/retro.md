# `/spec retro` — capture the build's lessons

> Detail doc for the **`retro`** subcommand of the `/spec` skill
> (`.oh/skills/spec/SKILL.md`). Argument form: `retro <slug> [--dry-run]`.
> The dispatcher passes the argument string after `retro` to this procedure as
> `$ARGUMENTS`. Authority: `.oh/skills/spec/SKILL.md`.

The **reflection** node of the `/spec` workflow runs
inside `/spec execute`'s tail, after `build ⇄ audit` reaches `AUDIT-PASS` and the evidence
step has run, and before `improve`, to turn the execution run into durable,
evidence-tested lessons.

**Core principle: compose `/retro`, scoped to this task.** `/retro` already implements the
scientific session-closing pass — falsifiable hypotheses, evidence for *and* against, a
verdict + confidence, and a propose-then-confirm nomination of candidate probes under
`.oh/evals/probes/`. `retro` is the execution-side application of it: point `/retro`
at the just-built `.oh/tasks/<slug>/` run so the reflection is anchored to that unit's
artifacts (`prd.md`, `progress.txt`, `prd.json`, the `/audit implementation` evidence)
rather than the whole ambient session.

It is **not** a second retro engine. The propose-then-confirm gate, the five-subsystem lens,
and the promotion rules all live in `/retro`; `retro` only frames the scope and
records that the execution stage ran its retro.

---

## Inputs

| Arg | Meaning |
|-----|---------|
| `<slug>` | The task slug — the retro reads `.oh/tasks/<slug>/` artifacts as its primary signal source. Required. |
| `--dry-run` | Passed through to `/retro`: report only (`Result: DRY-RUN`). |

If `.oh/tasks/<slug>/` has no `progress.txt`/`prd.md`, there is no build to reflect on — say so
and fall back to a plain `/retro` on the session, or skip with a note in the report.

---

## Run

Invoke `/retro` with the execution scope made explicit — gather signals primarily from
this task's artifacts: what the `prd.md` intended vs. what `progress.txt` shows shipped,
what the `build ⇄ audit` loop revealed (how many
FAIL→build cycles, and why), and any coupling/constraint the run surfaced. Then let `/retro`
do its scientific pass: form falsifiable hypotheses, test each for and against, assign
verdict + confidence, and present supported `medium`+ lessons for confirmation before any
write. Always reports, even on a trivial/no-lesson run.

---

## What this node does NOT do

- **Re-implement retro.** The hypothesis engine, qualify filter, and propose-then-confirm
  gate are `/retro`'s; `retro` only scopes them to the task.
- **Audit or decide promotability.** That was `/audit implementation` (the `build ⇄ audit` loop) earlier in
  `/spec execute`.
- **Run the grooming triad.** `/audit skills` · `/wiki lint` · `/audit drift` are no longer a
  step of `/spec execute` at all — the triad was cut in US-003's follow-on because
  `/audit drift` already runs hourly from the heartbeat cron and the other two never blocked
  a merge. Run them on their own cadence, or on demand.
- **Merge or undraft.** No GitHub-side mutation — reflection only.

## Pipeline position

Within the workflow owned by `.oh/skills/spec/SKILL.md`, `retro` runs inside the
`spec-execute` tail (`build ⇄ audit → evidence → spec-retro → improve`). The next
step is `improve` (compound · compress · benchmark).

The terminal artifact is the report itself plus whatever the propose-then-confirm gate
actually wrote. Report the counts. There is no `STATUS: SPEC-RETRO-DONE` token — it had no
executable consumer. The supported lessons in that report become durable in the next step,
`improve`, via `/wiki compile`; this subcommand writes no file of its own.

The `/spec` family's authority is `.oh/skills/spec/SKILL.md`. `retro` always
completes (like `/retro`), so the execute tail always continues to `improve`.
