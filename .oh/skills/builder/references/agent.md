# Agent Builder Reference

Author a reusable specialist that runs in an isolated context with an explicit
role, tool boundary, and output contract. In Open Harness, write the canonical
artifact to `.oh/agents/<name>.md`; provider surfaces expose that directory through
symlinks.

## Contents

1. [Choose an agent](#choose-an-agent)
2. [Discover the role](#discover-the-role)
3. [Design the definition](#design-the-definition)
4. [Frontmatter](#frontmatter)
5. [Write the body](#write-the-body)
6. [Validate](#validate)
7. [Report](#report)

## Choose an agent

Use an agent when the work benefits from a durable specialist identity, isolated
context, reusable judgment, and a clear delegation boundary. Do not create one for:

- a one-off task that the current assistant can complete directly;
- a repeatable user-invoked procedure, which belongs in a task-style skill;
- background knowledge or file-specific guidance, which belongs in a reference
  skill, optionally with `paths:`;
- generic exploration, planning, or execution already covered by a built-in or
  existing project agent.

Before authoring, compare the proposed role with nearby agents and built-ins. Extend
an existing role when the new responsibilities share the same evidence, tools, and
success criteria. Split only when the specialist has a distinct delegation trigger
and can return a coherent result independently.

## Discover the role

1. Read applicable project instructions and the closest agent definitions.
2. Inspect the code, docs, tests, artifacts, and workflows the specialist must
   understand. Do not invent project architecture or domain rules.
3. Define:
   - primary user and delegation triggers;
   - in-scope decisions and explicit exclusions;
   - evidence the agent must inspect before advising;
   - collaboration seams with adjacent agents;
   - output shape and measurable completion criteria.
4. Select the minimum tool set. A read-only advisor normally needs `Read, Glob,
   Grep` and sometimes `Bash` for known non-mutating inspection. Add `Edit` or
   `Write` only when mutation is part of the role.
5. Choose a model only when the role consistently warrants a cost or latency
   override. Omit `model` to inherit by default.

## Design the definition

A strong agent definition has one center of gravity. Include only sections that
change its behavior:

- **Role**: one paragraph naming the specialist, responsibility, and value.
- **Scope and boundaries**: concrete in-scope and out-of-scope decisions.
- **Tool policy**: how each allowed tool may be used; note that allowing `Bash`
  does not make it read-only.
- **Evidence discipline**: sources to inspect and how to label evidence,
  inference, assumptions, or uncertainty when relevant.
- **Workflow**: an adaptive sequence for discovery, analysis, and completion.
- **Collaboration seams**: when to hand work to existing specialists rather than
  duplicating them.
- **Output contract**: concise templates suited to actual requests.
- **Quality bar**: observable success and failure conditions.

Avoid encyclopedic tutorials, generic claims of excellence, hard-coded stack
assumptions, and speculative file maps. Agents start with fresh context; tell them
how to discover facts rather than embedding facts likely to drift.

## Frontmatter

Use the repository's demonstrated portable subset unless a target provider is
explicitly selected:

```yaml
---
name: design-reviewer
description: |
  Focused description of what the agent does and when to delegate to it.
  Use proactively when <specific observable triggers>.
tools: Read, Glob, Grep, Bash
model: sonnet
---
```

Rules:

- `name`: lowercase kebab-case and equal to the filename stem.
- `description`: front-load role and positive triggers; add meaningful negative
  triggers when neighboring roles could overlap.
- `tools`: comma-separated least-privilege allowlist. Omission may inherit all
  parent tools, including provider integrations, so omit only deliberately.
- `model`: optional. Prefer inheritance; justify `opus`, `sonnet`, or `haiku`
  from stable role complexity rather than current-session preference.
- Provider-only fields may be used only after inspecting that provider's current
  docs and local examples. Do not imply unsupported fields are portable.

For a behaviorally read-only agent that includes `Bash`, state explicit
non-mutating command limits in the body. Frontmatter cannot express a read-only
Bash subset.

## Write the body

1. Start with the role and outcome, not a repeat of frontmatter.
2. State boundaries before the workflow so the agent cannot expand its remit while
   gathering context.
3. Make discovery repository-grounded: applicable instructions first, then the
   narrowest relevant sources.
4. Make the workflow proportional. Small reviews should not be forced through
   irrelevant exhaustive phases.
5. Define how to handle missing evidence, blocked decisions, and unsafe requests.
6. Provide output shapes with required evidence and decisions, but avoid a single
   rigid template for unrelated request types.
7. Name adjacent agents and handoff seams only when those agents actually exist.
8. Keep the definition concise enough to leave working context for the delegated
   task. Move stable long-tail material to a skill if multiple agents need it.

## Validate

- [ ] File is `.oh/agents/<name>.md` in an Open Harness layout, not a provider
      mirror.
- [ ] Frontmatter has exactly one opening and closing delimiter.
- [ ] `name` matches the filename and is lowercase kebab-case.
- [ ] Description states positive triggers and avoids neighboring-role overlap.
- [ ] Tool access is least privilege; body restrictions agree with frontmatter.
- [ ] Model is omitted or explicitly justified.
- [ ] Referenced agents, paths, commands, and tools exist.
- [ ] Role, exclusions, workflow, collaboration seams, and outputs agree.
- [ ] No invented project facts or claims that behavioral limits are enforced by
      frontmatter.
- [ ] Provider-link check passes when available.
- [ ] File remains below 500 lines.

## Report

Return:

```markdown
## Agent Created: <name>

**File**: `.oh/agents/<name>.md`
**Role**: <one sentence>
**Tools**: <allowlist and why>
**Model**: <inherit or override and why>
**Boundaries**: <key exclusions>
**Validation**: <checks and results>
```
