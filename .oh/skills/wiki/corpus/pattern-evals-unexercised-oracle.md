---
title: "A probe that has never failed has an unverified oracle"
slug: pattern-evals-unexercised-oracle
kind: pattern
tags: [evals, probes, oracles, skipped, fault-injection, continual-learning]
created: 2026-08-31
updated: 2026-08-31
sources:
  - .oh/evals/probes/wiki-skill-impact-append-only.sh@bfe22487
  - .oh/evals/probes/wiki-skill-impact-append-only.sh@af1c14ec
  - .oh/skills/eval/run.sh@5b426f97
  - .oh/evals/README.md@9a4c2a8c
confidence: provisional
---

# A probe that has never failed has an unverified oracle

## Relevant Source Files
- `.oh/skills/eval/run.sh` — the runner that assigns PASS, REGRESSION, and SKIPPED and decides which of them fails the suite.
- `.oh/evals/probes/wiki-skill-impact-append-only.sh@bfe22487` — a probe that reported PASS while three parser defects made its comparison meaningless.
- `.oh/evals/probes/wiki-skill-impact-append-only.sh@af1c14ec` — the same probe after fault injection, carrying an override that makes the failing branch reachable.
- `.oh/evals/README.md` — the standing note that a degraded probe does not fail the gate.

## Summary
A probe's status is evidence about the probe only if the probe has been run against
an input that should make it fail. A green result obtained solely from an
already-passing repository proves the PASS branch exists, and nothing about whether
the oracle can detect the condition it was written for. In the evals subsystem both
a defective probe and a self-disabling one present the same non-red status as a
correct one.

## Detail
**Symptom.** A newly added probe reports PASS in a full suite run and is treated as
green. The oracle is in fact inert: at `bfe22487` the ledger probe's record parser
split multi-line record bodies across its tab-delimited read loop, matched the
worked example in the ledger's own documentation as if it were a real record, and
counted trailing blank lines as part of the preceding record, so a legal append read
as an in-place mutation. None of the three defects can produce a non-PASS result on
a repository that is already correct, so the suite never saw them. The
self-disabling variant is quieter still: a probe that exits 2 lands SKIPPED, the
runner labels a first-ever SKIPPED row `new-fail` in its diff column
(`.oh/skills/eval/run.sh:70`) yet excludes SKIPPED from both failure branches
(`.oh/skills/eval/run.sh:76`, `.oh/skills/eval/run.sh:79`) and from the pass-rate
(`.oh/skills/eval/run.sh:112`), so the suite exits 0 while the subject goes
unexercised.

**Root cause.** The three-state oracle is designed so that only a `PASS →
REGRESSION|TIMEOUT|ERROR` transition fails the gate, which is what keeps the suite
hermetic across cold runners; `.oh/evals/README.md:143-152` states the consequence
plainly and assigns the residual risk to the operator rather than to a mechanism.
The result is that "not red" is the default state of every path the suite has never
driven, and probe authors read it as confirmation.

**Workaround.** Before a probe counts as green, drive its REGRESSION branch against
a deliberately broken input, and leave that capability in the probe rather than
performing it once by hand. `.oh/evals/probes/wiki-skill-impact-append-only.sh:34-37`
takes the comparison point from `WIKI_LEDGER_BASE`, so the append-only invariant can
be pointed at a real mutation instead of only asserted; the parser defects surfaced
within minutes of that override existing. Treat a probe whose SKIPPED guard can fire
in the environment that normally runs it as unverified for the same reason, and
prefer a guard whose absence is itself a REGRESSION over one that exits 2.

## See Also
- [[pattern-wiki-ungated-check-drift]]
- [[wikiskill-experience-compilation]]
