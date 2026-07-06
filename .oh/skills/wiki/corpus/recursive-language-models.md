---
title: "Recursive Language Models"
slug: recursive-language-models
tags: [rlm, context-as-environment, weighted-trajectories, agent-harness, llm-agents, self-consistency]
created: 2026-06-27
updated: 2026-06-27
sources:
  - raw/2026-06-27-recursive-language-models.md
related: [inspectable-agent-harness, prompt-miner, repo2rlenv]
confidence: provisional
---

# Recursive Language Models

## Relevant Source Files
- `tasks/rlm-weighted-trajectories/prd.md` — the harness RLM integration PRD: `/weigh` scorer contract (US-001), `/rlm` query-context primitive (US-004), this wiki entry (US-008).
- `.oh/skills/weigh/scripts/score-trajectories.mjs` — the harness-owned deterministic-first weight function (frozen `DEFAULT_WEIGHTS`, sum 100).
- `.oh/skills/rlm/scripts/query-context.mjs` — the context-addressing primitive (grep/slice/chunk-map with a max-bytes guard).
- `raw/2026-06-27-recursive-language-models.md` — external RLM ecosystem snapshot + paper URLs.

## Summary
Recursive Language Models (RLM) is an inference-time pattern in which a root language model treats its context not as a flat prompt to ingest but as an **environment** — a REPL/filesystem it greps, slices, and recurses sub-LM calls over — to beat "context rot" on very long inputs. A sibling idea, **weighted-trajectory selection**, samples N candidate paths and picks among them with an explicit scoring function rather than a single greedy decode. Open Harness adapts both as two harness-owned skills, `/rlm` (decomposition) and `/weigh` (selection), keeping the weight function deterministic and version-controlled instead of a model black box.

## Detail
**Context-as-environment.** Rather than stuff a 100K-token artifact into one prompt, the root LM is given a small API to *address* the artifact — list chunks, grep for a pattern, read a line range — and recurses sub-LM calls over only the relevant slices, aggregating their structured answers. This mitigates the long-context degradation ("context rot") where accuracy falls as the window fills. The public ecosystem spans five projects the source snapshot tracks: **alexzhang13/rlm** (the reference REPL-over-context implementation + blog), **dspy.RLM** (a DSPy module), **ax** (a TypeScript agent framework), **unix-rlm** (the filesystem-as-context framing), and **prose**. Its compute-scaling intuition is shared with best-of-N / repeated-sampling work (arXiv 2408.03314).

**Weighted-trajectory selection.** Rather than trust one decode, sample N trajectories, attach signals to each, and select — a generalization of **self-consistency** (arXiv 2203.11171), which votes over sampled reasoning paths. The harness's design thesis is that the *sampling and model-side judging are substrate the Workflow tool already provides* (its judge-panel / adversarial-verify patterns); the part worth owning is the **weight function that picks among trajectories**.

**How the harness adapts it.** `/weigh` runs sample → score → select over a cohort. Its scorer (`score-trajectories.mjs`) is pure and zero-dependency — no `git`, no `Date.now()`, no model call — exporting a frozen `DEFAULT_WEIGHTS` (`consistency:30, evalPass:20, auditPass:15, cost:10, judge:25`, summing 100). Seventy-five points are deterministic signals the harness owns (self-consistency cluster size, `/eval` regression floor, `/audit` verdict, token cost); the `judge:25` coefficient is a model verifier that can be set to `0` for a fully deterministic weight. Trajectories failing the hard floor (`evalRc===1` or `auditVerdict==="FAIL"`) are excluded unless `--soft` down-weights instead, and an all-floor-fail cohort returns an explicit `NO-SELECTION` rather than a silent least-bad pick. This mirrors **prompt-miner**'s owned, frozen-weights scorer, but scores candidate paths *prospectively* rather than finished sessions post-hoc.

`/rlm` supplies the decomposition half: `query-context.mjs` returns an addressed slice plus a chunk map (line ranges, byte offsets, match locations) under a max-bytes guard, and the skill recurses sub-agents over relevant chunks bounded by the existing `Max depth / children / step` recursion budget, reusing `ralph.sh` and `.oh/worktrees/` by reference. The two compose: `/rlm` fans out per-chunk sub-calls; `/weigh` scores and aggregates the competing answers. Both are `disable-model-invocation: true` manual-invoke skills, so they cost nothing until called.

## See Also
- [[inspectable-agent-harness]]
- [[prompt-miner]]
- [[repo2rlenv]]
