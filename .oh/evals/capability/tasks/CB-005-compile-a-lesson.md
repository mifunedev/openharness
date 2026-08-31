---
id: CB-005
slug: compile-a-lesson
title: "Compile one session's lesson into a validated skill change"
axes: [success, cost-time, unattended]
skills: [/retro, /wiki, /builder, /benchmark]
created: 2026-08-31
---

# CB-005 · Compile one session's lesson into a validated skill change

## Task
Carry one supported lesson end-to-end, from observation to a recorded verdict:
`/retro` produces a `supported` hypothesis at `medium`+ confidence → `/wiki compile`
creates or patches exactly one `kind: pattern` page → `/builder` proposes one atomic
edit to one artifact, **citing the motivating pattern slug it read** → `/benchmark`
emits a verdict → `.oh/skills/wiki/corpus/skill-impact.md` holds a `PROPOSED` record
and its matching `-V` verdict record.

The capability under test is whether the harness can turn an observation into a
durable, cited, validated artifact change without inventing a session journal — and
whether a **rejected** proposal still leaves knowledge behind.

This is the axis the harness could not previously see. `/retro` nominates probe ids
and writes nothing; before this task existed, the newest probe carrying `retro lesson`
provenance was dated 2026-06-19, roughly ten weeks stale, and no instrument measured
that gap. `CB-003` scored the nearest capability and was retired when `/retro` became
report-only, leaving the ceiling with no view of knowledge persistence at all.

## Success signal
- A tracked `.oh/skills/wiki/corpus/pattern-*.md` whose `## Detail` names an
  observable symptom and a `path:line` root cause, and whose `sources:` uses the
  pinned `<path>@<short-sha>` evidence form.
- `/builder`'s report names the `[[pattern-...]]` slug it read, or records
  `none (direct request)` honestly.
- `skill-impact.md` gained exactly one `SI-nnnn` record and one `SI-nnnn-V` record;
  no existing record was edited.
- On a `REJECTED` verdict, the pattern page and both ledger records survive the
  revert, with `wiki-pattern-persistence.sh` and `wiki-skill-impact-append-only.sh`
  green.
- `/eval` green; `wiki-readme-index.sh` green after the index regeneration.

## Rubric
| Axis | PASS | PARTIAL | FAIL |
|------|------|---------|------|
| success | The full chain runs — retro → compile → builder → benchmark → two ledger records — and the rejected-path persistence invariant is exercised at least once against a real revert | The chain runs but the pattern prose was hand-written by the operator, or the persistence invariant was asserted by probe text rather than exercised against a revert | The lesson lands only in a commit message, or `/wiki compile` produced a dated per-run page instead of one page per failure mode |
| cost-time | One pass carries the lesson through, no rework | One re-entry (a pattern page rewritten, or a proposal re-scoped) before the chain completes | Repeated rework, or the chain abandoned partway |
| unattended | No operator-authored pattern prose anywhere in the chain | The operator wrote or substantially rewrote the pattern body | The operator drove each step by hand |

## Scoring method
v1 rubric inspection **after at least one real run**.

It is legitimate to score `PARTIAL` on day one. It is **not** legitimate to score
`PASS` by rubric inspection with zero runs — that is precisely the `CB-004` failure
this task exists partly to avoid: a manifest, a scorer, and an ablation harness all
landed and stood for two months while the measurement was never taken once, so the
row held at "machinery-added" for that entire span and the benchmark showed nothing
in either direction.

## Evidence basis
The three-layer separation and the never-rollback invariant this task scores come
from `[[wikiskill-experience-compilation]]` (arXiv 2608.27454), whose ablation
measured persistent knowledge for the proposer at +15.0 against no persistence. The
harness-side contract lives in `.oh/skills/wiki/references/schema.md` §§ 2, 7a, 8 and
`.oh/skills/wiki/references/compile.md`.

## Baseline reset
Scored for the first time in the change that introduced `/wiki compile`, the
`kind: pattern` layer, and the `skill-impact.md` ledger. There is no pre-change
baseline: before that change the chain had no owner past `/retro`'s report, so the
honest prior value on every axis is `FAIL` (score 0.00).
