---
title: "A simplify round seeded with the audit's own measurement is non-reducing by construction"
slug: pattern-spec-simplify-round-seeded-non-reducing
kind: pattern
tags: [spec, audit, simplify, netAdded, bookkeeping, monotone-stop]
created: 2026-09-03
updated: 2026-09-03
sources:
  - .oh/skills/spec/references/execute.md@2c955907
  - .oh/skills/audit/scripts/implementation-gates.sh@2c955907
  - .oh/tasks/sandbox-registry/simplify-rounds.json@b2fcc812
  - .oh/tasks/sandbox-registry/evidence.md@b2fcc812
confidence: provisional
---

# A simplify round seeded with the audit's own measurement is non-reducing by construction

## Relevant Source Files
- `.oh/skills/spec/references/execute.md@2c955907` — step 5: the owner writes `simplify-rounds.json` from `slop-metrics`, and the loop ends on a non-reducing round or the cap.
- `.oh/skills/audit/scripts/implementation-gates.sh@2c955907` — `slop-metrics`, the measurement gate 5 compares against `prevNetAdded`.
- `.oh/tasks/sandbox-registry/simplify-rounds.json@b2fcc812` — the round record as it stood at the first audit.

## Summary
The simplify sub-loop stops when a round's `netAdded` does not fall strictly below
the previous round's. If the owner writes the round record *before* the first
audit, using the same `slop-metrics` call the audit will make, the audit's
"previous" value equals its own measurement, the round is declared non-reducing,
and the loop ends after one round with every residual still unaddressed.

## Detail
**Symptom.** The first `/audit implementation` on a task reports gate 5 as
"non-blocking (monotone stop)" with `rounds=1 prevNetAdded=N` and `netAdded N`,
lists residual findings, and passes with `SIMPLICITY-RESIDUAL`. No simplification
was attempted; the residuals are real (in #950: a one-importer re-export shim, a
one-call-site helper, a config file parsed twice — about 25 lines).

**Root cause.** The round record has two readers with different expectations. The
owner treats it as "the state of the diff going into the audit" and seeds it from
the current measurement. The audit treats `netAdded` in the record as "the value
measured at the *previous* round" and compares its fresh measurement to it. When
both come from the same tree, equality is guaranteed, and the monotone rule —
written to end a loop that has stopped improving — fires on a loop that has not
started.

**Workaround.** Write the round record *after* an audit has measured and after
the owner has acted on its findings: round 1 is recorded when the first residuals
have been removed and `netAdded` re-measured, so `prevNetAdded` is a real prior
value. Equivalently, seed the first record with `netAdded` unset (or the base's
value) so the first comparison is against nothing. Do not "fix" this by relaxing
the strict-decrease rule; the rule is right, the seeding is wrong.
