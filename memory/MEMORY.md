# Memory

Long-term lessons distilled from session experience. Append-only. See `context/rules/memory.md` for the Memory Improvement Protocol.

## Lessons Learned

<!-- Append entries below. Each entry: bullet with date and one-sentence lesson. Append-only. -->

- **2026-05-11**: First-round critic council on PR #270 (3 critics: PM / Implementer / Critic with implicit, overlapping lenses) shipped a rule that laundered RAO's RL-training results as inference-time guarantees — a HIGH-severity faithfulness gap. A second-round council on the same PR (5 critics with explicit distinct lenses: faithfulness, codebase-fit, practical, safety, editor) surfaced the gap on the very first reply. Lesson: when fanning out critics to review one artifact, brief each with a different focal lens — lens-diversity exposes failure modes that critic-count alone misses. Promote to `context/rules/advisor-model.md` as a new Pipeline Variant only after the pattern recurs (≥ 3 invocations across sessions).
