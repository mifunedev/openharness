---
title: "Learn Harness Engineering (Walking Labs course)"
slug: learn-harness-engineering
tags: [harness, agents, education, course, open-harness]
created: 2026-05-26
updated: 2026-05-26
sources:
  - raw/2026-05-26-learn-harness-engineering.md
related: []
confidence: provisional
---

# Learn Harness Engineering (Walking Labs course)

## Summary
A public course by Walking Labs framing **harness engineering** as the practice of building a closed-loop system around an AI coding agent — environment design, state management, verification, and control — rather than waiting for stronger models. For Open Harness the course is a useful external taxonomy: it independently names many of the failure modes this repo already organizes around (continuity loss, premature victory, missing observability, dirty session state) and offers a lecture sequence to point newcomers at.

## Detail
The course's central claim is that capable agents still fail because reliability is a *system property*, not a model property. A harness is the system that surrounds the model and decides what it sees, what it can change, when it must check in, and when it is allowed to declare done. Walking Labs' lecture sequence walks through the failure modes that motivate each harness primitive: capable agents still fail (Lecture 1), so the harness exists (Lecture 2); the repository must become the system of record (Lecture 3) because instruction-only state drifts; one giant instruction file fails (Lecture 4) so context must be partitioned; long-running tasks lose continuity (Lecture 5) so progress must be checkpointed; initialization needs its own phase (Lecture 6) before work begins; agents overreach and under-finish (Lecture 7) so scope must be bounded; feature lists are harness primitives (Lecture 8) — the unit of "what to do next" is structured, not freeform; agents declare victory too early (Lecture 9) so done-ness must be externally verified; end-to-end testing changes results (Lecture 10) by closing the verification loop; observability belongs inside the harness (Lecture 11) so the agent can see itself; every session must leave a clean state (Lecture 12) so the next session starts trustworthy.

The course publishes a small resource library of copy-ready templates — `AGENTS.md`, `feature_list.json`, `claude-progress.md` — that map directly onto patterns already used by Open Harness (`AGENTS.md` in `workspace/`, structured task PRDs under `tasks/<name>/prd.json`, progress notes in `memory/<date>/log.md`).

Walking Labs cites four primary sources as the lineage of the term: OpenAI's "Harness engineering: leveraging Codex in an agent-first world," two Anthropic posts ("Effective harnesses for long-running agents" and "Harness design for long-running application development"), and the Awesome Harness Engineering GitHub list. The course is one of the first structured curricula to use "harness engineering" as a discipline name rather than a vendor framing.

Open Harness implication: the course is a teaching surface that overlaps strongly with this project's operating principles — link to it from `docs/resources.md` and `docs/intro.md` as the external entry point for the discipline, and treat its failure-mode taxonomy as an independent corroborating reference when arguing for the same patterns inside `context/IDENTITY.md` and `context/rules/*.md`. The course is not a replacement for this harness's rules — it does not prescribe a specific repo layout — but it is a credible third-party framing of why the layout exists.

## See Also
