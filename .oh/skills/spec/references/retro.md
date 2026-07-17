# `/spec retro` — capture the build's lessons

> Detail doc for the **`retro`** subcommand of the `/spec` skill
> (`.oh/skills/spec/SKILL.md`). Argument form: `retro <slug> [--dry-run]`.
> The dispatcher passes the argument string after `retro` to this procedure as
> `$ARGUMENTS`. Authority: `AGENTS.md § The Workflow`.

The **reflection** node of the `spec-*` family (`AGENTS.md § The Workflow`). It runs
inside `/spec execute`'s tail, after `build ⇄ audit` reaches `AUDIT-PASS` and before the
`improve` and `groom` steps, to turn the execution run into durable, evidence-tested
lessons.

**Core principle: compose `/retro`, scoped to this task.** `/retro` already implements the
scientific session-closing pass — falsifiable hypotheses, evidence for *and* against, a
verdict + confidence, and a propose-then-confirm promotion into `.oh/memory/MEMORY.md` /
`.oh/context/IDENTITY.md`. `retro` is the execution-side application of it: point `/retro`
at the just-built `.oh/tasks/<slug>/` run so the reflection is anchored to that unit's
artifacts (`prd.md`, `progress.txt`, `prd.json`, `critique.md`, the `/audit` evidence)
rather than the whole ambient session.

It is **not** a second retro engine. The propose-then-confirm gate, the six-subsystem lens,
and the memory-tier rules all live in `/retro`; `retro` only frames the scope and
records that the execution stage ran its retro.

---

## Inputs

| Arg | Meaning |
|-----|---------|
| `<slug>` | The task slug — the retro reads `.oh/tasks/<slug>/` artifacts as its primary signal source. Required. |
| `--dry-run` | Passed through to `/retro`: write only the log entry (`Result: DRY-RUN`); never write `MEMORY.md`/`IDENTITY.md`. |

If `.oh/tasks/<slug>/` has no `progress.txt`/`prd.md`, there is no build to reflect on — say so
and fall back to a plain `/retro` on the session, or skip with a logged note.

---

## Run

Invoke `/retro` with the execution scope made explicit — gather signals primarily from
this task's artifacts: what the `prd.md` intended vs. what `progress.txt` shows shipped,
which `critique.md` findings materialized, what the `build ⇄ audit` loop revealed (how many
FAIL→build cycles, and why), and any coupling/constraint the run surfaced. Then let `/retro`
do its scientific pass: form falsifiable hypotheses, test each for and against, assign
verdict + confidence, and present supported `medium`+ lessons for confirmation before any
write. Always logs, even on a trivial/no-lesson run.

`retro` does not bypass `/retro`'s confirmation gate — `MEMORY.md`/`IDENTITY.md` writes
still require explicit approval (or are skipped under `--dry-run`).

---

## What this node does NOT do

- **Re-implement retro.** The hypothesis engine, qualify filter, and propose-then-confirm
  gate are `/retro`'s; `retro` only scopes them to the task.
- **Audit or decide promotability.** That was `/audit` (the `build ⇄ audit` loop) earlier in
  `/spec execute`.
- **Run the grooming triad.** `/audit skills` · `/wiki lint` · `/audit drift` are the `groom`
  step of `/spec execute`, after this one.
- **Merge or undraft.** No GitHub-side mutation — reflection only.

---

## Memory Protocol

`/retro` writes its own log entry. `retro` ensures it is tagged to the unit; if `/retro`
did not, add one line to `.oh/memory/<UTC-date>/log.md` per `.oh/skills/retro/references/memory-protocol.md`:

```markdown
## spec-retro -- HH:MM UTC
- **Result**: OP | DRY-RUN
- **Slug**: <slug>
- **Lessons**: <n> supported / <n> promoted (or "none durable")
- **Observation**: <one sentence>
```

---

## Pipeline position

Within `AGENTS.md § The Workflow` (`select → spec-plan ⇄ spec-critique → spec-execute →
merge → reset|clean`), `retro` runs inside the `spec-execute` tail (`build ⇄ audit →
spec-retro → improve → groom`); the next step is `improve` (compound · compress ·
benchmark). Print this bare token as the final line:

    STATUS: SPEC-RETRO-DONE

The `/spec` family's authority is `AGENTS.md § The Workflow`. `retro`
always completes (like `/retro`), so the execute tail always continues to `improve`.
