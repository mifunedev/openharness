# `/spec retro` — compatibility wrapper for `/retro --task <slug>`

> Detail doc for the **`retro`** subcommand of the `/spec` skill
> (`.oh/skills/spec/SKILL.md`). Argument form: `retro <slug> [--dry-run]`.
> The dispatcher passes the argument string after `retro` to this procedure as
> `$ARGUMENTS`. Authority: `.oh/skills/spec/SKILL.md`.

**This subcommand owns no behavior.** It is a one-line alias kept because
`/spec execute`'s tail and several existing callers spell the task-scoped
retrospective this way:

```text
/spec retro <slug> [--dry-run]   ≡   /retro --task <slug> [--dry-run]
```

Read `.oh/skills/retro/SKILL.md` and follow it with `--task <slug>` (plus
`--dry-run` when supplied). Nothing else happens here.

## Why a wrapper and not a second node

`/retro` already implements the whole scientific pass — falsifiable hypotheses,
evidence for *and* against, verdict plus confidence, and a propose-then-confirm
nomination of candidate probes. Its `--task <slug>` flag already scopes that pass
to one `.oh/tasks/<slug>/` run.

There is therefore exactly **one** retro ontology, and it lives in `/retro`.
Earlier revisions of this document described `/spec retro` as owning a
propose-and-write gate, which was never true: `/retro` is report-only by contract
(guarded by `.oh/evals/probes/retro-deterministic-contract.sh`) and `/wiki
compile` is the durable pattern writer. Restating either here would create a
second description that drifts from the one that runs.

| Concern | Owner |
|---|---|
| Hypotheses, evidence, verdicts, confidence, probe nominations | `/retro` |
| Scoping that pass to one task folder | `/retro --task <slug>` |
| Writing durable `kind: pattern` pages from the report | `/wiki compile` |
| Deciding promotability of the implementation | the implementation audit route, earlier in `/spec execute` |

## Inputs

| Arg | Meaning |
|-----|---------|
| `<slug>` | The task slug, passed through as `--task <slug>`. Required. |
| `--dry-run` | Passed through: report only. |

If `.oh/tasks/<slug>/` has no `prd.md`, there is no build to reflect on — say so
and fall back to a plain `/retro` on the session.

## Pipeline position

Within the workflow owned by `.oh/skills/spec/SKILL.md`, this runs inside the
`spec-execute` tail, after the implementation audit passes and `evidence.md` is
written, and before `/wiki compile` turns the supported lessons into durable
pattern pages. It writes no file of its own, and it always completes, so the
execute tail always continues.

## See Also

- `.oh/skills/retro/SKILL.md` — the engine; report-only by contract
- `.oh/skills/wiki/references/compile.md` — the durable pattern writer
- `.oh/skills/spec/references/execute.md` — the tail this runs inside
