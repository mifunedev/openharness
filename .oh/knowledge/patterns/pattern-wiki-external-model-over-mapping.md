---
title: "Mapping an external model onto the harness reimports a tier it deleted"
slug: pattern-wiki-external-model-over-mapping
kind: pattern
tags: [wiki, ingest, architecture, external-sources, scope-creep, design-review]
created: 2026-08-31
updated: 2026-08-31
sources:
  - .oh/knowledge/source/wikiskill-experience-compilation.md@933f6741
  - .oh/skills/wiki/references/compile.md@c841e567
  - .oh/skills/wiki/references/schema.md@c841e567
confidence: provisional
---

# Mapping an external model onto the harness reimports a tier it deleted

## Relevant Source Files
- `.oh/knowledge/source/wikiskill-experience-compilation.md@933f6741` — the ingested paper whose layer model was mapped onto the local corpus.
- `.oh/skills/wiki/references/compile.md@c841e567` — the resulting subcommand, and the explicit prohibition the mapping needed.
- `.oh/skills/wiki/references/schema.md@c841e567` — the same prohibition stated in the schema.

## Summary
Adopting an external architecture works structure by structure, and the structures
that transfer cleanly build confidence in the one that does not. The dangerous case
is a foreign tier that has no local counterpart because the harness deliberately
removed its equivalent — the mapping reintroduces it under the source's vocabulary,
where the original deletion rationale no longer matches the name.

## Detail
**Symptom.** A design derived from an ingested paper proposes a structure that a
prior deliberate deletion forbids, and it does not read as a regression because it
arrives under the source's terminology rather than the local one. Mapping the paper
at `.oh/knowledge/source/wikiskill-experience-compilation.md@933f6741` onto the
corpus proposed snapshotting session retrospective reports into the corpus's raw
tier. Six of seven mapped structures transferred without objection; the seventh
would have rebuilt the removed per-session journal tier — one dated entry per run,
no consumer — as a raw-layer capture. Design review caught it, not a probe.

**Root cause.** The local rule and the foreign structure are stated in different
vocabularies, so the collision is invisible to a structural mapping. The deleted
tier was removed as a concept, not relocated, and the corpus's raw tier holds
snapshots of external sources only. A run's own report is neither, and the harness's
retrospective route is report-only by contract, so persisting its output anywhere
also launders around that contract. Both facts had to be recalled by a reader; no
artifact carried the mapping's exclusion.

**Workaround.** When mapping an external model, enumerate the structures that do
*not* transfer and write the refusal into the local contract in the local
vocabulary, at the same time as the structures that do. The mapping is complete only
when its exclusions are written down. Both
`.oh/skills/wiki/references/compile.md:113-116` and
`.oh/skills/wiki/references/schema.md:167-171` now state the prohibition explicitly,
each naming the removed tier and the report-only contract, so the next reader
deriving a design from the same paper meets the exclusion inside the local
documents rather than having to remember it.

## See Also
- [[wikiskill-experience-compilation]]
- [[pattern-wiki-ungated-check-drift]]
