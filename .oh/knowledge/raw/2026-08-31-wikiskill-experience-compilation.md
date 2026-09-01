# Source: https://arxiv.org/abs/2608.27454

Capture date: 2026-08-31 (UTC). Fetched from the arXiv abstract page and the
experimental HTML rendering at <https://arxiv.org/html/2608.27454v1>. This file
is **provenance** for `wikiskill-experience-compilation.md`, not a restatement of
that entry.

## Bibliographic record

| Field | Value |
| --- | --- |
| Title | WikiSkill: Compiling Agent Experience into Persistent Knowledge for Skill Evolution |
| Authors | Liyan Tang, Cyrus Rashtchian, Chun-Sung Ferng, Andrew Tomkins, Da-Cheng Juan, Tu Vu |
| Submitted | 2026-08-27 |
| Categories | cs.AI; cs.CL |
| License | CC BY 4.0 |

## Abstract (verbatim)

> Agent skills package specialized knowledge and workflows into reusable
> resources that extend AI agent capabilities. Recent work automatically
> discovers such skills from agent experience, which enables agents to
> progressively adapt through interaction. However, the insights that guide
> skill development typically remain scattered across optimization histories,
> limiting their systematic reuse across iterations. We introduce WikiSkill, a
> framework that co-evolves agent skills with a persistent knowledge base
> (wiki). At a high level, WikiSkill separates raw execution experience,
> accumulated knowledge, and executable skills, while continuously consolidating
> experience into the wiki, which subsequent skill updates can build on. Across
> diverse benchmarks and models, WikiSkill consistently outperforms
> state-of-the-art skill-evolution methods and improves over no-skill baselines
> in most model-benchmark settings. We find that skill evolution complements
> model scaling: larger models generally benefit more from evolved skills, while
> smaller models with skills can outperform substantially larger models without
> them. We also find that evolved skills transfer effectively across models and
> model families, and skills evolved by other models can outperform self-evolved
> skills. Finally, our ablation studies confirm that persistent knowledge
> accumulation in the wiki is critical for effective skill evolution. These
> results demonstrate the benefits of systematically accumulating and refining
> agent experience for developing reusable and transferable skills.

## Layer layout as described in §3

| Layer | Contents |
| --- | --- |
| `raw/` | Immutable execution traces from training rollouts — reasoning, tool calls, tool outputs, final answers |
| `wiki/patterns/` | One markdown file per failure mode or successful strategy, with actionable workarounds |
| `wiki/index.md` | Catalog of current patterns |
| `wiki/logs.md` | Per-iteration evolution log |
| `wiki/skill-impact.md` | Proposal diffs, target skill, validation score, Accepted/Rejected |
| `skills/` | Active skill set; each dir holds `SKILL.md` (frontmatter + procedure) and `PURPOSE.md` (skill → motivating patterns) |

## Algorithm 1 (Appendix A.1), as rendered

```
Input: D_train, D_val, metric R, iterations K
Initialize: S_0 <- {}, W_0 <- {}
Baseline: T_val,0 <- {tau_i ~ pi(x_i; S_0)}; R_best <- R(T_val,0)
for k = 1..K do
  if R_best = 1.0 then break
  Inference:      T_train,k <- {tau_i ~ pi(x_i; S_{k-1})}
  Sample subset:  T_sample,k subset-of T_train,k
  Wiki Maintenance:  W'_k <- M_WM(W_{k-1}, T_sample,k)
  Skill Proposal:    P_k  <- M_P(W'_k, S_{k-1}, T_train,k)
  Apply:             S'_k <- Apply(S_{k-1}, P_k)
  Validate:          T_val,k <- {tau_i ~ pi(x_i; S'_k)}
  if R(T_val,k) > R_best then S_k <- S'_k; R_best <- R(T_val,k)
  else S_k <- S_{k-1}
  Wiki Update:       W_k <- Update(W'_k, P_k, R(T_val,k), a_k)
end for
```

Stated invariant: "the wiki W_k is never rolled back regardless of the acceptance
decision; accumulated patterns and logs persist across all iterations."

## Component notes (§3.2)

- **Inference Agent** — active skills injected wholesale into the system prompt.
  No wiki access during training rollouts.
- **Wiki Maintainer (M_WM)** — root-cause analysis on failures, strategy
  extraction from passes; creates pattern pages and applies "incremental,
  patch-based editing (e.g., appending, replacing, or inserting text spans)";
  revises `index.md`; appends to `logs.md`. No hard limit on patterns per
  iteration.
- **Skill Proposer (M_P)** — ReAct agent given the wiki index, `skill-impact.md`,
  and an outcome summary; calls `read_file` on pattern pages and raw traces on
  demand; emits "an atomic proposal P_k that targets a single skill."
- **Gating** — accept only if `R(T_val,k) > R_best`; record proposal metadata,
  target skill name, unified diff, validation score, and `a_k in {Accepted, Rejected}`.

## Ablation (Gemini-3.5-Flash, mean over benchmarks)

| Configuration | Avg. |
| --- | --- |
| No skill | 40.4 |
| Inference Agent wiki access only | 43.8 |
| Skill Proposer wiki access only | 63.7 |
| Both components wiki access | 60.9 |

## Benchmarks, models, headline numbers

Benchmarks: LiveMathematicianBench, SealQA, SpreadsheetBench, OfficeQA, ALFWorld.
Models: Qwen-3.5-4B, Qwen-3.5-9B, Qwen-3.6-27B, Gemma-4-31B, Gemini-3.5-Flash.

- Gains over the strongest competing method: 3.3–12.0 points per model.
- Within-family scaling: +12.3 (4B), +17.5 (9B), +23.9 (27B).
- "Qwen-3.5-9B with WikiSkill reaches 47.4% average accuracy, outperforming
  Qwen-3.6-27B without skills at 39.4%."
- Cross-model transfer, SpreadsheetBench: Qwen-3.6-27B skills lift Qwen-3.5-9B to
  50.5% vs 33.6% self-evolved. Negative transfer also observed: Qwen-3.5-4B
  skills drop Gemini-3.5-Flash from 50.5% to 18.1%, attributed to "low-level
  workarounds."
- Evolution statistics (Table 4): 1.9–4.9 proposed creations per model, 0.9–1.8
  accepted; 3.1–6.1 proposed edits; 4.4–9.8 wiki patterns created per benchmark;
  7.0–18.4 wiki edits per model.
- Timing of accepted updates: 39–52% land in early iterations, with substantial
  fractions in middle and late stages.

## Baselines compared

- Trace2Skill (Ni et al., 2026) — consolidates lessons from trajectories into skill updates.
- EvoSkill (Alzubi et al., 2026) — cumulative history of proposals and outcomes.
- SkillOpt (Yang et al., 2026) — rejected-edit feedback and epoch-wise meta guidance.

Stated distinction: "WikiSkill introduces a persistent Wiki Layer that
consolidates experience into structured knowledge across iterations."

## Stated limitations (authors' own)

1. Skill retrieval is not addressed — skills are injected wholesale "to isolate
   skill quality and avoid confounding effects from skill retrieval."
2. Strict validation gating "excludes neutral proposals that preserve immediate
   performance but could enable gains in subsequent iterations."
3. No automated wiki pruning; scalability concern over long runs.
4. No coverage of very long-horizon tasks (hundreds of actions, multiple hours).

## Capture notes

The abstract page, the §3 method, the experiments/ablation sections, and the
appendix layer descriptions were retrieved. Appendix E system prompts (E.1
inference, E.2 wiki maintainer, E.3 skill proposer) are referenced by the paper
but were not recoverable from the HTML rendering; the paper also shows no
verbatim example of a `patterns/*.md`, `index.md`, `logs.md`, or
`skill-impact.md` file, so their concrete field layouts are inferred from prose
rather than quoted.
