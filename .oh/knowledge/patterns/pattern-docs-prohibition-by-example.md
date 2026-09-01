---
title: "Documenting a forbidden literal by quoting it violates the rule"
slug: pattern-docs-prohibition-by-example
kind: pattern
tags: [docs, evals, probes, vocabulary, guards, self-reference]
created: 2026-08-31
updated: 2026-09-01
sources:
  - .oh/evals/probes/audit-stale-references.sh@ce7b7db2
  - .oh/evals/probes/knowledge-path-single-owner.sh@fcbeedea
  - .oh/tasks/repo-knowledge-loop/evidence.md@fcbeedea
  - .oh/skills/wiki/references/schema.md@c841e567
  - .oh/skills/wiki/references/compile.md@c841e567
confidence: provisional
---

# Documenting a forbidden literal by quoting it violates the rule

## Relevant Source Files
- `.oh/evals/probes/audit-stale-references.sh@ce7b7db2` — the guard that greps every tracked file for retired names, and the model for how a guard exempts its own definition.
- `.oh/skills/wiki/references/schema.md@c841e567` — an authoring constraint that points at the guard instead of copying its list.
- `.oh/skills/wiki/references/compile.md@c841e567` — the matching anti-pattern bullet, written the same way.

## Summary
A guard that forbids a set of literals across all tracked files also scans the prose
that explains the prohibition. Writing "do not use X" with X spelled out makes the
document a violation of its own rule. The failure appears twice per rule on average:
once where the rule is defined, once where it is restated for authors.

## Detail
**Symptom.** Adding an authoring note that enumerates the retired names an existing
guard rejects turns that note into a REGRESSION from the guard, naming the file that
was written to prevent the violation. It happened in both documents that describe
pattern authoring: the anti-pattern bullet in
`.oh/skills/wiki/references/compile.md:195-198` and the authoring constraint in
`.oh/skills/wiki/references/schema.md:173-177` each listed the retired tokens
verbatim on first draft and each tripped the guard.

**Root cause.** The guard's pathspec is the whole tracked tree minus a short,
hand-maintained exclusion list (`.oh/evals/probes/audit-stale-references.sh:9`), and
its only self-reference exemption is for the two probe files that must hold the
pattern to test it (`.oh/evals/probes/audit-stale-references.sh:17`). Nothing
distinguishes a use of a retired name from a mention of it, and nothing should — a
mention-versus-use exemption is exactly the hole through which retired vocabulary
comes back. The documentation is therefore inside the guard's scope by design, and
enumeration is the natural way to write a prohibition.

**Workaround.** Do not restate the forbidden set in prose. Name the guard and let
the reader read the list from the one file that is allowed to hold it, which is what
`.oh/skills/wiki/references/schema.md:173-177` does. This keeps a single source of
truth for the vocabulary as well: an enumeration in a document is a copy that drifts
the next time the guard's list changes. Where a document genuinely must show a
forbidden literal, add the specific `path:line` to the guard's exemption list rather
than broadening its exclusion pathspec — the narrow exemption stays reviewable and
cannot silently cover a real violation elsewhere in the same file.

Issue #926 found the sharpest instance: the guard fired on the **evidence
document written to prove the migration was complete**, whose shell transcripts
quoted the retired path as literal command text. `/audit implementation` gate 2
returned `AUDIT-FAIL` naming two lines of `evidence.md`. Two further rules follow
from that. First, a guard that scans every tracked file also scans the proof, so
transcripts must resolve a retired path programmatically — from the base tree, or
from the guard's own output — rather than pasting it. Second, do **not** exempt
the document that describes the migration: an exemption there is a hole in the
guard placed exactly where the retired vocabulary is most likely to be reused.
The guard authored for this migration
(`.oh/evals/probes/knowledge-path-single-owner.sh`) also follows the other half of
the rule — it assembles the forbidden path from fragments, so it is not a hit for
itself and needs no self-exemption at all.

## See Also
- [[pattern-evals-prose-literal-pinning]]
