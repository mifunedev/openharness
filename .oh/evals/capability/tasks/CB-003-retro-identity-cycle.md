---
id: CB-003
slug: retro-identity-cycle
title: "Close a session with a falsifiable retro that compounds a lesson"
axes: [success, cost-time, unattended]
skills: [/retro]
datasets: [DS-020]
created: 2026-06-15
---

# CB-003 · Close a session with a falsifiable retro that compounds a lesson

## Task
At session close, produce a scientific retrospective and compound a durable lesson from it. The capability under test is the harness's ability to convert raw session signals into falsifiable, evidence-cited hypotheses, judge them, and promote the ones that generalize into `.oh/context/IDENTITY.md` so the next session starts informed rather than re-deriving the same observation.

## Success signal
- A `/retro` run yields **≥1 falsifiable hypothesis**, each carrying a verdict (`supported` / `refuted` / `inconclusive`) and **cited session evidence** for and against.
- **≥1 supported, sufficiently-confident, cross-session lesson** is written to `.oh/context/IDENTITY.md` as one bullet, without duplicating an existing principle.

Correctly promoting **nothing** is a PASS when no hypothesis generalizes: `/retro` is report-only apart from IDENTITY.md, and a supported but session-scoped lesson is meant to be reported and dropped. Score the judgment, not the write count — but the run must then say plainly which lessons it dropped and why.

## Rubric
| Axis | PASS | PARTIAL | FAIL |
|------|------|---------|------|
| success | ≥1 falsifiable hypothesis with verdict + cited evidence, AND either ≥1 generalizing lesson written to IDENTITY.md or an explicit, reasoned decision that none generalized | Hypotheses produced but the promote/drop decision is unexplained, or a lesson written without a verdict/evidence trail | No falsifiable hypothesis, or a vague/non-checkable claim, or a session-scoped lesson forced into IDENTITY.md |
| cost-time | One `/retro` pass yields the hypothesis set and the promotion decision | Needed a second pass to reach a decision | Repeated passes producing no judged hypothesis set |
| unattended | Retro ran and the promotion decision was reached end-to-end without human authoring | Auto-approve path ran but a human confirmed/edited the lesson wording | A human had to author the hypothesis or the lesson by hand |

## Evidence basis
The lens-diversity lesson captured in DS-020 demonstrates the cycle landing: a one-bullet principle traceable to a cited session observation. `/retro` (`.oh/skills/retro/SKILL.md`) defines the pass — signals → falsifiable hypotheses → evidence for and against → verdict + confidence → propose-then-confirm (or auto-approve) promotion to IDENTITY.md.

## Scoring method
v1: inspect the most-recent real `/retro` instance — its terminal report and the resulting bullet(s) in `.oh/context/IDENTITY.md` — against the rubric. Confirm each hypothesis is falsifiable and carries a verdict with cited evidence, and confirm any promoted lesson is a single non-duplicative, prescriptive bullet. Where nothing was promoted, confirm the report names the dropped lessons and why they did not generalize. Alternatively, run `/retro` fresh at the close of a real session and score the hypotheses and promotion decision it produces.
