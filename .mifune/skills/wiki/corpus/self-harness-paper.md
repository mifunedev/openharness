---
title: "Self-Harness: Harnesses That Improve Themselves (arXiv 2606.09498)"
slug: self-harness-paper
tags: [research, self-improvement, agent-harness, llm-agents, benchmark]
created: 2026-06-24
updated: 2026-06-24
sources:
  - raw/2026-06-24-self-harness-paper.md
related: [deepagents, compound-engineering, learn-harness-engineering, autopilot, harness-audit]
confidence: provisional
---

# Self-Harness: Harnesses That Improve Themselves (arXiv 2606.09498)

## Summary
A paper from Shanghai AI Lab introducing **Self-Harness**: a paradigm where an
LLM-based agent improves its *own* operating harness — the scaffolding that
mediates model↔environment interaction — without human engineers or a stronger
external agent. Because each base model has distinct behaviors, harness design is
inherently model-specific; Self-Harness automates that per-model tuning as an
evidence-driven, regression-gated loop. Directly relevant to this repo's own
autopilot self-improvement thesis.

## Detail
Self-Harness is an iterative three-stage loop:

1. **Weakness Mining** — run the fixed model under the current harness on held-in
   tasks; cluster failures by *verifier-grounded failure signatures* to surface
   recurring patterns, not isolated mistakes.
2. **Harness Proposal** — the same model generates K candidate harness edits, each
   grounded in one primary failure mechanism and mapped to a concrete editable
   surface. Edits must be *materially distinct* yet *minimal*.
3. **Proposal Validation** — regression-test candidates on held-in and held-out
   splits. Acceptance rule: `Δin ≥ 0 AND Δho ≥ 0 AND max(Δin, Δho) > 0` — no
   degradation on either split, strict improvement on at least one.

Instantiated on **Terminal-Bench-2.0** (89 containerized agentic tasks; 64-case
eval subset) over a minimal **DeepAgent SDK** harness, with the **Harbor**
execution environment, across three diverse base models. Held-out pass rates:

| Model | Before | After | Rel. gain |
|-------|--------|-------|-----------|
| MiniMax M2.5 | 40.5% | 61.9% | ~53% |
| Qwen3.5-35B-A3B | 23.8% | 38.1% | ~60% |
| GLM-5 | 42.9% | 57.1% | ~33% |

The accepted edits were *model-specific*, not generic boilerplate: M2.5 → early
artifact creation + bounded execution; Qwen3.5 → tool-error recovery + artifact
reliability; GLM-5 → persistent environment changes + exploration→implementation
transitions. Key framing: **"harness improvement should be treated as an empirical
state transition."** Even sparse initial harnesses self-improve usefully when
proposals are constrained by execution evidence and gated by regression testing.
Stated limitation: bounded harness edits under fixed benchmarks, **not** open-ended
self-improvement.

## System Relationships
The Self-Harness loop maps closely onto Open Harness's own machinery:

- **Weakness Mining** ≈ `/retro` + `/prompt-miner` (turning execution traces and
  session friction into falsifiable, evidence-cited findings).
- **Harness Proposal** ≈ `/autopilot` + `/harness-audit` selecting and filing a
  ranked harness-infra improvement.
- **Proposal Validation** ≈ the `build ⇄ audit` critic loop plus the `/eval`
  probe suite as a *regression floor* and `/benchmark` as a *capability ceiling*
  — the same "no-regression + must-improve" acceptance shape as the paper's `Δ`
  rule (AGENTS.md § The Workflow).

The paper is external research, not an artifact in this repo; it offers a vetted
academic frame for what the harness already does empirically.

## See Also
- [[deepagents]] — the DeepAgent SDK, the minimal baseline harness the paper builds on
- [[compound-engineering]] — the broader self-improving-systems thesis
- [[learn-harness-engineering]] — harness-engineering fundamentals
- [[autopilot]] — this repo's self-improvement loop (Harness Proposal analog)
- [[harness-audit]] — first-principles weakness discovery (Weakness Mining analog)
