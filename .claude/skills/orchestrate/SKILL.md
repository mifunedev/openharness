---
name: orchestrate
argument-hint: "[--start <node>] [--dry-run] [--max-iters <N>]"
description: |
  Walk the executable decision-tree of skills defined in
  context/rules/loop.md § 2. The runner is mechanical: it runs a node,
  reads that node's terminal STATUS: token, looks the token up in the
  § 2 route table, and advances to the next node — repeating until it
  reaches an unwired node, a missing/unknown token, or the --max-iters
  bound, halting honestly at each. It does NOT decide; all judgment lives
  in the node skills (loop.md § 6: "the runner routes, it does not
  decide"). --dry-run validates the tree and prints the route it WOULD
  walk without invoking any node skill.
  TRIGGER when: /orchestrate invoked, asked to "walk the loop", "run the loop",
  "step the loop tree", or to dry-run the loop route from a given node.
---

# Orchestrate

> **DEPRECATED.** `/orchestrate` (the executable-loop runner) is deprecated. The canonical workflow is **`AGENTS.md` § The Workflow** and the single runner is `/autopilot`. This skill is preserved as a historical reference; full removal is tracked in [#493](https://github.com/mifunedev/openharness/issues/493).

`/orchestrate` is the **runner** of the executable decision-tree of skills (`context/rules/loop.md`). It walks the tree mechanically: run a node → read that node's terminal `STATUS:` line → look the token up in the route table → advance to the next node → repeat. It honestly halts the walk when it cannot continue.

The runner embodies the loop's execution model (`context/rules/loop.md` § 6): **distributed declaration, centralized execution** — every node skill owns its own routing decision and emits its own `STATUS:` token; the runner only reads that token and moves to the declared target. **The runner routes, it does not decide.** All judgment lives in the node skills; `/orchestrate` is pure control flow.

## What the route source is

`context/rules/loop.md` is the **single source of truth** for the tree. `/orchestrate` reads:

- **§ 2 (the decision tree)** as the route table — the `Node → Driver → STATUS → next` rows. The runner MUST read these rows live each run; it MUST NOT hardcode a private duplicate of the tree, which would silently drift from the manifest.
- **§ 7 (build state)** for the wired/unwired (`☑`/`☐`) status of each node. A node marked `☐` is not yet wired and is an honest halt point, not a routable transition.

Per `context/rules/loop.md` § 3, every node skill prints exactly one `STATUS: <TOKEN>` line and it is the **last line** of its output: **the final `STATUS:` line is the only routing signal** the runner reads. The runner reads the tail, not the body — it never parses prose to infer an outcome.

## When to use

- `/orchestrate` invoked to walk the tree from a starting node through to its honest stopping point.
- `/orchestrate --dry-run` to validate the tree and preview the route without running any node skill.
- `/orchestrate --start <node>` to begin partway through the cycle (e.g. resume at `implement`).

## When NOT to use

- To run a **single** node — invoke that node's skill directly (e.g. `/retro`, `/audit`). `/orchestrate` is the multi-node walker, not a wrapper for one skill.
- To change the tree — edit `context/rules/loop.md`, not this runner. `/orchestrate` reads the tree; it never authors it.
- For the scheduled self-improvement cycle today — that is `/autopilot`. `/orchestrate` **does not modify `/autopilot`** (see § Relationship to `/autopilot`).

## Instructions

### 1. Resolve arguments

Arguments received: `$ARGUMENTS`

| Arg | Default | Meaning |
|-----|---------|---------|
| `--start <node>` | `ideate` | The node to begin the walk at. Must be a node name from `context/rules/loop.md` § 2. |
| `--dry-run` | off | Validate the tree and print the route the runner WOULD walk — following each node's **declared happy-path token** from § 2 — **without invoking any node skill**. |
| `--max-iters <N>` | `12` | Hard cap on the number of node visits. Bounds the walk, especially the `repeat → ideate` loop-back — the `repeat` continuation gate's `CYCLE-CONTINUE` route (§ *The `repeat` continuation gate*) — so a healthy cycle cannot spin forever. |

If `--start <node>` names a node absent from § 2, halt FAIL immediately ("unknown start node") and go to step 6.

### 2. Load the route table from `context/rules/loop.md`

Read `context/rules/loop.md` fresh:

- Parse **§ 2** into the route table: for each node, its driver skill/tool and the set of `(STATUS token → next node)` rows. Include the branch edges stated below § 2 (`DENIED → plan`, `AUDIT-FAIL`/`IMPL-INCOMPLETE` → `implement`, `NOT-BENEFICIAL` → revert-then-`repeat`). This parsed table — not any copy embedded in this skill — is the authority for every routing decision.
- Parse any node-specific loop-mode safety contract. A live node invocation MUST NOT publish, mutate GitHub state, or write durable docs merely to choose the next route unless that mutation is the node's explicit job and the user asked for live mode with that consequence. For the `brainstorm` node, invoke `/strategic-proposal` with: `LOOP MODE: candidate-only; do not publish roadmap, create/edit/pin GitHub issues, or write docs/roadmap.md`.
- Parse **§ 7** into the wired-state map: each node's `☑` (wired) or `☐` (unwired) marker. A node not yet marked wired is a halt point.

Do not paraphrase or cache the tree across runs; the manifest is re-read every invocation so the runner can never drift from it.

### 3. Walk the tree

Set `current = --start node`, `iters = 0`, and an empty ordered `path` list. Then loop:

1. Increment `iters`. If `iters > --max-iters`, halt with the max-iters summary (step 4d).
2. Look up `current` in the § 7 wired-state map. If `current` is unwired (`☐`), halt "node not wired" (step 4a) — do **not** invoke it.
3. Otherwise act on `current`:
   - **`repeat` (the runner-applied continuation gate)** — handle this case first, in **either** mode: `repeat` has no work-skill, so do **not** invoke a skill or read a `STATUS:` tail for it. Apply the freshness gate **mechanically** (a threshold check, not judgment — this preserves "the runner routes, it does not decide"): the `iters > --max-iters` bound (step 1) guards the `repeat → ideate` loop-back; in standalone `/orchestrate` that bound *is* the whole freshness gate, and in cron/autopilot mode the autopilot caps (invariant 4) add the queue-headroom gate. If continuation is permitted, record token `CYCLE-CONTINUE` and set `current = ideate` (the cycle closes); otherwise honest-halt. See § *The `repeat` continuation gate*.
   - **Dry-run**: print `would run <current> via <driver>` (driver from the § 2 row). Do **not** invoke the node skill. Choose the node's **declared happy-path token** — the forward-advancing token in its § 2 row (e.g. `ideate` → `IDEA-READY`, `approve` → `APPROVED`, `audit` → `AUDIT-PASS`) — record it, and set `current` to that token's target.
   - **Live**: invoke the node's driver skill (via the `Skill` tool for a `/`-skill, or the tool named in the § 2 driver column), applying any loop-mode safety contract from step 2. In particular, when `current=brainstorm`, call `/strategic-proposal` in `LOOP MODE: candidate-only; do not publish roadmap, create/edit/pin GitHub issues, or write docs/roadmap.md`. Capture its output, and read the **final `STATUS:` line** (the tail, per § 3). Validate and route on that token (step 4b/4c); on a valid token, set `current` to its § 2 target.
4. Append `(node, emitted-token)` to `path` and continue from the top with the new `current`.

The runner only ever reads a node's `STATUS:` tail and looks the token up in § 2. It performs no judgment of the node's body — judgment belongs to the node (§ 6).

### 4. Halt conditions — all honest exits

Every stop is explicit. Silence is failure, never success (`context/rules/loop.md` invariant 5). The four halt conditions:

| # | Condition | Halt | Reason string |
|---|-----------|------|---------------|
| a | `current` is unwired per § 7 (`☐`) | HALT (honest stop, not an error) | `node not wired: <node>` |
| b | A live node emitted **no** `STATUS:` line | HALT FAIL | `no STATUS emitted by <node> (silence = failure, invariant 5)` |
| c | The emitted token is **absent** from that node's § 2 row | HALT FAIL | `unknown token <TOKEN> for <node> — not in loop.md § 2 (a bug the runner rejects)` |
| d | `iters > --max-iters` | HALT (bound reached) | `max-iters <N> reached` |

Condition (a) is now rare on a forward walk: **every** § 2 node is wired (`☑` in § 7), so a live walk from `ideate` runs the full spine `ideate → … → compress → benchmark`, `benchmark`'s `BENEFICIAL`/`NOT-BENEFICIAL` routes to `repeat`, and `repeat`'s `CYCLE-CONTINUE → ideate` closes the cycle — so the walk now terminates on the `--max-iters` bound (condition d), not an unwired halt. Condition (a) remains the **correct** response to any *future* `☐` node (the runner refuses to fabricate a transition across an edge that does not yet exist) — an honest stop, not a bug. Conditions (b) and (c) are genuine failures the runner surfaces rather than papering over.

### 5. Print the walk summary

Always print a final summary, on every halt path:

```
## Loop Walk

Mode: live | dry-run    Start: <node>    Max-iters: <N>

Path:
  1. <node>  → STATUS: <TOKEN>  → <next-node>
  2. <node>  → STATUS: <TOKEN>  → <next-node>
  ...
  N. <node>  → <halt marker>

Halt: <condition a|b|c|d> — <reason string>
```

The path lists every node visited in order, the token each emitted (or, for dry-run, the declared happy-path token it would emit), and the halt reason.

### 6. Memory Improvement Protocol

Run at the end of **every** invocation — live, dry-run, or halt-FAIL. See `context/rules/memory.md` for the canonical protocol.

**a) Log** — get the UTC time and date, then append to `memory/<today>/log.md`:

```bash
date -u +%H:%M
TODAY=$(date -u +%Y-%m-%d)
mkdir -p "memory/$TODAY"
```

```markdown
## Orchestrate -- HH:MM UTC
- **Result**: OP | DRY-RUN | FAIL
- **Path**: <node → ... → halt-node> (<count> nodes visited)
- **Halt**: <condition a|b|c|d> — <reason>
- **Observation**: <one sentence>
```

**b) Qualify** — did a node emit a token absent from its § 2 row? Did a wired node go silent? Did the route § 2 declares disagree with what a node actually emitted? Any of these is a tree/skill inconsistency worth a note.

**c) Improve** — if the run revealed a durable inconsistency (not a one-off), append a one-bullet lesson to `memory/MEMORY.md` under `## Lessons Learned`; do not duplicate a lesson already in `context/IDENTITY.md` or a rule.

## Relationship to `/autopilot`

`/orchestrate` is a standalone tree walker. It **does not modify `/autopilot`**. Today `/autopilot` is the scheduled runner that walks phases 1–4 of the cycle (select → `/ship-spec` → reconcile); making `/autopilot` become `/orchestrate`'s scheduled invocation — wiring the cron-driven self-improvement cycle to this runner — is the **gated Layer-3 step in `context/rules/loop.md` and is out of scope for this skill**. `/orchestrate` neither edits nor invokes `/autopilot`; the two coexist until that integration is deliberately taken on.

## The `repeat` continuation gate

`repeat` is the loop's **cycle-closing** node (`context/rules/loop.md` § 2: `repeat → ideate`) and the **one node the runner applies itself** — it has no work-skill and no `## Handoff`, exactly as `/orchestrate` is "the runner, not a node" (below). Its driver is the **freshness gate** (invariant 4): a mechanical threshold check, never judgment.

When the walk reaches `repeat`:

- the `iters > --max-iters` bound (§ 3 step 1) guards the `repeat → ideate` loop-back so the cycle cannot spin forever;
- in **standalone `/orchestrate`** that bound *is* the whole freshness gate (no PRs are created, so caps do not apply);
- in **cron/autopilot mode** the autopilot caps (10 total · 6 daily) are the additional queue-headroom gate;
- if continuation is permitted the runner records `STATUS: CYCLE-CONTINUE` and routes to `ideate`; otherwise it honest-halts (caps reached / bound hit).

Because the gate is a threshold check and not a judgment call, applying it keeps the runner faithful to § 6 ("the runner routes, it does not decide"): `repeat` is the sole node whose token the runner emits, and it emits it mechanically. With `benchmark` now wired, the forward walk reaches `repeat` as the live cycle-close (`… → benchmark → repeat → ideate`), bounded by `--max-iters`.

## `/orchestrate` is the runner, not a node

`/orchestrate` is the **runner** row in `context/rules/loop.md` § 7 — it orchestrates nodes; it is **not itself a node in the tree**. Therefore `/orchestrate`:

- does **not** carry a `## Handoff` section (nodes declare handoffs; the runner reads them),
- does **not** emit a routing `STATUS:` token of its own, and
- does **not** route itself into the tree — it walks the nodes, it is not walked.

Its only terminal output is the walk summary (§ 5) plus the memory log entry (§ 6).

## Anti-patterns

- **Hardcoding the tree.** Embedding a static copy of the § 2 route table in this skill as its source of truth. The table is read live from `context/rules/loop.md` every run; a private duplicate drifts from the manifest.
- **Inferring success from silence.** A node that emits no `STATUS:` line has failed (invariant 5). Never treat a silent or crashed node as a pass — halt FAIL (condition b).
- **Routing on prose.** Reading a node's body to guess its outcome. The runner reads only the final `STATUS:` line (§ 3) and looks the token up in § 2.
- **Fabricating a transition across an unwired node.** Reaching a `☐` node in § 7 and inventing its successor. That is the "node not wired" honest halt (condition a), not a place to improvise.
- **Deciding instead of routing.** The runner makes no judgment calls; if a routing choice feels like a decision, it belongs in the node skill, not here (§ 6).
- **Touching `/autopilot`.** Wiring this runner into the scheduled cron is the gated Layer-3 step — out of scope; `/orchestrate` does not modify `/autopilot`.
