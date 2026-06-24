---
title: "Compound Engineering"
slug: compound-engineering
tags: [compound-engineering, agent-harness, ai-engineering, feedback-loops, self-improvement, methodology]
created: 2026-06-04
updated: 2026-06-04
sources:
  - raw/2026-06-04-compound-engineering.md
related: [learn-harness-engineering, inspectable-agent-harness]
confidence: provisional
---

# Compound Engineering

## Summary
Compound engineering is an AI-native engineering philosophy holding that "each unit of engineering work should make subsequent units easier—not harder," inverting the usual drift where every feature injects complexity. It frames development as building self-improving systems where each fix, review, and failure teaches the system, so safety nets and codified taste accumulate rather than eroding. Open Harness is a concrete instance of this pattern: its append-only memory, critic gates, and accreting protected-paths are mechanisms that make the system better at its next task.

## Detail
The concept is attributed to Kieran Klaassen at Every. The originating essay (Aug 2025, "My AI Had Already Fixed the Code Before I Saw It") used the spelling "compounding engineering"; the term was later standardized to "compound engineering" in Every's canonical guide. The guide describes a loop — Ideate → Brainstorm → Plan → Work → Review → Polish → Compound → Repeat — and an effort allocation of roughly 50% building features and 50% improving the system itself (review agents, documented patterns, test generators).

The load-bearing mechanism — "each unit of work permanently improves the system that does the next unit" — maps directly onto existing Open Harness machinery:

- **Append-only memory / qualify→promote loop.** The Memory Improvement Protocol (`context/rules/memory.md`) requires every skill run to log an outcome, run a qualify pass, then promote actionable lessons to `memory/MEMORY.md`. This is the harness's institutional-knowledge surface — the "teach the system rather than do the work yourself" principle made operational.
- **Build safety nets, not review processes.** The critic gate (`context/IDENTITY.md`, "Critic-gate before destructive actions") forces any destructive action through `.claude/agents/critic.md` before it runs, capturing the risk assessment in the commit. The gate is a reusable safety net, not a one-off manual review.
- **Every failure becomes a permanent upgrade.** `context/IDENTITY.md` states "Every regression caught becomes a permanent test" — in this orchestrator's case a permanent entry in `.claude/protected-paths.txt`. That file accretes guardrails over time, so the harness gets more stable, not less — the compounding effect in concrete form.
- **Parallel and long-running orchestration.** The source's "parallel orchestration" and "long-running orchestration" principles correspond to `context/rules/recursive-delegation.md` and the `.claude/skills/delegate` skill, which decompose work into waves of specialized sub-agents.

The relationship is bidirectional: Open Harness is an instance of compound engineering, while the philosophy's own documented failure modes — codifying the wrong lessons, and instruction/prompt bloat from unpruned context — are precisely what the harness's critic gate and its "Simplicity is beauty, complexity is pain" core principle (`context/IDENTITY.md`) are designed to guard against. Every also ships an official Compound Engineering plugin for Claude Code, Codex, and Cursor.

## See Also
- [[learn-harness-engineering]]
- [[inspectable-agent-harness]]
