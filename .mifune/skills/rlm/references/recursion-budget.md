# rlm — Recursion Budget

`/rlm` decomposes a large artifact and recurses sub-agent calls over its chunks.
Unbounded recursion burns budget silently, so **every `/rlm` run carries explicit
ceilings**. This reference does not invent a new budgeting scheme — it **points at the
existing one** and adds the two things `/rlm` needs on top: a per-run token ceiling and
the `/rlm → /weigh` invocation contract.

## The budget triple — owned by recursive-delegation.md (do not fork)

The depth / children / step ceilings are the **`Max depth N` / `Max children per level
M` (M ≤ 5) / `Step budget S`** triple defined in
[`.mifune/skills/advisor/references/recursive-delegation.md`](../../advisor/references/recursive-delegation.md)
§ *Bounding Compute*. That file is the single source of truth for the triple's
semantics; `/rlm` honors it verbatim:

- `Max depth` counts edges from the root (child = 1, grandchild = 2). A sub-agent MUST
  NOT recurse if `Max depth` is absent or `1`. A recursing child decrements it
  (`Max depth: N−1`) for its grandchildren.
- `Max children per level` is hard-capped at **5** (recursive-delegation.md). A child
  MUST NOT rewrite a sibling's briefing to lift its own depth or scope.
- `Step budget` always reserves at least one final step for the parent's synthesis turn
  (recursive-delegation.md § Bounding Compute).

These are **prompt-level conventions, not runtime-enforced caps** (recursive-delegation.md
opening note): an untrained model may ignore them, so write every briefing to honor them
rigorously.

## `/rlm` defaults and caps

| Field | `/rlm` default | Hard cap | CLI flag | Source of the cap |
|-------|:--:|:--:|---|---|
| `Max depth` | **2** | 4 | `--depth N` | recursive-delegation.md § Bounding Compute |
| `Max children per level` (M) | **4** | 5 | `--children M` | recursive-delegation.md (M ≤ 5) |
| `Step budget` (S, per chunk) | **6** | — | `--step-budget S` | skill-specific (reserves ≥1 synthesis step) |
| Sample width `N` (chunks recursed per wave) | **4** | 8 | `--n N` | mirrors `/delegate` wave discipline |
| **Per-run token ceiling** | **200 000** | — | `--token-ceiling N` | this reference (see below) |

Defaults are deliberately small (depth 2 = root → child → grandchild, four children per
level) so a default `/rlm` run is bounded at well under the recursive-delegation.md hard
caps. A CLI value above a hard cap is clamped to the cap, not honored as-is.

## Per-run token ceiling (the `/rlm` addition)

The depth/children/step triple bounds the **shape** of the tree; it does not bound total
**spend** — a wide-but-shallow tree can still burn the budget. `/rlm` therefore adds a
single **per-run token ceiling** (`--token-ceiling`, default `200000`) that caps the
*cumulative* tokens across the whole recursion (all chunks, all depths, the aggregation
and `/weigh` calls included).

Accounting:

- Track cumulative tokens as the run proceeds (root chunk-map planning + every sub-agent
  call + the `/weigh` selection passes + final synthesis).
- The `cost` of the chunk-addressing primitive is near-zero by design: `query-context.mjs
  --map` returns only line ranges + byte offsets (no content), and `--slice`/`--grep`
  results are bounded by the **32 KiB max-bytes guard** (`MAX_SLICE_BYTES` in
  `query-context.mjs`; `truncated:true` + `bytesOmitted` when capped) — so addressing
  context never blows the ceiling the way ingesting the whole artifact would.
- When the ceiling is reached, **stop spawning**, surface the partial findings and the
  exhausted dimension, and emit `RESULT: BUDGET-EXHAUSTED`. Never silently truncate the
  recursion or drop a chunk without saying so.

## The `/rlm → /weigh` invocation contract

When step 4 (aggregate) finds a chunk that yielded **competing candidate answers**,
`/rlm` MUST route them through `/weigh` rather than hand-picking a winner in prose. The
contract:

| Item | Value |
|---|---|
| **Caller** | `/rlm` step 4 (aggregate) |
| **Callee** | `/weigh` (`.mifune/skills/weigh/SKILL.md`) |
| **When** | A single chunk (or the cross-chunk synthesis) yields ≥ 2 candidate answers that disagree |
| **Method** | `vote` (largest self-consistency cluster) for redundant samples, or `best-of-n` (argmax weight) for distinct candidates; `synthesis` (top-K) when the answers should be grafted, not chosen |
| **Cohort shape** | Each candidate is a trajectory record matching the **`TRAJECTORY_SCHEMA`** exported by `.mifune/skills/weigh/scripts/score-trajectories.mjs` (`id`, `output`, `costTokens`, `evalRc`, `auditVerdict`, `clusterId`, `clusterSize`, `judgeScore`, `judgeReason`) |
| **Result honored** | `/weigh`'s selection (or its explicit `{ selected: null, reason: "NO-SELECTION", … }` honest 3-state) is taken as the chunk's answer — `/rlm` never overrides a `NO-SELECTION` with a silent least-bad pick |

`/rlm` owns *decomposition*; `/weigh` owns *selection*. The scorer
(`score-trajectories.mjs`) is the deterministic-first weight function the harness owns —
`/rlm` consumes its verdict, it does not re-implement weighting.

## Reuse-by-reference (no edits)

The recursion **loop** is `.oh/scripts/ralph.sh` (each iteration re-reads disk = the
REPL step) and isolated recursion **branches** are `.worktrees/` forks (the `/worktrees`
skill). `/rlm` reuses **both by reference** — it never edits `ralph.sh` (explicitly
off-limits per the PRD non-goals) or anything under `.worktrees/`.

## See Also

- `.mifune/skills/advisor/references/recursive-delegation.md` — the budget triple + multi-level delegation protocol this reference points at.
- `SKILL.md` — the `/rlm` procedure that consumes this budget.
- `.mifune/skills/weigh/references/scoring.md` — the `TRAJECTORY_SCHEMA` + scoring contract the `/weigh` hand-off cites.
- `scripts/query-context.mjs` — the chunk-map / slice / grep primitive with the 32 KiB max-bytes guard.
