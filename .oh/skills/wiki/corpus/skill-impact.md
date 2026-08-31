# skill-impact — the harness's skill-change ledger

Append-only. One record per skill-edit proposal, one record per verdict. Records are
appended at the end and never edited in place; `SI-nnnn` ids increase monotonically.

Written by exactly two skills: `/builder` appends the `PROPOSED` record at the moment
its edit lands, and `/benchmark` appends the matching `SI-nnnn-V` verdict record when
it scores that change. Read by `/builder`, before it proposes — a record marked
`REJECTED` is a change already tried and refused, and must not be re-proposed without
new evidence that contradicts the recorded validation.

This file carries **no YAML frontmatter** deliberately. Both `/wiki lint` § 3 and
`.oh/evals/probes/wiki-readme-index.sh` skip files with no `slug:` field, so the
ledger is excluded from the corpus index by construction. It is not an entity page
and is not returned by `/wiki query`.

Guarded by `.oh/evals/probes/wiki-skill-impact-append-only.sh`.

## Why this is not the deleted memory tier

The `.oh/memory` tier was removed as a concept because it held one entry per session,
keyed by date, gitignored, with nothing reading it. Every structural property here is
the opposite.

| `.oh/memory` (deleted) | `skill-impact.md` |
|---|---|
| One entry per **skill invocation** — every run, whatever the outcome | One record per **skill-edit proposal** — a durable change to a tracked artifact |
| Growth unbounded in sessions | Growth bounded by merged changes that edit `.oh/skills/` |
| No consumer; nothing read it | Two consumers: `/builder` reads it before proposing, `/benchmark` reads it for the redirect signal |
| Duplicated what `git log` already held | Holds what `git log` does **not**: the motivating pattern, the validation result, and — critically — **rejected proposals, which leave no git trace at all after a revert** |
| Any skill could write | Exactly two writers, both orchestrator-only |

The sharp test is `/retro`'s own anti-pattern, "inventing a file to save a lesson
in". This file saves no lessons — lessons live in `corpus/pattern-*.md`. It records
**decisions about skills**, which today live nowhere.

## Record format

A proposal record and its verdict record are two separate appends, never one record
mutated twice. `/builder` lands the edit; a human merges it; `/benchmark` scores it
later. Mutating the `PROPOSED` record in place to add a verdict would break
append-only and make the invariant unenforceable.

````markdown
## SI-nnnn · YYYY-MM-DD · builder · PROPOSED

- **proposal**: <one sentence — what changes and why it should help>
- **target**: <exactly one repo-relative artifact path>
- **motivating patterns**: [[pattern-slug]], [[pattern-slug]] — or `none (direct request)`
- **proposer**: /builder <type>, <session or issue reference>
- **diff**:

```diff
<git diff scoped to the target path>
```

## SI-nnnn-V · YYYY-MM-DD · benchmark · ACCEPTED

- **for**: SI-nnnn
- **floor**: /eval rc=<n>, <n> regressions (`.oh/evals/RESULTS.md`@<short-sha>)
- **ceiling**: suite score <before> → <after>; <task> <before> → <after>
- **verdict**: BENEFICIAL | NOT-BENEFICIAL — ACCEPTED | REJECTED
````

`motivating patterns: none (direct request)` is a legitimate value. Not every skill
edit answers a compiled pattern, and recording that honestly is better than inventing
a pattern to cite.

## Records

<!-- Appended below this line, oldest first. Never edit an existing record. -->

## SI-0001 · 2026-08-31 · builder · PROPOSED

- **proposal**: add a `related:`-slug resolution check to `/wiki lint` and a deterministic probe that fails on the findings, so an unrun report-only check cannot hide broken links
- **target**: `.oh/skills/wiki/references/lint.md`
- **motivating patterns**: [[pattern-wiki-ungated-check-drift]]
- **proposer**: /builder skill, wiki co-evolution change (branch `skill/wiki-coevolution`)
- **diff**: `8fab04ab` — `/wiki lint` § 7a plus `.oh/evals/probes/wiki-related-slugs.sh`

## SI-0001-V · 2026-08-31 · benchmark · ACCEPTED

- **for**: SI-0001
- **floor**: /eval rc=0, 0 regressions over 112 probes (`.oh/evals/RESULTS.md`@af1c14ec)
- **ceiling**: suite score 1.50 -> 1.22 — **not a comparable delta.** The suite gained CB-005 in the same change, so the mean is taken over a different task set than the 1.50 it is being compared to. The meaningful number is CB-005's own first score, 0.67, against an honest prior of 0.00.
- **verdict**: BENEFICIAL — ACCEPTED. The floor held, and the change moved the one axis it targeted from an unmeasured 0.00 to a measured 0.67. Recorded with the caveat above rather than as a clean ceiling rise, because a rise produced by adding a task the harness scores badly on is not the same evidence as a rise on a fixed task set.

## SI-0002 · 2026-08-31 · builder · PROPOSED

- **proposal**: close three ambiguities in `/wiki compile` § 3-4 that a delegated maintainer run hit — the slug subsystem vocabulary, per-retro fan-out, and dual shas for a defect observed and fixed in one session
- **target**: `.oh/skills/wiki/references/compile.md`
- **motivating patterns**: [[pattern-wiki-external-model-over-mapping]] — its workaround is that a mapping is complete only when its exclusions are written down in the local vocabulary; the slug-token mismatch is the same defect one level down, a foreign taxonomy left un-translated in the local procedure
- **proposer**: /builder skill, prompted by the delegated `/wiki compile` run's flagged judgment calls
- **diff**: `.oh/skills/wiki/references/compile.md` § 3 fan-out and subsystem-token rules, § 4 dual-sha rule
