# Recursive Delegation

> Reference: *Recursive Agent Optimization (RAO)* — arXiv 2605.06639, Gandhi et al., CMU + Amazon AGI Labs, May 2026.

Extends `context/rules/advisor-model.md` for the case where a child sub-agent's task is itself multi-step and may justify its own delegation. The 2-step / 3-step / multi-turn variants in `advisor-model.md` all assume a **flat** tree (root → child). This rule adds the protocol for **multi-level** trees (root → child → grandchild).

## When to Use

| Trigger — recurse | Anti-trigger — stay flat |
|-------------------|--------------------------|
| A child's scope spans several files and could be parallelized further | The child's task fits one `advisor-model.md` 5-field briefing |
| The bottleneck is **context capacity** — one child can't read the full file set without overflow | The full task fits in one sub-agent's context |
| Independent sub-sub-trees each need a large, disjoint context | The orchestrator is delegating application code work (out of scope — see § Orchestrator Boundary) |
| Synthesis is separable from analysis (you'll re-aggregate at multiple levels) | Depth would exceed 4 — flatten instead |

## Bounding Compute

Unbounded recursion burns budget silently. Every multi-level delegation MUST carry explicit limits, communicated in the briefing.

| Field | Default | Hard cap | Required when |
|-------|---------|----------|---------------|
| `Max depth` | 1 | 4 | The child MAY itself delegate |
| `Step budget` | (skill-specific) | — | Always, when `Max depth` ≥ 2 |

- `Max depth` counts edges from the root invocation. Root → child = depth 1. Child → grandchild = depth 2.
- A child MUST NOT recurse if `Max depth` is absent or `1`. Silence on this field means "do not delegate further."
- A child that recurses MUST decrement: pass `Max depth: N−1` to its own children.
- Always reserve capacity for the parent's synthesis turn. If a child receives `Step budget: N`, it MUST allow at least one final turn for itself to integrate its grandchildren's outputs.

## Briefing the Child — Context Block

For multi-level briefings, extend the `advisor-model.md` 5-field format with an optional **`Context`** block. Large material the child cannot derive itself (prior-wave results, transcript excerpts, file dumps) goes here, never inside `Goal`.

```
## Advisor Briefing

**Goal**: <one sentence>
**Max depth**: <N>          ← present only if recursion is authorized
**Step budget**: <N>        ← present only if Max depth ≥ 2

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

Rules:
- MUST NOT paste raw file contents into `Goal` or `Constraints`. Link the path under `Start here` and let the child `Read` it.
- MUST include `Context` only when the child cannot reach the material via `Start here` (e.g., it lives in a prior agent's output, not on disk).

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

1. **Parent authorizes** by including `Max depth: N` (N ≥ 2) and `Step budget` in the briefing.
2. **Child reads** the authorization before deciding to recurse. Absent → flat execution only.
3. **Child decrements** `Max depth` when spawning grandchildren.
4. **Child applies this rule** end-to-end at the next level (briefing format, Context block, structured returns, bounding).
5. **Parent receives** structured returns and synthesizes — never just passes them through.

Use parallel spawn (one assistant message, multiple `Agent` calls) whenever the children are independent — same rule as `delegate/SKILL.md` Step 5. Recursion is orthogonal to parallelism: a depth-2 child can itself spawn parallel grandchildren.

## Recursion as Context Expansion

The main inference-time payoff of recursion in this harness is **context expansion**, not just parallelism. Each child receives a fresh context window, so a sub-tree can process a file set that would not fit alongside the parent's working memory.

Use multi-level delegation primarily when:
- The total context required to solve the task exceeds what one agent can hold.
- Independent sub-trees each need to read a large, disjoint file set.

This is the test for whether to recurse at all. If the bottleneck is reasoning time, not context capacity, flat parallel wave execution via `/delegate` is usually enough.

## Orchestrator Boundary

`CLAUDE.md` forbids the orchestrator from writing application code. Recursive delegation does not relax this: orchestrator-side trees default to `Max depth: 1` and MUST NOT spawn sub-agents whose authorized task crosses into in-sandbox application work. Multi-level trees are appropriate for orchestrator workflows that decompose **rule/docs/skill changes** (this PR's own drafting being the canonical example) — not for shipping product code on the agent's behalf.

In-sandbox agents (Claude / Pi running inside `openharness`) are not bound by this rule — they operate inside the sandbox boundary CLAUDE.md draws around them.

## Anti-Patterns

- **Depth without authorization** — a child spawns grandchildren without `Max depth` in its briefing. Cost is invisible to the parent; failures are hard to diagnose. If you didn't authorize it, the child must not do it.
- **Context in `Goal`** — pasting a long transcript into the goal sentence. Use the `Context` block, or `Start here` + a path.
- **Free-prose returns when structure is needed** — parent tries to parse a child's narrative output. Specify the schema in `Acceptance criteria`.
- **Flat tree in disguise** — `Max depth: 4` set, but every level spawns exactly one child. That is sequential delegation, not recursive — flatten it back to depth 1 with a multi-turn briefing per `advisor-model.md`.
- **Recursing for reasoning, not context** — using multi-level delegation when one flat wave would have done it. The token cost of the tree exceeds the benefit. Recurse for context-capacity reasons; parallelize (flat) for throughput reasons.
- **Orchestrator → application code via recursion** — using a depth-2 sub-agent to write code inside the sandbox. Crosses the CLAUDE.md boundary regardless of how it's framed.

## See Also

- `context/rules/advisor-model.md` — the flat 2-step / 3-step / multi-turn parent rules this one extends.
- `.claude/skills/delegate/SKILL.md` — parallel wave execution (the orthogonal axis).
- `context/rules/repo-layout-source.md` — why this rule does not duplicate the layout tree.
