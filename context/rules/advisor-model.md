# Advisor Model Pattern

> Reference: *Advisor Models: Synthesizing Instance-Specific Guidance for Steering Black-Box LLMs* — arXiv 2510.02453v2

A stronger model acts as the **advisor** and a cheaper/faster model (or sub-agent) acts as the **executor**. The advisor reads context the executor won't have, synthesizes a briefing, then hands off. Roles — not specific model vendors — are what matter.

## When to Use

| Trigger — use the pattern | Anti-trigger — skip it |
|--------------------------|------------------------|
| Task is multi-step or touches several files | Trivial one-shot edit (briefing cost > task cost) |
| Executor is a sub-agent or cheaper model | Advisor is doing the work itself end-to-end |
| Task involves codebase-specific conventions the executor wouldn't know | Task is fully self-contained in a single obvious file |
| A wrong first move is expensive to unwind | Executor has full context already |

## Picking the Pair

Pick any two models where there is a meaningful capability gap:

- **Advisor** — the stronger / higher-reasoning tier in whatever family you're using. It reads context, synthesizes, writes the briefing.
- **Executor** — a faster/cheaper tier from any family. It consumes the briefing and does the work.

*Example (Claude family, for illustration):* Opus as advisor (1M context is ideal for orchestrator work that spans many files), Sonnet as executor for typical implementation, Haiku for mechanical tasks. Translate the same shape to whatever family the session is actually using.

## Advisor Responsibilities

Before invoking the `Agent` tool, produce a **briefing** containing exactly these five fields — nothing more:

1. **Goal** — the task restated in one sentence
2. **Constraints / gotchas** — non-obvious rules specific to *this* instance (not generic advice the executor already knows)
3. **Acceptance criteria** — concrete, checkable conditions for done
4. **Start here** — files, symbols, or commands to read first
5. **Out of scope** — what the executor must not touch or decide

Keep the briefing tight. If a point is generic best-practice (not instance-specific), drop it.

## Executor Responsibilities

- Consume the briefing as authoritative context — do not re-derive what the advisor already distilled
- Execute against the acceptance criteria
- Report back: what was done, what files changed, any blockers

## Handoff Format

```
## Advisor Briefing

**Goal**: <one sentence>

**Constraints / gotchas**:
- <instance-specific item>
- ...

**Acceptance criteria**:
- <checkable item>
- ...

**Start here**: <file paths, symbol names, or commands>

**Out of scope**: <explicit exclusions>

---
<original task prompt follows>
```

## Pipeline Variants

| Variant | When | Mechanics |
|---------|------|-----------|
| **2-step** | Straightforward delegation | Advisor writes briefing → `Agent` tool with briefing prepended to prompt |
| **3-step** | First attempt needs steering | Executor makes attempt → advisor reviews output → advisor writes targeted critique as a second briefing → executor revises |
| **Multi-turn agentic** | Long runs (>10 steps) | Advisor provides a briefing every N steps, receiving the executor's intermediate observations before writing the next guidance block |

## Mapping to This Harness

The session model (see `.claude/settings.local.json` → `model`) is the advisor. Use the `Agent` tool with `subagent_type: implementer` or `general-purpose` to hand off to an executor. The advisor output IS the prompt prefix passed to that tool call — no new mechanics needed.

```
Agent(
  subagent_type: "implementer",
  prompt: "<briefing block>\n\n<original task>"
)
```

For 3-step: call `Agent`, capture output, write a critique briefing, call `Agent` again with the critique prepended.

## Anti-Patterns

- **Delegating understanding** — "based on your findings, fix it" is not a briefing; the advisor must do the synthesis before handoff
- **Generic advice** — if the executor could have written the guidance itself, the advisor added no value; every constraint must be instance-specific
- **Skipping the advisor for cheap models** — cheaper executors have *less* context, not more; the pattern is most valuable there, not least
- **Overloading the briefing** — the briefing is not a tutorial; link files, do not paste content; state constraints, do not explain why
- **Same-tier advisor and executor** — if there's no capability gap, the advisor step is pure overhead; either drop it or pick a cheaper executor
