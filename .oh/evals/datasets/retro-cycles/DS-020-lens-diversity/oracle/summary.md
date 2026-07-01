# Oracle: DS-020 — Brief critics with diverse lenses (retro-promoted lesson)

This trajectory is a `/retro` cycle, not a code change: its provenance is the memory file plus the date it landed (`memory/MEMORY.md` @ 2026-05-11), with no source PR. It is a valid retro outcome because it follows the scientific session-closing shape the `/retro` skill prescribes and the Memory Improvement Protocol (`context/rules/memory.md`) requires.

## Why this is a valid retro outcome

The session produced a single falsifiable hypothesis: *briefing critics with distinct lenses catches faithfulness gaps that same-lens / critic-count-only councils miss.* It is falsifiable — a same-lens council that had caught the gap, or a diverse-lens council that had missed it, would refute it.

The hypothesis carries cited session evidence, not assertion: two council rounds on the **same** artifact (PR #270). Round one — 3 critics (PM / Implementer / Critic) with implicit, overlapping lenses — shipped a rule that laundered RAO's RL-training results as inference-time guarantees, a HIGH-severity faithfulness gap that survived review. Round two — 5 critics with explicit, distinct lenses (faithfulness, codebase-fit, practical, safety, editor) — surfaced that same gap on the very first reply. Holding the artifact fixed and varying only lens-assignment isolates lens-diversity (not critic count) as the operative variable.

Verdict: **supported** (with sufficient confidence to promote). The evidence points one direction and the controlled comparison rules out the count-only confound, so the hypothesis graduates from observation to durable lesson.

It is promoted as exactly **one** durable, non-duplicative bullet appended to `memory/MEMORY.md` under Lessons Learned — descriptive ("a run on 2026-05-11 showed…"), the memory tier rather than the IDENTITY/rules tier, and not a restatement of any existing rule or operating principle.

## Mapping to CB-003

CB-003's success signal is met: the session yields **≥1 falsifiable hypothesis with an assigned verdict and cited evidence** (the lens-diversity hypothesis, verdict `supported`, evidenced by the two PR #270 council rounds) **AND ≥1 supported lesson durably written** (the single bullet now present in `memory/MEMORY.md`).

## Reward

- `artifact_presence` = the lesson bullet exists in `memory/MEMORY.md`.
- `diff_similarity` = a candidate that touches `memory/MEMORY.md` (the single oracle changed file).
