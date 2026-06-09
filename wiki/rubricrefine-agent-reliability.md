---
title: "RubricRefine: Improving Tool-Use Agent Reliability with Training-Free Pre-Execution Refinement"
slug: rubricrefine-agent-reliability
tags:
  - ai-agents
  - tool-use
  - reliability
  - evaluation
  - self-refinement
  - code-mode
  - anduril
created: 2026-06-06
updated: 2026-06-06
sources:
  - raw/2026-06-06-rubricrefine-agent-reliability.md
  - raw/2026-06-06-rubricrefine-agent-reliability-arxiv.md
related: [inspectable-agent-harness, compound-engineering, codegraph-mcp]
confidence: confirmed
---

# RubricRefine: Improving Tool-Use Agent Reliability with Training-Free Pre-Execution Refinement

## Summary
RubricRefine (Anduril Industries; LeVine, Evers, Saltwick, Venkatesh — arXiv 2605.09730) is a training-free, inference-time method that improves code-mode tool-use agent reliability by verifying an agent's planned action against a generated rubric *before* execution. It targets inter-tool contract violations — wrong output shape, incorrect tool routing, broken argument provenance — that complete without raising errors and so are invisible to runtime feedback. Across seven models it reaches 0.86 on M3ToolEval with zero execution attempts.

## Detail
The pipeline has three phases. (1) **Rubric generation**: given the task instruction and tool registry, a generator emits a structured rubric of itemized checks specific to that instance. (2) **Static scoring**: each candidate program gets a 1–10 ordinal score (1–4 missing core calls; 5–7 critical contract errors remain; 8–9 execution-ready with minor issues; 10 fully contract-compliant). (3) **Iterative repair**: the generator receives item-level PASS/FAIL judgments, reasons, and revision directives, then revises; the loop ends on a perfect score, exhausted patience, or budget, and the best-scoring candidate becomes the single executable action.

Rubrics check four contract dimensions: **tool-choice** (dispatch to the documented API vs. reimplementing it), **output-contract** (final value shape/type), **call-signature** (each call matches its documented signature), and **data-provenance** (downstream inputs trace to legitimate sources).

Evaluated on **M3ToolEval** (multi-step tool composition with dataflow between calls) and **API-Bank** (step-level single calls) across seven models — GPT-4.1-mini, GPT-4o, o3-mini, GPT-4.1, Claude-Sonnet-4.6, Gemma-4-26B-A4B-it, Qwen3.6-27B-FP8. On M3ToolEval the averages are CodeAct 0.62 → Self-Debug (real execution feedback) 0.73 → RubricRefine 0.86 (+0.24, no execution). On GPT-4.1 it hits 0.85 at 30.0s vs Best-of-N+rubric's 0.76 at 76.6s — 2.6× lower latency. On API-Bank it is flat: inter-tool contracts don't apply to single-step tasks.

Stated limits: it can't catch failures depending on latent runtime/environment state; it is bounded by verifier quality (an omitted constraint or mis-score misdirects repair); and it adds inference-time compute. Note the gap between the paper's bounded claims and the LinkedIn framing ("first-time errors are unacceptable, lives may be at stake") — the social post oversells; a top comment further flags that the rubric introduces unattested trust anchors and "fails closed in the adversary's favor" absent attestation. The interpretable-rubric angle connects to inspectability of agent harnesses; the generate-score-repair loop is a compound-engineering feedback loop applied pre-execution.

## See Also
- [[inspectable-agent-harness]]
- [[compound-engineering]]
- [[codegraph-mcp]]
