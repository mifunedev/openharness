# Raw snapshot — Recursive Language Models (RLM) ecosystem (2026-06-27)

Capture date: 2026-06-27 (UTC). This snapshot records the external RLM ecosystem
and the prior-art papers the `recursive-language-models.md` wiki entry
synthesizes. It is a curated ecosystem capture assembled from the T7 integration
research in `.claude/plans/there-s-a-whole-snappy-crayon.md` and the
`tasks/rlm-weighted-trajectories/` PRD, in lieu of a single fetched page —
provenance is the canonical source URLs enumerated below.

## Canonical source URLs

- **Paper (RLM):** https://arxiv.org/abs/2512.24601 — Recursive Language Models.
- **Blog / reference write-up:** https://alexzhang13.github.io/blog/2025/rlm — Alex
  Zhang's RLM write-up; the originating "context as a REPL the root LM addresses"
  framing.
- **Reference implementation:** https://github.com/alexzhang13/rlm — alexzhang13/rlm,
  the REPL-over-context reference implementation.
- **DSPy module:** https://dspy.ai/diving-deeper/rlm — `dspy.RLM`, the RLM pattern
  packaged as a DSPy module.
- **TypeScript agent framework:** https://github.com/ax-llm/ax — `ax`, a TS agent
  framework whose primitives express the RLM decomposition.
- **unix-rlm / prose:** the filesystem-as-context (`unix-rlm`) framing and the
  `prose` project (`prose.md`) round out the five-project ecosystem.

## Prior-art (selection / sampling)

- **Self-consistency:** https://arxiv.org/abs/2203.11171 — "Self-Consistency
  Improves Chain of Thought Reasoning in Language Models." Sample multiple
  reasoning paths, then marginalize by majority vote. The conceptual root of
  weighted-trajectory `vote` selection.
- **Best-of-N / repeated sampling:** https://arxiv.org/abs/2408.03314 — "Scaling
  LLM Test-Time Compute Optimally…"; the compute-scaling intuition behind sampling
  N trajectories and selecting the best.

## The five-project RLM ecosystem (as summarized)

| Project | What it is |
|---|---|
| `alexzhang13/rlm` | Reference REPL-over-context implementation + the explanatory blog. |
| `dspy.RLM` | The RLM pattern as a composable DSPy module. |
| `ax` (`ax-llm/ax`) | TypeScript agent framework expressing RLM-style decomposition. |
| `unix-rlm` | Filesystem-as-context framing — address chunks like files. |
| `prose` | Long-form / prose-oriented RLM variant (`prose.md`). |

## Core ideas captured

1. **Context-as-environment.** The root LM does not ingest a huge artifact into one
   prompt; it is given an API to *address* the artifact (list/grep/slice) and
   recurses sub-LM calls over only the relevant chunks, aggregating structured
   sub-answers. This counters "context rot" — accuracy degradation as the context
   window fills with mostly-irrelevant tokens.
2. **Weighted-trajectory selection.** Sample N candidate trajectories, attach
   signals to each, and select with an explicit weight function (generalizing
   self-consistency's majority vote). Methods: best-of-N (argmax), vote (largest
   cluster), softmax, synthesis (top-K).
3. **Deterministic-first weighting (the harness's owned part).** Open Harness pulls
   the weight/selection step OUT of the model into a pure, version-controlled
   scorer with a frozen `DEFAULT_WEIGHTS` (`consistency:30, evalPass:20,
   auditPass:15, cost:10, judge:25` = 100). 75 points are deterministic signals the
   harness owns; the `judge:25` coefficient is toggleable to `0` for a fully
   deterministic weight. Mirrors `prompt-miner`'s `mine-traces.mjs` frozen-weights
   scorer, but scores trajectories *prospectively* rather than sessions post-hoc.

## Provenance note

No public DeepWiki page covers this harness's RLM integration. arXiv identifier
2512.24601 and the project/blog URLs above are recorded as cited by the T7 design
research; the synthesis (how the harness adapts RLM via `/weigh` + `/rlm`) is the
harness's own and lives in the curated entry, not here.
