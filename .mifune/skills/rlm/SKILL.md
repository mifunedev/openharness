---
name: rlm
argument-hint: "<artifact-path> \"<query>\" [--n N] [--depth N] [--children M] [--step-budget S] [--chunk <lines>] [--method best-of-n|vote|softmax|synthesis] [--token-ceiling N] [--dry-run]"
disable-model-invocation: true
allowed-tools: Read, Grep, Bash, Agent
description: |
  Context-as-environment decomposition (Layer B of the RLM integration). Treat a
  large artifact (file / dir / log) as a REPL/filesystem the root agent greps and
  slices instead of ingesting — partition it into addressable chunks via
  query-context.mjs --map, RECURSE sub-agent calls over the relevant chunks under a
  bounded depth/children/step budget, AGGREGATE (piping competing per-chunk answers
  through /weigh), then PERSIST the recursion trace. The anti-context-rot move:
  ADDRESS context, don't dump the whole artifact into the window. Reuses
  .oh/scripts/ralph.sh (the recursion loop) and .worktrees/ (isolated branches) BY
  REFERENCE — never edits either. Manual-invoke (spawns agents, burns tokens).
  TRIGGER when: /rlm invoked, or asked to "answer a question over a huge file/log",
  "decompose a large artifact", "recurse over chunks", "address context instead of
  ingesting it", "beat context rot on a long input", "RLM <file> <query>".
---

# rlm — context-as-environment decomposition

The **`/rlm`** skill is Layer B of the harness RLM integration (the plan:
`.claude/plans/there-s-a-whole-snappy-crayon.md` § Layer B). It answers a query over
an artifact too large to ingest by treating that artifact as an **environment the
root agent addresses** — grep/slice/chunk-map — rather than a blob it reads into its
context window. It then **recurses** sub-agent calls over the narrowed chunks under a
bounded budget, and **aggregates** their structured returns, routing competing
candidate answers through `/weigh`.

**Single responsibility.** `/rlm` owns *decomposition*; `/weigh` owns *selection*.
They compose: `/rlm` fans sub-calls out over chunks, `/weigh` scores/selects among the
candidate answers a chunk yields. This skill never re-implements selection — it calls
`/weigh`.

**Reuse, don't reinvent (load-bearing).** The recursion substrate already exists:

| Substrate | Owner | How `/rlm` uses it |
|---|---|---|
| Recursion **loop** | `.oh/scripts/ralph.sh` | each iteration re-reads disk = the REPL step — **reused by reference, never edited** |
| Isolated recursion **branches** | `.worktrees/` (the `/worktrees` skill) | depth-2 sub-trees fork here — **reused by reference, never edited** |
| Recursion **budget** | `.mifune/skills/advisor/references/recursive-delegation.md` | the `Max depth N / Max children per level M / Step budget S` triple — `references/recursion-budget.md` points at it and adds a per-run token ceiling |
| Chunk-map **primitive** | `scripts/query-context.mjs` (US-004, this skill) | partitions the artifact without ingesting it |
| Candidate **selection** | `/weigh` | scores competing per-chunk answers |

> Do **not** edit `.oh/scripts/ralph.sh` or anything under `.worktrees/`. `/rlm` is a
> *consumer* of both. The only genuinely new substrate this skill adds is
> `query-context.mjs` and this procedure.

## When to use

- `/rlm <artifact> "<query>"` to answer a question over an artifact too large to read
  whole (a big log under `crons/.cron.log`, a large corpus file, a whole directory).
- As a sub-step of `/weigh` when the cohort being sampled spans a large artifact that
  must itself be decomposed before sampling.

## When NOT to use

- **The artifact fits in context.** If a single `Read` covers it, just read it — the
  recursion tree's token cost exceeds the benefit (see recursive-delegation.md
  § Anti-Patterns, "Recursing for reasoning, not context").
- **You need to *select* among candidates, not decompose an artifact.** That is
  `/weigh` directly.
- **Sandbox application code.** `/rlm` is harness-infra substrate; it does not write
  product code (the orchestrator boundary in `CLAUDE.md`).

## Result tag

Announce exactly one human result tag at the end of the run:

```
RESULT: RLM-COMPLETE | DRY-RUN | NO-CHUNKS | BUDGET-EXHAUSTED
```

| Tag | Meaning |
|-----|---------|
| `RLM-COMPLETE` | The artifact was decomposed, sub-agents recursed under budget, answers aggregated, trace persisted. |
| `DRY-RUN` | `--dry-run` was passed: the chunk map was printed and the recursion plan shown; no sub-agents spawned, nothing persisted. |
| `NO-CHUNKS` | `query-context.mjs --map` returned an empty `chunkMap` (empty/unreadable artifact). Report and stop. |
| `BUDGET-EXHAUSTED` | The depth/children/step or token ceiling was hit before the query was answered; partial findings + the exhausted dimension are surfaced (never silently truncated). |

## Procedure

### 1. Take a large artifact + a query

Resolve the inputs: an `<artifact-path>` (a file, a directory, or a log) and a
natural-language `"<query>"`. Resolve the budget from `references/recursion-budget.md`
(defaults: `--depth 2`, `--children 4`, `--step-budget 6` per chunk, `--n` sample
width, plus the per-run token ceiling). A budget value passed on the CLI overrides the
default; a value above the hard cap in recursion-budget.md is clamped to the cap.

### 2. Chunk-map via `query-context.mjs --map` (address, don't ingest)

Partition the artifact into addressable chunks **without loading it into context** —
this is the anti-context-rot move: the root agent *addresses* context instead of
ingesting it.

```bash
node "${CLAUDE_SKILL_DIR}/scripts/query-context.mjs" "<artifact-path>" --map [--chunk <lines>]
```

`--map` returns **only** the chunk map (per-chunk 1-based line ranges + absolute byte
offsets — never any content). Use `--grep <re>` to locate where the query's terms
appear (match `{line, col, byteOffset, chunkIndex}`) and rank chunks by relevance; use
`--slice L1:L2` to pull a single chunk's content on demand — always bounded by the
32 KiB max-bytes guard (`truncated:true` + `bytesOmitted` when a span is capped), so a
slice is **never** an unbounded blob. If the `chunkMap` is empty, announce
`RESULT: NO-CHUNKS` and stop. If `--dry-run` was passed, print the chunk map + the
recursion plan (which chunks, what budget) and stop with `RESULT: DRY-RUN`.

### 3. Recurse — spawn sub-agents over the relevant chunks (BOUNDED)

For each relevant chunk, spawn a sub-agent (parallel spawn: multiple `Agent` calls in
one message when the chunks are independent — the same parallelism rule as
`/delegate` § Execute waves). Each sub-agent receives **only its chunk's address**
(line range / byte span, fetched via `query-context.mjs --slice`), not the whole
artifact, and returns a structured finding for the query.

The tree is **bounded by the depth / children / step budget** from
`references/recursion-budget.md` (which points at the `Max depth N / Max children per
level M / Step budget S` triple in
`.mifune/skills/advisor/references/recursive-delegation.md`). A sub-agent MAY itself
recurse over a sub-span **only** if its briefing carries `Max depth ≥ 2`; it MUST
decrement `Max depth` for its own grandchildren and reserve one final step for its own
synthesis. Honor the **per-run token ceiling**: when any budget dimension is hit,
surface the partial findings and the exhausted dimension and emit
`RESULT: BUDGET-EXHAUSTED` — never silently truncate the recursion. The recursion loop
**reuses `.oh/scripts/ralph.sh`** (each iteration re-reads disk = the REPL step) and
isolated recursion branches **reuse `.worktrees/`** forks — both **by reference, no
edits**.

### 4. Aggregate — synthesize, piping competing answers through `/weigh`

Integrate the sub-agents' structured returns into one answer to the query (never just
forward them verbatim — see recursive-delegation.md § Anti-Patterns, "Synthesis
pass-through"). **When a chunk yields competing candidate answers, pipe them through
`/weigh`** (the `vote`/`best-of-n` method over the candidate cohort) so selection is
the deterministic-first scorer's job, not an ad-hoc model pick. The `/rlm → /weigh`
invocation is documented as a contract in `references/recursion-budget.md`.

### 5. Persist — write the recursion trace

Write the recursion trace (chunk map used, per-chunk sub-agent findings, the
`/weigh` selections, the final synthesized answer, and the budget actually consumed)
to the **gitignored** path:

```
memory/<UTC-date>/rlm-<slug>-<HHMMSS>.json     # UTC-date = date -u +%Y-%m-%d
```

Then append a one-line entry to `memory/<UTC-date>/log.md` per the Memory Improvement
Protocol (`.mifune/skills/retro/references/memory-protocol.md`). The trace makes the
recursion auditable; it is a consumption artifact, never staged or committed. Announce
`RESULT: RLM-COMPLETE`.

## Anti-patterns

- **Ingesting the artifact.** Reading the whole file into context defeats the purpose —
  always go through `query-context.mjs` (`--map` to plan, `--slice`/`--grep` to fetch).
- **Unbounded recursion.** Depth/children/step/token ceilings are mandatory; a missing
  `Max depth` means flat execution only (recursive-delegation.md § Bounding Compute).
- **Re-implementing selection.** Competing per-chunk answers go through `/weigh`; do not
  hand-pick a "best" answer in prose.
- **Editing the reused substrate.** `.oh/scripts/ralph.sh` and `.worktrees/` are reused
  by reference. Editing either is out of scope (and ralph.sh is explicitly off-limits
  per the PRD non-goals).
- **Synthesis pass-through.** A mid-tree node that forwards children's returns verbatim
  adds zero value — integrate, or collapse the level.

## References

- `references/recursion-budget.md` — the depth/children/step ceilings (pointing at
  recursive-delegation.md), the per-run token ceiling, and the `/rlm → /weigh` contract.
- `scripts/query-context.mjs` — the `query_context` primitive (chunk-map / slice / grep
  with a max-bytes guard).
- `.mifune/skills/advisor/references/recursive-delegation.md` — the recursion budget triple + multi-level protocol this skill bounds its tree by.
- `.mifune/skills/weigh/SKILL.md` — the selection layer `/rlm` pipes competing answers through.
- `.claude/plans/there-s-a-whole-snappy-crayon.md` § Layer B — the design this skill implements.
