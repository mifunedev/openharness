---
title: "Contract probes that pin multi-word prose break on reflow, not on drift"
slug: pattern-evals-prose-literal-pinning
kind: pattern
tags: [evals, probes, contract-text, grep, false-failure, documentation]
created: 2026-08-31
updated: 2026-08-31
sources:
  - .oh/evals/probes/wiki-kind-schema-contract.sh@bfe22487
  - .oh/skills/wiki/references/schema.md@c841e567
confidence: provisional
---

# Contract probes that pin multi-word prose break on reflow, not on drift

## Relevant Source Files
- `.oh/evals/probes/wiki-kind-schema-contract.sh@bfe22487` — ten pinned literals over one reference document; the two longest were the two that failed.
- `.oh/skills/wiki/references/schema.md@c841e567` — the pinned document, hard-wrapped prose.

## Summary
A contract probe that asserts a reference document still says something usually does
it with a fixed-string grep. When the pinned string is a whole sentence and the
document is hard-wrapped, the assertion is bound to the line breaks rather than to
the claim, and any rewrap fails the probe without the contract having changed.

## Detail
**Symptom.** A probe reports REGRESSION naming a sentence that is plainly still
present in the document it guards. The failure is a line break inside the pinned
string: `grep -qF` matches within a single line, so a sentence the author wrote as
one clause but the file stores across two lines can never match. Two of the ten
`need` assertions in `.oh/evals/probes/wiki-kind-schema-contract.sh:22-31` failed on
their first run for exactly this reason, against unchanged contract text; the
remaining eight, which pin short fragments, table cells, and code tokens, matched
immediately.

**Root cause.** The probe's matcher operates on lines
(`.oh/evals/probes/wiki-kind-schema-contract.sh:18-20`) while the contract it means
to pin is a claim. Nothing in the assertion distinguishes the load-bearing words
from the incidental whitespace that a formatter, an editor's rewrap, or a later
sentence-length edit will move. The longer the pinned string, the higher the
probability it spans a wrap boundary, so the failure rate rises with the very
specificity that made the assertion feel rigorous.

**Workaround.** Pin the shortest fragment that is still unique and unambiguous, and
choose it so it cannot straddle a line break: a heading, a table cell, a code token,
or the distinctive four-to-six words of the claim. The surviving assertions in
`.oh/evals/probes/wiki-kind-schema-contract.sh:22-31` are all of that shape, and
several deliberately stop mid-sentence at the wrap boundary rather than reach past
it. Where a whole-sentence assertion is genuinely required, normalize before
matching — fold the document's whitespace to single spaces and match against the
normalized text — instead of pinning the stored bytes.

## See Also
- [[pattern-evals-unexercised-oracle]]
- [[pattern-docs-prohibition-by-example]]
