---
name: imagine
description: |
  One-shot draft PRD sketch from a fuzzy scenario. Writes a single
  artifact to .claude/specs/<slug>/spec.md — a path that is gitignored
  by default (`.gitignore:51`), so the spec never enters git history.
  Includes a mermaid diagram. Output is purpose-built as input for
  `/ship-spec --plan .claude/specs/<slug>/spec.md`, which bypasses
  /prd's clarifying questions when a plan is provided. No clarifying
  questions in /imagine itself — generate directly from the <scenario>
  argument.
  TRIGGER when: /imagine invoked, or asked to "sketch a spec",
  "imagine a feature", "draft a quick PRD", "what if we built X".
argument-hint: "<scenario>"
---

# Imagine

One-shot generator that turns a fuzzy scenario into a draft PRD sketch under `.claude/specs/<slug>/spec.md`. The output is **scratch-input for `/ship-spec`** — gitignored by default, never committed, designed to be edited locally and then passed via `/ship-spec --plan <path>` to the existing formalization pipeline.

## When to use

- The user has an idea but the shape is still fuzzy — they don't want to sit through `/prd`'s 3–5 lettered Q&A yet.
- The user wants a tangible artifact they can edit before formalizing.
- Quick what-if exploration: "imagine a /summarize command", "what if we added X".

## When NOT to use

- **`/prd`** — when the feature is already well-defined and ready for a structured PRD with numbered FRs and acceptance criteria. `/imagine` outputs a sketch, not a PRD.
- **`/ship-spec`** — when ready for the full pipeline (PRD → critics → issue → branch → draft PR). `/imagine` produces input for `/ship-spec`; it does not replace it.
- **`/interview`** — when the goal is to narrow scope on a *known* task. `/imagine` is for *generating* a new task shape from a scenario.

## The job

1. Receive `<scenario>` as a free-text argument.
2. Derive a slug from the scenario.
3. One-shot generate the spec body (no clarifying questions).
4. Write `.claude/specs/<slug>/spec.md`.
5. Print the path and the next-step command.
6. Append a Memory Protocol entry.

## Step 1 — Parse `<scenario>` and derive slug

Arguments received: `$ARGUMENTS`

The slug rule is **the same one `/prd` uses** (see `.claude/skills/prd/SKILL.md` § Output → Feature name). Do not invent a new rule.

- Lowercase, kebab-case, charset `[a-z0-9-]+`, **≤5 words**, must not equal `archive`.
- Derive the slug from the scenario by extracting the salient noun phrase (the thing being imagined), not by truncating the full scenario.
  - `imagine a slack /summarize command that condenses the last N messages` → `slack-summarize-command`
  - `imagine a dry-run mode for /release` → `release-dry-run-mode`
- If the derived slug is empty, exceeds 5 words, contains `/`, or equals `archive`, reject and ask the user for an explicit short name.

## Step 2 — Compose `spec.md`

Generate these sections **in this exact order**:

```markdown
# Spec: <Title>

## Scenario
<verbatim user input>

<one-paragraph framing: what's being imagined, in the model's own words>

## Intent
<what problem this addresses; why someone would want it now>

## Sketch
<1–3 paragraphs of high-level shape — entry points, surfaces touched, the basic flow>

## Diagram
```mermaid
<one diagram — see § Diagram selection>
```

## Rough goals
- <goal 1>
- <goal 2>
- <goal 3>
- ...

## Story seeds
- <one-line story stub>
- <one-line story stub>
- ...

## Open questions for /prd
- <ambiguity the user should resolve when promoting to a real PRD>
- ...
```

### Diagram selection

Pick the diagram type that fits the scenario shape — never a placeholder.

| Scenario shape | Diagram |
|---|---|
| A workflow or pipeline | `flowchart TD` |
| Multiple actors interacting (user + system + service) | `sequenceDiagram` |
| An entity moving through states | `stateDiagram-v2` |
| A taxonomy / decision tree | `flowchart LR` |

### Section size bounds

- `## Sketch` ≤ 3 paragraphs.
- `## Rough goals` 3–6 bullets.
- `## Story seeds` 3–7 bullets, each a one-liner. **No acceptance criteria** — those are `/prd`'s job.
- `## Open questions for /prd` 2–6 bullets.

## Step 3 — Write `.claude/specs/<slug>/spec.md`

```bash
mkdir -p .claude/specs/<slug>
# then Write the file
```

**Rerun policy: overwrite in place.** If `.claude/specs/<slug>/spec.md` already exists, overwrite it. The path is gitignored — there is no history to preserve. Do not append `-1`, `-2`, or write a timestamped variant.

## Step 4 — Print the handoff

Output exactly two lines (no preamble, no summary):

```
Spec: .claude/specs/<slug>/spec.md
Next: /ship-spec --plan .claude/specs/<slug>/spec.md
```

## Step 5 — Memory Protocol

Per `context/rules/memory.md`, append to `memory/<UTC-date>/log.md` (create the dated directory if missing):

```markdown
## imagine -- HH:MM UTC
- **Result**: OP
- **Scenario**: <one-line summary of the input>
- **Slug**: <slug>
- **Path**: .claude/specs/<slug>/spec.md
- **Observation**: <one sentence on whether the scenario was rich enough to one-shot, or whether the open-questions section had to carry the weight>
```

Then run the qualify/improve loop per `context/rules/memory.md`. Lessons about scenario-quality patterns (e.g. "scenarios under 10 words usually need a follow-up `/prd` pass") may belong in `memory/MEMORY.md`.

## Anti-patterns

- **Asking clarifying questions.** Breaks the one-shot contract. If the scenario is too vague, push the ambiguities into `## Open questions for /prd`; do not interrupt.
- **Writing a full PRD.** Story seeds are one-liners. Numbered functional requirements, acceptance criteria, success metrics — all `/prd`'s job, not this skill's.
- **Skipping the mermaid diagram.** The diagram is the cheapest forcing function for "did I actually understand the scenario?" Pick a real type; never emit a placeholder or `// TODO: diagram`.
- **Writing outside `.claude/specs/<slug>/`.** No spillover into `tasks/`, `memory/<topic>.md`, `wiki/`, or root. Those surfaces have their own skills.
- **Auto-chaining into `/ship-spec`.** Keep the seam explicit. The user edits the spec before formalizing — that's the entire reason the seam exists.
- **Truncating the scenario into the slug.** `imagine a long thirty word scenario about ...` → derive the noun phrase (`thirty-word-scenario` or `long-scenario`), not the first five words verbatim.

## Why this skill exists

The harness already has `/prd` (Q&A → 9-section PRD) and `/ship-spec` (`/prd` → critics → `/ralph` → issue → branch → draft PR). What was missing was a **fast upstream sketch** for fuzzy ideas: something the user can iterate on locally before answering structured questions. `/imagine` fills that gap without polluting the repo — `.claude/specs/*` is gitignored, so every sketch is scratch by design.
