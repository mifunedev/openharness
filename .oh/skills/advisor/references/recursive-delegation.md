# Recursive Delegation

> Reference: *Recursive Agent Optimization (RAO)* — arXiv 2605.06639, Gandhi et al., CMU + Amazon AGI Labs, May 2026.
>
> RAO is an **RL training** paper. Its quantitative gains (depth-12 generalization, 2.5× wall-clock reduction, context-overflow handling) are properties of a *trained* policy. This harness uses an untrained inference-only model; only the **structural patterns** below transfer. Treat the fields in this rule as strong conventions, not runtime-enforced caps — an untrained model may ignore them.

Extends the `/advisor` skill (`../SKILL.md`) for multi-level delegation trees (root → child → grandchild).

## When to Use

| Trigger — recurse | Anti-trigger — stay flat |
|-------------------|--------------------------|
| A child's scope spans several files and would itself benefit from parallel decomposition | The child's task fits one `advisor-model.md` 5-field briefing |
| The child's briefing would exceed one sub-agent's effective context window | The full task fits in one sub-agent's context |
| Independent sub-trees each need a large, disjoint file set | The orchestrator is delegating application code work (out of scope — see § Orchestrator Boundary) |
| Synthesis is separable from analysis (you'll re-aggregate at multiple levels) | Depth would exceed 4 — flatten instead |

## Bounding Compute

Unbounded recursion burns budget silently. Every multi-level delegation MUST carry explicit limits, communicated in the briefing.

| Field | Default | Hard cap | Required when |
|-------|---------|----------|---------------|
| `Max depth` (edges from root: child = 1, grandchild = 2) | 1 | 4 | The child MAY itself delegate |
| `Max children per level` | 5 | 5 | Always, when `Max depth` ≥ 2 |
| `Step budget` | (skill-specific) | — | Always, when `Max depth` ≥ 2 |

- A child MUST NOT recurse if `Max depth` is absent or `1`. Silence on this field means "do not delegate further."
- A child that recurses MUST decrement: pass `Max depth: N−1` to its own children.
- A child MUST NOT re-issue or rewrite a sibling's briefing to lift its own depth or scope.
- Always reserve capacity for the parent's synthesis turn. If a child receives `Step budget: N`, it MUST allow at least one final turn for itself to integrate its grandchildren's outputs.
- These fields are **prompt-level conventions**, not runtime caps. Honor them rigorously when you write briefings; do not assume a child will refuse a malformed briefing.

## Briefing the Child — Context Block

For multi-level briefings, extend the `advisor-model.md` 5-field format with an optional **`Context`** block. Material the child cannot derive itself (prior-wave results, transcript excerpts, content not on disk) goes here, never inside `Goal`.

```
## Advisor Briefing

**Goal**: <one sentence>
**Max depth**: <N>                  ← present only if recursion is authorized
**Max children per level**: <N>     ← present only if Max depth ≥ 2
**Step budget**: <N>                ← present only if Max depth ≥ 2

**Constraints / gotchas**:
- ...

**Acceptance criteria**:
- Return format: <schema — see § Structured Returns>
- ...

**Start here**: <paths, symbols, commands>

**Out of scope**: <exclusions>

**Context** (optional):
<material the child needs but cannot derive from Start here>
```

MUST include `Context` only when the child cannot reach the material via `Start here` (e.g., it lives in a prior agent's output, not on disk). The "no raw file contents in `Goal`" rule from `advisor-model.md` § Anti-Patterns still applies; the `Context` block is the place for material that has to travel with the briefing.

## Structured Returns

When the parent will consume the child's output **programmatically** (merge into a table, feed into the next wave, gate a decision), the briefing's `Acceptance criteria` MUST name the return schema. Free prose is reserved for human-review tasks.

| Use case | Schema to specify in `Acceptance criteria` |
|----------|--------------------------------------------|
| Per-file change report | Markdown table `\| File \| Action \| Summary \|` |
| Pass/fail gate | First line is literally `PASS` or `FAIL` |
| Risk list for the parent to rank | Bullet list, one risk per bullet, `SEVERITY: <claim>` shape |
| Sub-task list for the next wave | JSON object matching `{ tasks: [{id, title, deps}] }` |

State the schema directly:

```
**Acceptance criteria**:
- Return a JSON object matching `{ findings: [{severity, claim, file}] }`
- First line of response is `PASS` or `FAIL`
```

## Multi-Level Delegation Protocol

A child sub-agent invoked with a `subagent_type` whose tool list includes `Agent` (e.g., `implementer`, `general-purpose`) MAY delegate further. Use this protocol:

1. **Parent authorizes** by including `Max depth: N` (N ≥ 2), `Max children per level: ≤5`, and `Step budget` in the briefing.
2. **Child reads** the authorization before deciding to recurse. Absent → flat execution only.
3. **Child decrements** `Max depth` when spawning grandchildren and re-applies this rule.
4. **Parent receives** structured returns and **synthesizes** — never just passes them through. A mid-tree node that forwards children's outputs verbatim adds zero value (see § Anti-Patterns).

Use parallel spawn (one assistant message, multiple `Agent` calls) whenever the children are independent — the same parallelism rule as `delegate/SKILL.md` § 5 *Execute waves* sub-step (a). Recursion is orthogonal to parallelism: a depth-2 child can itself spawn parallel grandchildren.

The paper's `async launch_subagent` runs inside a Python REPL with `asyncio` coroutines and shared variable state. The harness `Agent` tool is **stateless and synchronous** from the parent's perspective. "Parallel" here means multiple `Agent` calls in one assistant turn, not concurrent Python tasks — design briefings accordingly.

## Orchestrator Boundary

`CLAUDE.md` forbids the orchestrator from writing application code. Recursive delegation does not relax this: orchestrator-side trees default to `Max depth: 1`, and multi-level trees are appropriate only for orchestrator workflows that decompose **rule/docs/skill changes** — not for shipping product code on the agent's behalf. In-sandbox agents fall under `CLAUDE.md`'s sandbox-side rules, not this rule.

## Anti-Patterns

- **Depth without authorization** — a child spawns grandchildren without `Max depth` in its briefing. Cost is invisible to the parent; failures are hard to diagnose. If you didn't authorize it, the child must not do it.
- **Context in `Goal`** — pasting a long transcript into the goal sentence. Use the `Context` block, or `Start here` + a path.
- **Free-prose returns when structure is needed** — parent tries to parse a child's narrative output. Specify the schema in `Acceptance criteria`.
- **Flat tree in disguise** — `Max depth: 4` set, but every level spawns exactly one child. That is sequential delegation, not recursive — flatten it back to depth 1 with a multi-turn briefing per `advisor-model.md`.
- **Synthesis pass-through** — a mid-tree node receives structured returns from its children and forwards them verbatim to its own parent instead of integrating them. The mid-tree node adds zero value; either it should be doing real synthesis, or it should not exist (collapse the level).
- **Recursing for reasoning, not context** — using multi-level delegation when one flat wave would have done it. The token cost of the tree exceeds the benefit. Recurse when the briefings won't fit; parallelize (flat) for throughput.
- **Orchestrator → application code via recursion** — using a depth-2 sub-agent to write code inside the sandbox. Crosses the `CLAUDE.md` boundary regardless of how it's framed.
- **Sideways scope escalation** — a child rewriting a sibling's briefing to lift its depth, budget, or scope. Authorization flows down the tree from the original advisor only.

## See Also

- `../SKILL.md` (the `/advisor` skill) — the flat 2-step / 3-step / multi-turn parent rules this one extends.
- `.claude/skills/delegate/SKILL.md` — parallel wave execution (the orthogonal axis); see § 5 *Execute waves* for the parallel-spawn primitive.
- `CLAUDE.md` § *What You Do NOT Do* — the orchestrator-vs-application-code boundary referenced above.
