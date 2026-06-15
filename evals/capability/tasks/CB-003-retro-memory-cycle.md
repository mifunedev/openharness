---
id: CB-003
slug: retro-memory-cycle
title: "Close a session with a falsifiable retro that compounds a lesson"
axes: [success, cost-time, unattended]
skills: [/retro, Memory Improvement Protocol]
created: 2026-06-15
---

# CB-003 · Close a session with a falsifiable retro that compounds a lesson

## Task
At session close, produce a scientific retrospective and compound a durable lesson from it. The capability under test is the harness's ability to convert raw session signals into falsifiable, evidence-cited hypotheses, judge them, and promote the supported ones into long-term memory so the next session starts informed rather than re-deriving the same observation.

## Success signal
- A `/retro` run yields **≥1 falsifiable hypothesis**, each carrying a verdict (`supported` / `refuted` / `inconclusive`) and **cited session evidence** for and against.
- **≥1 supported, sufficiently-confident lesson** is written to a durable memory tier — `memory/MEMORY.md` or the auto-memory index — as one bullet, without duplicating an existing rule/IDENTITY principle.

## Rubric
| Axis | PASS | PARTIAL | FAIL |
|------|------|---------|------|
| success | ≥1 falsifiable hypothesis with verdict + cited evidence, AND ≥1 supported lesson durably written to a memory tier | Hypotheses produced but none promoted, or a lesson written without a verdict/evidence trail | No falsifiable hypothesis, or a vague/non-checkable claim, or nothing reaches a durable tier |
| cost-time | One `/retro` pass yields the hypothesis set and the promotion | Needed a second pass to surface a promotable lesson | Repeated passes producing no durable, supported lesson |
| unattended | Retro ran and the supported lesson was written end-to-end without human authoring | Auto-approve path ran but a human confirmed/edited the lesson wording | A human had to author the hypothesis or the lesson by hand |

## Evidence basis
Recent durable lessons demonstrate the cycle landing: `loop-node-name-pipe-trap` and `eval-results-new-probe-row` in the memory index, each a one-bullet lesson traceable to a session observation. `context/rules/memory.md` defines the Memory Improvement Protocol (log → qualify → improve) that `/retro` operationalizes as an explicit, evidence-driven, session-closing pass with a propose-then-confirm (or auto-approve) promotion gate.

## Scoring method
v1: inspect the most-recent real `/retro` instance — its log entry under `memory/<date>/log.md` and the resulting bullet(s) in `memory/MEMORY.md` or the auto-memory index — against the rubric. Confirm each hypothesis is falsifiable and carries a verdict with cited evidence, and confirm the promoted lesson is a single non-duplicative bullet in a durable tier. Alternatively, run `/retro` fresh at the close of a real session and score the hypotheses and promotion it produces.
